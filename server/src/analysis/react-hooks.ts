/**
 * React state-flow analysis (Phase 3).
 *
 * Static symbol resolution alone cannot express React's state model, so this
 * module layers *syntactic heuristics* on top of it. It recognises the shapes
 * React actually uses:
 *
 *   - `const [count, setCount] = useState(0)` → state + its setter
 *   - `useReducer` → state + dispatch
 *   - `const v = useContext(Ctx)`             → consumer, linked to providers
 *   - `export const Ctx = createContext(…)`   → providers + all consumers
 *   - `<Child prop={count} />`                → state crossing a component boundary
 *
 * These are pattern matches, not type-level proofs: a context resolved through
 * an alias, or a provider rendered dynamically, will not be found. Such gaps are
 * reported in `notes` rather than silently omitted.
 */
import { Node, Project, SyntaxKind, type CallExpression, type JsxAttribute } from "ts-morph";
import { GraphAccumulator } from "./graph-builder.js";
import { collectDeclarations, enclosingFunction, locate, resolveUserPath } from "./symbols.js";
import type { GraphNode, TraceResult } from "./types.js";

const STATE_HOOKS = new Set(["useState", "useReducer"]);

export interface StateFlowOptions {
  symbol: string;
  filePath?: string;
  projectRoot: string;
}

/** Name of the function being called, for both `f()` and `obj.f()`. */
function calleeName(call: CallExpression): string | undefined {
  const expression = call.getExpression();
  if (Node.isIdentifier(expression)) return expression.getText();
  if (Node.isPropertyAccessExpression(expression)) return expression.getName();
  return undefined;
}

/** The hook call that produced a declaration, if any. */
function hookInitializer(decl: Node): { hook: string; call: CallExpression } | undefined {
  const variable = Node.isVariableDeclaration(decl)
    ? decl
    : decl.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  const initializer = variable?.getInitializer();
  if (initializer && Node.isCallExpression(initializer)) {
    const hook = calleeName(initializer);
    if (hook) return { hook, call: initializer };
  }
  return undefined;
}

/** If a reference sits inside a JSX attribute, describe the crossing. */
function jsxPropContext(ref: Node): { attribute: string; element: string } | undefined {
  const attr = ref.getFirstAncestorByKind(SyntaxKind.JsxAttribute);
  if (!attr) return undefined;

  const opening =
    attr.getFirstAncestorByKind(SyntaxKind.JsxOpeningElement) ??
    attr.getFirstAncestorByKind(SyntaxKind.JsxSelfClosingElement);

  return {
    attribute: attr.getNameNode().getText(),
    element: opening?.getTagNameNode().getText() ?? "<unknown>",
  };
}

/** Read the `value={…}` expression text off a Provider element. */
function providerValueText(attributes: JsxAttribute[]): string | undefined {
  const valueAttr = attributes.find((a) => a.getNameNode().getText() === "value");
  const initializer = valueAttr?.getInitializer();
  if (initializer && Node.isJsxExpression(initializer)) {
    return initializer.getExpression()?.getText();
  }
  return initializer?.getText();
}

/**
 * Find `<Ctx.Provider value={…}>` elements. React 19 also permits `<Ctx>` used
 * directly as a provider, so both tag shapes are matched.
 */
function findProviders(
  project: Project,
  contextName: string,
  projectRoot: string,
): Array<{ node: GraphNode; value?: string }> {
  const found: Array<{ node: GraphNode; value?: string }> = [];

  for (const sf of project.getSourceFiles()) {
    sf.forEachDescendant((node) => {
      if (!Node.isJsxOpeningElement(node) && !Node.isJsxSelfClosingElement(node)) return;

      const tag = node.getTagNameNode().getText();
      if (tag !== `${contextName}.Provider` && tag !== contextName) return;

      const attributes = node
        .getAttributes()
        .filter((a): a is JsxAttribute => Node.isJsxAttribute(a));
      const value = providerValueText(attributes);
      const loc = locate(node, projectRoot);
      const owner = enclosingFunction(node);

      found.push({
        node: {
          id: loc.id,
          label: `${tag}${value ? ` value={${value}}` : ""} · ${owner?.name ?? loc.file} · L${loc.line}`,
          kind: "provider",
          file: loc.file,
          line: loc.line,
          column: loc.column,
        },
        value,
      });
    });
  }

  return found;
}

