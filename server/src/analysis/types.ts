/**
 * Internal graph model shared by the analysis and output layers.
 *
 * Analysis producers (variable-tracer, import-analyzer, call-flow, …) emit a
 * `TraceGraph`; output formatters (mermaid, markdown) consume it. Keeping this
 * model framework-agnostic lets every phase reuse the same rendering path.
 */

/** What a node represents in a trace. Grows as later phases add flow kinds. */
export type NodeKind = "declaration" | "reference" | "import" | "export";

/** A single location of interest (a declaration or a use of a symbol). */
export interface GraphNode {
  /** Stable identity: `<relFile>:<line>:<column>`. */
  id: string;
  /** Human-readable label used by the renderer. */
  label: string;
  kind: NodeKind;
  /** Workspace-relative path, forward-slashed for cross-platform stability. */
  file: string;
  line: number;
  column: number;
}

/** A directed relationship between two nodes (e.g. declaration → use). */
export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
}

export interface TraceGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Full result of a trace, including the root node and any analysis caveats. */
export interface TraceResult {
  /** The symbol that was traced. */
  symbol: string;
  /** Node id of the primary declaration, or `undefined` if none was found. */
  root?: string;
  graph: TraceGraph;
  /** Warnings/limits surfaced to the user (ambiguity, unsupported patterns). */
  notes: string[];
}
