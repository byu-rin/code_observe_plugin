#!/usr/bin/env node
/**
 * Code Archaeologist — MCP server entry point.
 *
 * Hosts the analysis + output layers behind the Model Context Protocol (stdio).
 * The process is long-lived so ts-morph `Project` instances stay warm across
 * tool calls. Analysis tools are registered from `mcp/tools.ts`.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./mcp/tools.js";

const SERVER_NAME = "code-archaeologist";
const SERVER_VERSION = "0.1.0";

const server = new McpServer({
  name: SERVER_NAME,
  version: SERVER_VERSION,
});

registerTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe for logging; stdout is reserved for the MCP protocol.
  console.error(`[${SERVER_NAME}] MCP server ready on stdio`);
}

main().catch((error) => {
  console.error(`[${SERVER_NAME}] fatal:`, error);
  process.exit(1);
});
