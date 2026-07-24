---
description: Trace where a variable or function comes from — its declaration, cross-file references, imports, and re-exports — and render it as a dependency graph. Use when the user asks where a value originates, how data flows, or wants a dependency graph for a TypeScript/React symbol.
---

# Code Archaeologist — Trace

Trace the origin and flow of the symbol the user named (arguments: `$ARGUMENTS`).

## Steps

1. **Identify the target.** From `$ARGUMENTS` (or the user's message / current selection),
   determine the symbol name to trace. If a specific file is implied, note it.
2. **Call the analysis tool.** Invoke the MCP tool
   `mcp__plugin_code-archaeologist_archaeologist__trace_variable` with:
   - `symbol`: the variable/function name.
   - `filePath` (optional): pass it only when the name is declared in several
     places and you need to disambiguate.
   - `projectRoot` (optional): omit to analyze the current workspace; set it only
     when the target project lives in a subdirectory.
3. **Relay the result verbatim.** The tool returns a Markdown summary plus a
   fenced ```mermaid``` dependency graph. Output that block **as-is** — do not
   redraw, re-order, or invent edges. The static analyzer is the source of truth.
4. **Interpret, briefly.** After the graph, add a short plain-language reading:
   where the symbol is declared, which files consume it, and anything in the
   tool's **Notes** (ambiguity, patterns it could not resolve statically).

## Notes

- If the tool reports no declaration, tell the user and suggest a `filePath`, a
  different spelling, or that the symbol may be a destructured binding / property
  (not yet resolved in this version).
- For deep, multi-hop tracing across many files, hand off to the
  `code-archaeologist` agent instead of tracing inline.
