/**
 * Function call-flow analysis (Phase 2).
 *
 * `callers` answers "who invokes this?" (upstream — the useful direction when
 * asking where data comes from). `callees` answers "what does this invoke?"
 * (downstream). Both are depth-limited and cycle-safe, so recursive and
 * mutually-recursive functions terminate.
 */
import { Node, Project, SyntaxKind } from "ts-morph";
import { GraphAccumulator, TraversalGuard } from "./graph-builder.js";
import {
  collectDeclarations,
  enclosingFunction,
  functionName,
  isFunctionLike,
  locate,
  resolveUserPath,
} from "./symbols.js";
import type { TraceResult } from "./types.js";

export type CallDirection = "callers" | "callees";

export interface CallFlowOptions {
  symbol: string;
  direction?: CallDirection;
  filePath?: string;
  projectRoot: string;
  maxDepth?: number;
}

/** True when `ref` is the callee position of a call expression. */
function isCalleeOf(ref: Node): Node | undefined {
  const call = ref.getParentIfKind(SyntaxKind.CallExpression);
  if (call && call.getExpression() === ref) return call;

  // Handles `obj.method()` where `ref` is the `method` identifier.
  const access = ref.getParentIfKind(SyntaxKind.PropertyAccessExpression);
  if (access && access.getNameNode() === ref) {
    const outer = access.getParentIfKind(SyntaxKind.CallExpression);
    if (outer && outer.getExpression() === access) return outer;
  }
  return undefined;
}

/** The declaration a call expression's callee resolves to, if in-project. */
function resolveCallTarget(call: Node): { fn: Node; name: string } | undefined {
  if (!Node.isCallExpression(call)) return undefined;
  const expression = call.getExpression();

  const identifier = Node.isIdentifier(expression)
    ? expression
    : Node.isPropertyAccessExpression(expression)
      ? expression.getNameNode()
      : undefined;
  if (!identifier || !Node.isIdentifier(identifier)) return undefined;

  for (const def of identifier.getDefinitionNodes()) {
    if (isFunctionLike(def)) return { fn: def, name: functionName(def) };
    // `const f = () => {}` resolves to the variable declaration.
    if (Node.isVariableDeclaration(def)) {
      const initializer = def.getInitializer();
      if (initializer && isFunctionLike(initializer)) {
        return { fn: initializer, name: def.getName() };
      }
    }
  }
  return undefined;
}

export function traceCallFlow(project: Project, opts: CallFlowOptions): TraceResult {
  const { symbol, projectRoot, direction = "callers", maxDepth = 3 } = opts;
  const notes: string[] = [];
  const graph = new GraphAccumulator();

  const filterFile = opts.filePath ? resolveUserPath(opts.filePath, projectRoot) : undefined;
  const declarations = collectDeclarations(project, symbol, filterFile);

  const target = declarations.find(({ decl }) => {
    if (isFunctionLike(decl)) return true;
    if (Node.isVariableDeclaration(decl)) {
      const init = decl.getInitializer();
      return !!init && isFunctionLike(init);
    }
    return false;
  });

  if (!target) {
    notes.push(
      `No function named "${symbol}" was found${opts.filePath ? ` in ${opts.filePath}` : ""}. ` +
        `It may be a method, a destructured binding, or defined outside the indexed sources.`,
    );
    return { symbol, graph: { nodes: [], edges: [] }, notes };
  }

  const rootLoc = locate(target.name, projectRoot);
  graph.addNode({
    id: rootLoc.id,
    label: `${symbol} · ${rootLoc.file}:${rootLoc.line}`,
    kind: "declaration",
    file: rootLoc.file,
    line: rootLoc.line,
    column: rootLoc.column,
  });

  const guard = new TraversalGuard(maxDepth);

  /** Walk upward: every function that calls `nameNode`'s symbol. */
  const walkCallers = (nameNode: Node, nodeId: string, depth: number): void => {
    guard.enter(nodeId);

    for (const ref of (nameNode as never as { findReferencesAsNodes(): Node[] })
      .findReferencesAsNodes()) {
      if (!isCalleeOf(ref)) continue;

      const caller = enclosingFunction(ref);
      const loc = caller ? locate(caller.fn, projectRoot) : locate(ref, projectRoot);
      const label = caller
        ? `${caller.name} · ${loc.file}:${loc.line}`
        : `top-level · ${loc.file}:${loc.line}`;

      graph.addNode({
        id: loc.id,
        label,
        kind: "function",
        file: loc.file,
        line: loc.line,
        column: loc.column,
      });
      graph.addEdge({ from: loc.id, to: nodeId, label: "calls" });

      if (caller && guard.canVisit(loc.id, depth + 1)) {
        const callerName =
          Node.isFunctionDeclaration(caller.fn) || Node.isMethodDeclaration(caller.fn)
            ? caller.fn.getNameNode()
            : undefined;
        if (callerName) walkCallers(callerName, loc.id, depth + 1);
      }
    }

    guard.leave(nodeId);
  };

  /** Walk downward: every function invoked inside `fn`'s body. */
  const walkCallees = (fn: Node, nodeId: string, depth: number): void => {
    guard.enter(nodeId);

    fn.forEachDescendant((node) => {
      if (!Node.isCallExpression(node)) return;
      const callee = resolveCallTarget(node);
      if (!callee) return;

      const loc = locate(callee.fn, projectRoot);
      if (loc.id === nodeId) return;

      graph.addNode({
        id: loc.id,
        label: `${callee.name} · ${loc.file}:${loc.line}`,
        kind: "function",
        file: loc.file,
        line: loc.line,
        column: loc.column,
      });
      graph.addEdge({ from: nodeId, to: loc.id, label: "calls" });

      if (guard.canVisit(loc.id, depth + 1)) walkCallees(callee.fn, loc.id, depth + 1);
    });

    guard.leave(nodeId);
  };

  if (direction === "callers") {
    walkCallers(target.name, rootLoc.id, 0);
  } else {
    const body = isFunctionLike(target.decl)
      ? target.decl
      : Node.isVariableDeclaration(target.decl)
        ? target.decl.getInitializer()
        : undefined;
    if (body) walkCallees(body, rootLoc.id, 0);
  }

  notes.push(...guard.cycleNotes);
  if (graph.size === 1) {
    notes.push(
      direction === "callers"
        ? `"${symbol}" is never called in the indexed sources.`
        : `"${symbol}" does not call any in-project function.`,
    );
  }

  return { symbol, root: rootLoc.id, graph: graph.build(), notes };
}
