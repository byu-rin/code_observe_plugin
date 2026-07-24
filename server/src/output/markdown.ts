/**
 * Output layer: TraceGraph → Markdown summary.
 *
 * Complements the Mermaid diagram with a scannable table. The diagram shows
 * shape; the table gives exact, copy-pasteable locations.
 */
import type { NodeKind, TraceResult } from "../analysis/types.js";

const KIND_LABEL: Record<NodeKind, string> = {
  declaration: "declaration",
  reference: "reference",
  import: "import",
  export: "re-export",
  module: "module",
  external: "external",
  function: "function",
  state: "state",
  setter: "setter",
  provider: "provider",
  consumer: "consumer",
  prop: "prop",
};

/** Escape pipe characters so labels cannot break the table layout. */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|");
}

export interface SummaryOptions {
  /** Heading shown above the summary, e.g. "Trace: `foo`". */
  title: string;
  /** Omit line/column columns for module-level graphs. */
  moduleLevel?: boolean;
  /** Cap the number of table rows so huge graphs stay readable. */
  maxRows?: number;
}

export function toMarkdownSummary(result: TraceResult, options: SummaryOptions): string {
  const { title, moduleLevel = false, maxRows = 40 } = options;
  const { graph, root, notes } = result;

  const lines: string[] = [`## ${title}`, ""];

  const rootNode = root ? graph.nodes.find((n) => n.id === root) : undefined;
  if (rootNode) {
    const where = moduleLevel
      ? `\`${rootNode.file}\``
      : `\`${rootNode.file}\` (L${rootNode.line}:${rootNode.column})`;
    lines.push(`- **Root:** ${where}`);
  }

  const others = graph.nodes.filter((n) => n.id !== root);
  lines.push(`- **Related nodes:** ${others.length}`);

  const counts = new Map<NodeKind, number>();
  for (const n of others) counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
  if (counts.size > 0) {
    const breakdown = [...counts.entries()]
      .map(([kind, count]) => `${KIND_LABEL[kind]} ${count}`)
      .join(", ");
    lines.push(`- **Breakdown:** ${breakdown}`);
  }

  const files = [...new Set(graph.nodes.map((n) => n.file))];
  lines.push(`- **Spans files:** ${files.length}`);

  if (notes.length > 0) {
    lines.push("", "**Notes:**");
    for (const note of notes) lines.push(`- ${note}`);
  }

  if (others.length > 0) {
    lines.push("");
    if (moduleLevel) {
      lines.push("| Module | Kind |", "| :-- | :-- |");
      for (const n of others.slice(0, maxRows)) {
        lines.push(`| \`${cell(n.file)}\` | ${KIND_LABEL[n.kind]} |`);
      }
    } else {
      lines.push("| Location | Kind | Detail |", "| :-- | :-- | :-- |");
      for (const n of others.slice(0, maxRows)) {
        lines.push(
          `| \`${cell(n.file)}:${n.line}:${n.column}\` | ${KIND_LABEL[n.kind]} | ${cell(n.label)} |`,
        );
      }
    }
    if (others.length > maxRows) {
      lines.push("", `_… ${others.length - maxRows} more nodes omitted from the table._`);
    }
  }

  return lines.join("\n");
}
