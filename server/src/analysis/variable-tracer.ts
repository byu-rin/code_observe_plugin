/**
 * Variable tracer (Phase 1).
 *
 * Given a symbol name, find its declaration and every reference across the
 * project, and emit a `TraceGraph` rooted at the declaration. Cross-file uses,
 * import specifiers, and re-exports are classified so the graph shows *where*
 * the value flows, not just that it is used.
 */
import { Node, Project, SyntaxKind, type Identifier } from "ts-morph";
import { norm, relFile } from "./project.js";
import type { GraphEdge, GraphNode, NodeKind, TraceGraph, TraceResult } from "./types.js";

export interface TraceOptions {
  symbol: string;
  /** Optional workspace-relative or absolute file to disambiguate the declaration. */
  filePath?: string;
  /** Root the analysis + relative paths resolve against. */
  projectRoot: string;
}

interface Located {
  id: string;
  file: string;
  line: number;
  column: number;
}

const ROLE_LABEL: Record<NodeKind, string> = {
  declaration: "declared",
  reference: "used",
  import: "imported",
  export: "re-exported",
};

const EDGE_LABEL: Record<NodeKind, string> = {
  declaration: "declares",
  reference: "used in",
  import: "imported into",
  export: "re-exported from",
};

/** Resolve a node's location into an id + display coordinates. */
function locate(node: Node, projectRoot: string): Located {
  const sf = node.getSourceFile();
  const { line, column } = sf.getLineAndColumnAtPos(node.getStart());
  const file = relFile(sf.getFilePath(), projectRoot);
  return { id: `${file}:${line}:${column}`, file, line, column };
}

/** If `node` is a named declaration with a simple identifier name, return it. */
function asDeclaration(node: Node): { decl: Node; name: Identifier } | undefined {
  if (
    Node.isVariableDeclaration(node) ||
    Node.isFunctionDeclaration(node) ||
    Node.isParameterDeclaration(node) ||
    Node.isClassDeclaration(node) ||
    Node.isBindingElement(node)
  ) {
    const nameNode = node.getNameNode();
    if (nameNode && Node.isIdentifier(nameNode)) {
      return { decl: node, name: nameNode };
    }
  }
  return undefined;
}

/** Classify a reference by the syntactic context it appears in. */
function classifyReference(node: Node): NodeKind {
  if (
    node.getFirstAncestorByKind(SyntaxKind.ImportSpecifier) ||
    node.getFirstAncestorByKind(SyntaxKind.ImportClause) ||
    node.getFirstAncestorByKind(SyntaxKind.NamespaceImport)
  ) {
    return "import";
  }
  if (node.getFirstAncestorByKind(SyntaxKind.ExportSpecifier)) {
    return "export";
  }
  return "reference";
}

/** Collect every simple-identifier declaration named `symbol`. */
function collectDeclarations(
  project: Project,
  symbol: string,
  filterFile: string | undefined,
): Array<{ decl: Node; name: Identifier }> {
  const found: Array<{ decl: Node; name: Identifier }> = [];
  for (const sf of project.getSourceFiles()) {
    if (filterFile && norm(sf.getFilePath()) !== filterFile) continue;
    sf.forEachDescendant((node) => {
      const named = asDeclaration(node);
      if (named && named.name.getText() === symbol) found.push(named);
    });
  }
  return found;
}

function labelFor(symbol: string, kind: NodeKind, loc: Located): string {
  return `${symbol} · ${ROLE_LABEL[kind]} · L${loc.line}:${loc.column}`;
}

export function traceVariable(project: Project, opts: TraceOptions): TraceResult {
  const { symbol, projectRoot } = opts;
  const notes: string[] = [];

  const filterFile = opts.filePath
    ? norm(
        opts.filePath.match(/^([a-zA-Z]:)?[\\/]/)
          ? opts.filePath
          : `${projectRoot}/${opts.filePath}`,
      )
    : undefined;

  const declarations = collectDeclarations(project, symbol, filterFile);

  if (declarations.length === 0) {
    notes.push(
      `No simple-identifier declaration named "${symbol}" was found${
        opts.filePath ? ` in ${opts.filePath}` : ""
      }. It may be a destructured binding, a property, or defined in an unindexed file.`,
    );
    return { symbol, graph: { nodes: [], edges: [] }, notes };
  }

  if (declarations.length > 1) {
    notes.push(
      `Found ${declarations.length} declarations named "${symbol}"; tracing the first. Pass a filePath to disambiguate.`,
    );
  }

  const primary = declarations[0]!;
  const declLoc = locate(primary.name, projectRoot);

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  nodes.set(declLoc.id, {
    id: declLoc.id,
    label: labelFor(symbol, "declaration", declLoc),
    kind: "declaration",
    file: declLoc.file,
    line: declLoc.line,
    column: declLoc.column,
  });

  const references = primary.name.findReferencesAsNodes();
  for (const ref of references) {
    const loc = locate(ref, projectRoot);
    if (loc.id === declLoc.id) continue; // the declaration itself

    const kind = classifyReference(ref);
    if (!nodes.has(loc.id)) {
      nodes.set(loc.id, {
        id: loc.id,
        label: labelFor(symbol, kind, loc),
        kind,
        file: loc.file,
        line: loc.line,
        column: loc.column,
      });
      edges.push({ from: declLoc.id, to: loc.id, label: EDGE_LABEL[kind] });
    }
  }

  if (nodes.size === 1) {
    notes.push(`"${symbol}" is declared but has no other references in the indexed sources.`);
  }

  const graph: TraceGraph = { nodes: [...nodes.values()], edges };
  return { symbol, root: declLoc.id, graph, notes };
}
