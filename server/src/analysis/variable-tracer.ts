/**
 * Variable tracer (Phase 1, refactored in Phase 2 onto shared helpers).
 *
 * Given a symbol name, find its declaration and every reference across the
 * project, and emit a `TraceGraph` rooted at the declaration. Cross-file uses,
 * import specifiers, and re-exports are classified so the graph shows *where*
 * the value flows, not just that it is used.
 */
import type { Project } from "ts-morph";
import { GraphAccumulator } from "./graph-builder.js";
import {
  classifyReference,
  collectDeclarations,
  locate,
  resolveUserPath,
  type Located,
} from "./symbols.js";
import type { NodeKind, TraceResult } from "./types.js";

export interface TraceOptions {
  symbol: string;
  /** Optional workspace-relative or absolute file to disambiguate the declaration. */
  filePath?: string;
  /** Root the analysis + relative paths resolve against. */
  projectRoot: string;
}

const ROLE_LABEL: Partial<Record<NodeKind, string>> = {
  declaration: "declared",
  reference: "used",
  import: "imported",
  export: "re-exported",
};

const EDGE_LABEL: Partial<Record<NodeKind, string>> = {
  reference: "used in",
  import: "imported into",
  export: "re-exported from",
};

function labelFor(symbol: string, kind: NodeKind, loc: Located): string {
  return `${symbol} · ${ROLE_LABEL[kind] ?? kind} · L${loc.line}:${loc.column}`;
}

export function traceVariable(project: Project, opts: TraceOptions): TraceResult {
  const { symbol, projectRoot } = opts;
  const notes: string[] = [];

  const filterFile = opts.filePath ? resolveUserPath(opts.filePath, projectRoot) : undefined;
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

  const graph = new GraphAccumulator();
  graph.addNode({
    id: declLoc.id,
    label: labelFor(symbol, "declaration", declLoc),
    kind: "declaration",
    file: declLoc.file,
    line: declLoc.line,
    column: declLoc.column,
  });

  for (const ref of primary.name.findReferencesAsNodes()) {
    const loc = locate(ref, projectRoot);
    if (loc.id === declLoc.id) continue; // the declaration itself
    if (graph.hasNode(loc.id)) continue;

    const kind = classifyReference(ref);
    graph.addNode({
      id: loc.id,
      label: labelFor(symbol, kind, loc),
      kind,
      file: loc.file,
      line: loc.line,
      column: loc.column,
    });
    graph.addEdge({ from: declLoc.id, to: loc.id, label: EDGE_LABEL[kind] ?? "used in" });
  }

  if (graph.size === 1) {
    notes.push(`"${symbol}" is declared but has no other references in the indexed sources.`);
  }

  return { symbol, root: declLoc.id, graph: graph.build(), notes };
}
