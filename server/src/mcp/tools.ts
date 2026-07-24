/**
 * MCP tool registrations.
 *
 * Tools are thin adapters: parse args → run an analysis producer → render with
 * an output formatter → return a finished text block. Phase 1 ships
 * `trace_variable`; later phases register import/call-flow/graph tools here.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadProject } from "../analysis/project.js";
import { traceVariable } from "../analysis/variable-tracer.js";
import type { TraceResult } from "../analysis/types.js";
import { toMermaid } from "../output/mermaid.js";

/** Compose a markdown summary + fenced Mermaid graph from a trace result. */
function renderReport(result: TraceResult): string {
  const { symbol, graph, root, notes } = result;
  const declNode = root ? graph.nodes.find((n) => n.id === root) : undefined;
  const refCount = graph.nodes.filter((n) => n.kind !== "declaration").length;

  const lines: string[] = [];
  lines.push(`## Trace: \`${symbol}\``);
  lines.push("");
  if (declNode) {
    lines.push(`- **Declared at:** \`${declNode.file}\` (L${declNode.line}:${declNode.column})`);
    lines.push(`- **References found:** ${refCount}`);
    const files = [...new Set(graph.nodes.map((n) => n.file))];
    lines.push(`- **Spans files:** ${files.map((f) => `\`${f}\``).join(", ")}`);
  } else {
    lines.push(`- No declaration found for \`${symbol}\`.`);
  }
  if (notes.length > 0) {
    lines.push("");
    lines.push("**Notes:**");
    for (const note of notes) lines.push(`- ${note}`);
  }
  lines.push("");
  lines.push("```mermaid");
  lines.push(toMermaid(graph));
  lines.push("```");
  return lines.join("\n");
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "trace_variable",
    {
      title: "Trace variable",
      description:
        "Trace where a variable or function comes from: find its declaration and " +
        "every reference (including imports and re-exports) across the TypeScript/" +
        "React project, returned as a Markdown summary plus a Mermaid dependency graph.",
      inputSchema: {
        symbol: z
          .string()
          .describe("The variable or function name to trace, e.g. 'initialCount'."),
        filePath: z
          .string()
          .optional()
          .describe(
            "Optional file (relative to projectRoot or absolute) to disambiguate " +
              "which declaration to trace when the name is used in several places.",
          ),
        projectRoot: z
          .string()
          .optional()
          .describe(
            "Root of the project to analyze. Defaults to the server's working " +
              "directory (the current workspace).",
          ),
      },
    },
    async ({ symbol, filePath, projectRoot }) => {
      const root = projectRoot ?? process.cwd();
      try {
        const project = loadProject(root);
        const result = traceVariable(project, { symbol, filePath, projectRoot: root });
        return { content: [{ type: "text", text: renderReport(result) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `trace_variable failed for "${symbol}" in ${root}: ${message}`,
            },
          ],
        };
      }
    },
  );
}
