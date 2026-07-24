/**
 * Output layer: TraceGraph → Mermaid flowchart string.
 *
 * The MCP tool returns this finished string so the model relays it verbatim
 * (no edge is invented across the LLM boundary). Nodes are grouped into a
 * subgraph per file and colored by kind for readability.
 */
import type { GraphNode, NodeKind, TraceGraph } from "../analysis/types.js";

const CLASS_OF: Record<NodeKind, string> = {
  declaration: "decl",
  reference: "ref",
  import: "imp",
  export: "exp",
};

/** Escape a string for use inside a Mermaid `["..."]` quoted label. */
function sanitize(text: string): string {
  return text
    .replace(/"/g, "'")
    .replace(/[[\]{}|<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function toMermaid(graph: TraceGraph): string {
  if (graph.nodes.length === 0) {
    return "flowchart TD\n  empty[\"No nodes to display\"]";
  }

  const idMap = new Map<string, string>();
  graph.nodes.forEach((n, i) => idMap.set(n.id, `n${i}`));

  const byFile = new Map<string, GraphNode[]>();
  for (const n of graph.nodes) {
    const bucket = byFile.get(n.file);
    if (bucket) bucket.push(n);
    else byFile.set(n.file, [n]);
  }

  const lines: string[] = ["flowchart TD"];
  lines.push("  classDef decl fill:#1f7a33,color:#fff,stroke:#0d3d19;");
  lines.push("  classDef ref fill:#2b6cb0,color:#fff,stroke:#1a4971;");
  lines.push("  classDef imp fill:#b7791f,color:#fff,stroke:#744210;");
  lines.push("  classDef exp fill:#805ad5,color:#fff,stroke:#44337a;");

  let fileIndex = 0;
  for (const [file, fileNodes] of byFile) {
    lines.push(`  subgraph f${fileIndex}["${sanitize(file)}"]`);
    for (const n of fileNodes) {
      const mid = idMap.get(n.id)!;
      lines.push(`    ${mid}["${sanitize(n.label)}"]:::${CLASS_OF[n.kind]}`);
    }
    lines.push("  end");
    fileIndex++;
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
