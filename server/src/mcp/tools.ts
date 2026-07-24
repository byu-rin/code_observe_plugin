/**
 * MCP tool registrations.
 *
 * Tools are thin adapters: parse args → run an analysis producer → render with
 * the output formatters → return a finished text block. Rendering happens here
 * (not in the model) so the graph the user sees is exactly what static analysis
 * found.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadProject } from "../analysis/project.js";
import { traceVariable } from "../analysis/variable-tracer.js";
import { analyzeImports } from "../analysis/import-analyzer.js";
import { traceCallFlow } from "../analysis/call-flow.js";
import type { TraceResult } from "../analysis/types.js";
import { toMermaid } from "../output/mermaid.js";
import { toMarkdownSummary } from "../output/markdown.js";

interface ReportOptions {
  title: string;
  moduleLevel?: boolean;
}

/** Markdown summary + fenced Mermaid graph — the tool's complete answer. */
function renderReport(result: TraceResult, options: ReportOptions): string {
  const summary = toMarkdownSummary(result, {
    title: options.title,
    moduleLevel: options.moduleLevel,
  });
  const mermaid = toMermaid(result.graph, {
    rootId: result.root,
    // Module graphs are already one-node-per-file; per-file subgraphs would be noise.
    groupByFile: !options.moduleLevel,
  });
  return `${summary}\n\n\`\`\`mermaid\n${mermaid}\n\`\`\``;
}

/** Wrap a handler so analysis failures surface as tool errors, not crashes. */
async function guarded(
  label: string,
  run: () => string,
): Promise<{ isError?: boolean; content: Array<{ type: "text"; text: string }> }> {
  try {
    return { content: [{ type: "text", text: run() }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { isError: true, content: [{ type: "text", text: `${label} failed: ${message}` }] };
  }
}

const projectRootArg = z
  .string()
  .optional()
  .describe(
    "Root of the project to analyze. Defaults to the server's working directory (the current workspace).",
  );

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
        symbol: z.string().describe("The variable or function name to trace, e.g. 'initialCount'."),
        filePath: z
          .string()
          .optional()
          .describe(
            "Optional file (relative to projectRoot or absolute) to disambiguate " +
              "which declaration to trace when the name is declared in several places.",
          ),
        projectRoot: projectRootArg,
      },
    },
    async ({ symbol, filePath, projectRoot }) => {
      const root = projectRoot ?? process.cwd();
      return guarded(`trace_variable("${symbol}")`, () => {
        const project = loadProject(root);
        const result = traceVariable(project, { symbol, filePath, projectRoot: root });
        return renderReport(result, { title: `Trace: \`${symbol}\`` });
      });
    },
  );

  server.registerTool(
    "analyze_imports",
    {
      title: "Analyze imports",
      description:
        "Build the module dependency graph starting from an entry file: which " +
        "modules it imports, what it pulls from each, and how those modules chain " +
        "onward. Resolves tsconfig path aliases and barrel re-exports; node_modules " +
        "appear as external leaf nodes. Depth-limited and cycle-safe.",
      inputSchema: {
        entryFile: z
          .string()
          .describe("Entry file to walk from, relative to projectRoot or absolute."),
        maxDepth: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe("How many module hops to follow. Defaults to 3."),
        projectRoot: projectRootArg,
      },
    },
    async ({ entryFile, maxDepth, projectRoot }) => {
      const root = projectRoot ?? process.cwd();
      return guarded(`analyze_imports("${entryFile}")`, () => {
        const project = loadProject(root);
        const result = analyzeImports(project, { entryFile, maxDepth, projectRoot: root });
        return renderReport(result, {
          title: `Import graph: \`${result.symbol}\``,
          moduleLevel: true,
        });
      });
    },
  );

  server.registerTool(
    "trace_call_flow",
    {
      title: "Trace call flow",
      description:
        "Trace a function's call hierarchy. direction='callers' walks upstream " +
        "(who invokes this function — the useful direction for finding where data " +
        "originates); direction='callees' walks downstream (what this function " +
        "invokes). Depth-limited and safe on recursive functions.",
      inputSchema: {
        symbol: z.string().describe("The function name to trace, e.g. 'makeCounter'."),
        direction: z
          .enum(["callers", "callees"])
          .optional()
          .describe("'callers' (upstream, default) or 'callees' (downstream)."),
        filePath: z
          .string()
          .optional()
          .describe("Optional file to disambiguate which function to trace."),
        maxDepth: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe("How many call hops to follow. Defaults to 3."),
        projectRoot: projectRootArg,
      },
    },
    async ({ symbol, direction, filePath, maxDepth, projectRoot }) => {
      const root = projectRoot ?? process.cwd();
      return guarded(`trace_call_flow("${symbol}")`, () => {
        const project = loadProject(root);
        const result = traceCallFlow(project, {
          symbol,
          direction,
          filePath,
          maxDepth,
          projectRoot: root,
        });
        return renderReport(result, {
          title: `Call flow (${direction ?? "callers"}): \`${symbol}\``,
        });
      });
    },
  );
}