/** Find `useContext(Ctx)` call sites across the project. */
function findConsumers(project: Project, contextName: string, projectRoot: string): GraphNode[] {
  const found: GraphNode[] = [];

  for (const sf of project.getSourceFiles()) {
    sf.forEachDescendant((node) => {
      if (!Node.isCallExpression(node)) return;
      if (calleeName(node) !== "useContext") return;
      if (node.getArguments()[0]?.getText() !== contextName) return;

      const loc = locate(node, projectRoot);
      const owner = enclosingFunction(node);
      found.push({
        id: loc.id,
        label: `useContext · ${owner?.name ?? loc.file} · L${loc.line}`,
        kind: "consumer",
        file: loc.file,
        line: loc.line,
        column: loc.column,
      });
    });
  }

  return found;
}

export function traceStateFlow(project: Project, opts: StateFlowOptions): TraceResult {
  const { symbol, projectRoot } = opts;
  const notes: string[] = [];
  const graph = new GraphAccumulator();

  const filterFile = opts.filePath ? resolveUserPath(opts.filePath, projectRoot) : undefined;
  const declarations = collectDeclarations(project, symbol, filterFile);

  if (declarations.length === 0) {
    notes.push(
      `No declaration named "${symbol}" was found${opts.filePath ? ` in ${opts.filePath}` : ""}.`,
    );
    return { symbol, graph: { nodes: [], edges: [] }, notes };
  }

  // Prefer a declaration that is actually bound to a hook call.
  const target = declarations.find((d) => hookInitializer(d.decl) !== undefined) ?? declarations[0]!;
  const hookInfo = hookInitializer(target.decl);
  const rootLoc = locate(target.name, projectRoot);

  // The same name is often bound by different hooks in one file (a provider's
  // useState and a consumer's useContext). Never pick silently.
  if (declarations.length > 1) {
    notes.push(
      `Found ${declarations.length} declarations named "${symbol}"; tracing the one at ` +
        `${rootLoc.file}:${rootLoc.line}${hookInfo ? ` (${hookInfo.hook})` : ""}. ` +
        `Pass a filePath, or rename, to disambiguate.`,
    );
  }

  // ---- Context definition: `const Ctx = createContext(…)` -----------------
  if (hookInfo?.hook === "createContext") {
    graph.addNode({
      id: rootLoc.id,
      label: `${symbol} · createContext · L${rootLoc.line}`,
      kind: "declaration",
      file: rootLoc.file,
      line: rootLoc.line,
      column: rootLoc.column,
    });

    for (const provider of findProviders(project, symbol, projectRoot)) {
      graph.addNode(provider.node);
      graph.addEdge({ from: rootLoc.id, to: provider.node.id, label: "provided by" });
    }
    for (const consumer of findConsumers(project, symbol, projectRoot)) {
      graph.addNode(consumer);
      graph.addEdge({ from: rootLoc.id, to: consumer.id, label: "consumed by" });
    }

    if (graph.size === 1) {
      notes.push(`No providers or consumers of "${symbol}" were found in the indexed sources.`);
    }
    return { symbol, root: rootLoc.id, graph: graph.build(), notes };
  }

  // ---- Context consumption: `const v = useContext(Ctx)` -------------------
  if (hookInfo?.hook === "useContext") {
    const contextName = hookInfo.call.getArguments()[0]?.getText();
    graph.addNode({
      id: rootLoc.id,
      label: `${symbol} · useContext${contextName ? `(${contextName})` : ""} · L${rootLoc.line}`,
      kind: "consumer",
      file: rootLoc.file,
      line: rootLoc.line,
      column: rootLoc.column,
    });

    if (contextName) {
      for (const provider of findProviders(project, contextName, projectRoot)) {
        graph.addNode(provider.node);
        graph.addEdge({ from: provider.node.id, to: rootLoc.id, label: "provides" });
      }
      if (graph.size === 1) {
        notes.push(
          `No <${contextName}.Provider> was found. The value may come from a default, ` +
            `or the provider is rendered dynamically.`,
        );
      }
    } else {
      notes.push("Could not determine which context is being consumed.");
    }
    return { symbol, root: rootLoc.id, graph: graph.build(), notes };
  }

  // ---- State hook: `const [s, setS] = useState(…)` ------------------------
  const isStateHook = hookInfo !== undefined && STATE_HOOKS.has(hookInfo.hook);
  if (!isStateHook) {
    notes.push(
      `"${symbol}" is not bound to a React state hook` +
        `${hookInfo ? ` (found ${hookInfo.hook})` : ""}. ` +
        `Showing plain reads; use trace_variable for non-React values.`,
    );
  }

  graph.addNode({
    id: rootLoc.id,
    label: `${symbol} · ${hookInfo?.hook ?? "value"} · L${rootLoc.line}:${rootLoc.column}`,
    kind: isStateHook ? "state" : "declaration",
    file: rootLoc.file,
    line: rootLoc.line,
    column: rootLoc.column,
  });

  // The setter is the second element of the destructuring pattern.
  const pattern = target.decl.getParent();
  if (isStateHook && pattern && Node.isArrayBindingPattern(pattern)) {
    const elements = pattern.getElements();
    const setterElement = elements[1];

    if (setterElement && Node.isBindingElement(setterElement) && setterElement !== target.decl) {
      const setterNameNode = setterElement.getNameNode();
      const setterLoc = locate(setterNameNode, projectRoot);
      const setterName = setterNameNode.getText();

      graph.addNode({
        id: setterLoc.id,
        label: `${setterName} · ${hookInfo!.hook === "useReducer" ? "dispatch" : "setter"} · L${setterLoc.line}`,
        kind: "setter",
        file: setterLoc.file,
        line: setterLoc.line,
        column: setterLoc.column,
      });
      graph.addEdge({ from: setterLoc.id, to: rootLoc.id, label: "updates" });

      if (Node.isIdentifier(setterNameNode)) {
        for (const ref of setterNameNode.findReferencesAsNodes()) {
          const loc = locate(ref, projectRoot);
          if (loc.id === setterLoc.id) continue;

          const owner = enclosingFunction(ref);
          graph.addNode({
            id: loc.id,
            label: `${owner?.name ?? "top-level"} · calls ${setterName} · L${loc.line}`,
            kind: "function",
            file: loc.file,
            line: loc.line,
            column: loc.column,
          });
          graph.addEdge({ from: loc.id, to: setterLoc.id, label: "calls" });
        }
      }
    } else {
      notes.push(`"${symbol}" has no setter binding; state appears to be read-only.`);
    }
  }

  // Reads of the state value, including crossings into child components.
  for (const ref of target.name.findReferencesAsNodes()) {
    const loc = locate(ref, projectRoot);
    if (loc.id === rootLoc.id || graph.hasNode(loc.id)) continue;

    const jsx = jsxPropContext(ref);
    const owner = enclosingFunction(ref);

    if (jsx) {
      graph.addNode({
        id: loc.id,
        label: `<${jsx.element} ${jsx.attribute}={${symbol}}> · L${loc.line}`,
        kind: "prop",
        file: loc.file,
        line: loc.line,
        column: loc.column,
      });
      graph.addEdge({ from: rootLoc.id, to: loc.id, label: "passed as prop" });
    } else {
      graph.addNode({
        id: loc.id,
        label: `${owner?.name ?? "top-level"} · reads ${symbol} · L${loc.line}`,
        kind: "reference",
        file: loc.file,
        line: loc.line,
        column: loc.column,
      });
      graph.addEdge({ from: rootLoc.id, to: loc.id, label: "read by" });
    }
  }

  if (graph.size === 1) {
    notes.push(`"${symbol}" has no setter or reads in the indexed sources.`);
  }

  return { symbol, root: rootLoc.id, graph: graph.build(), notes };
}
