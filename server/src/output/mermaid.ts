/**
 * Output layer: TraceGraph → Mermaid flowchart string.
 *
 * The MCP tool returns this finished string so the model relays it verbatim
 * (no edge is invented across the LLM boundary). Nodes are grouped into a
 * subgraph per file and colored by kind; the root node is highlighted.
 */
import type { GraphNode, NodeKind, TraceGraph } from "../analysis/types.js";

const CLASS_OF: Record<NodeKind, string> = {
  declaration: "decl",
  reference: "ref",
  import: "imp",
  export: "exp",
  module: "mod",
  external: "ext",
  function: "fn",
  state: "state",
  setter: "setter",
  provider: "prov",
  consumer: "cons",
  prop: "prop",
};

/**
 * Escape a string for use inside a Mermaid `["..."]` quoted label.
 *
 * JSX-shaped labels (`<Display count={count}>`) are the norm here, so angle
 * brackets are HTML-encoded rather than dropped — deleting them turns the label
 * into something that reads like different code than the source.
 */
function sanitize(text: string): string {
  return text
    .replace(/"/g, "'")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "/") // a raw pipe would terminate an edge label
    .replace(/[[\]]/g, "") // square brackets break Mermaid node syntax
    .replace(/\s+/g, " ")
    .trim();
}

export interface MermaidOptions {
  /** Node id to highlight as the entry point of the trace. */
  rootId?: string;
  /**
   * Group nodes into a subgraph per file. Useful for symbol-level traces; for
   * module-level graphs each node *is* a file, so grouping is redundant.
   */
  groupByFile?: boolean;
}

export function toMermaid(graph: TraceGraph, options: MermaidOptions = {}): string {
  const { rootId, groupByFile = true } = options;

  if (graph.nodes.length === 0) {
    return 'flowchart TD\n  empty["No nodes to display"]';
  }

  const idMap = new Map<string, string>();
  graph.nodes.forEach((n, i) => idMap.set(n.id, `n${i}`));

  const lines: string[] = ["flowchart TD"];
  lines.push("  classDef root fill:#c53030,color:#fff,stroke:#742a2a,stroke-width:2px;");
  lines.push("  classDef decl fill:#1f7a33,color:#fff,stroke:#0d3d19;");
  lines.push("  classDef ref fill:#2b6cb0,color:#fff,stroke:#1a4971;");
  lines.push("  classDef imp fill:#b7791f,color:#fff,stroke:#744210;");
  lines.push("  classDef exp fill:#805ad5,color:#fff,stroke:#44337a;");
  lines.push("  classDef mod fill:#2c5282,color:#fff,stroke:#1a365d;");
  lines.push("  classDef ext fill:#4a5568,color:#fff,stroke:#2d3748;");
  lines.push("  classDef fn fill:#2b6cb0,color:#fff,stroke:#1a4971;");
  lines.push("  classDef state fill:#1f7a33,color:#fff,stroke:#0d3d19;");
  lines.push("  classDef setter fill:#c05621,color:#fff,stroke:#7b341e;");
  lines.push("  classDef prov fill:#805ad5,color:#fff,stroke:#44337a;");
  lines.push("  classDef cons fill:#2b6cb0,color:#fff,stroke:#1a4971;");
  lines.push("  classDef prop fill:#0987a0,color:#fff,stroke:#086f83;");

  const classFor = (n: GraphNode): string =>
    n.id === rootId ? "root" : CLASS_OF[n.kind];

  const renderNode = (n: GraphNode, indent: string): string =>
    `${indent}${idMap.get(n.id)}["${sanitize(n.label)}"]:::${classFor(n)}`;

  if (groupByFile) {
    const byFile = new Map<string, GraphNode[]>();
    for (const n of graph.nodes) {
      const bucket = byFile.get(n.file);
      if (bucket) bucket.push(n);
      else byFile.set(n.file, [n]);
    }

    let fileIndex = 0;
    for (const [file, fileNodes] of byFile) {
      lines.push(`  subgraph f${fileIndex}["${sanitize(file)}"]`);
      for (const n of fileNodes) lines.push(renderNode(n, "    "));
      lines.push("  end");
      fileIndex++;
    }
  } else {
    for (const n of graph.nodes) lines.push(renderNode(n, "  "));
  }

  for (const e of graph.edges) {
    const from = idMap.get(e.from);
    const to = idMap.get(e.to);
    if (!from || !to) continue;
    const connector = e.label ? `-->|${sanitize(e.label)}|` : "-->";
    lines.push(`  ${from} ${connector} ${to}`);
  }

  return lines.join("\n");
}
