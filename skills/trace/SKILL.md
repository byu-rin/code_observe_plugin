---
description: Trace where a variable, function, or module's data comes from — declaration, cross-file references, import/export chains (including barrels and path aliases), and call hierarchy — rendered as a dependency graph. Use when the user asks where a value originates, how data flows, what depends on what, who calls a function, or wants a dependency graph for TypeScript/React code.
---

# Code Archaeologist — Trace

Trace the origin and flow of what the user named (arguments: `$ARGUMENTS`).

## Choosing the right tool

All tools are on the `archaeologist` MCP server and return a Markdown summary
plus a fenced ```mermaid``` graph. Pick by what the user is asking:

| User is asking | Tool | Key arguments |
| :-- | :-- | :-- |
| "Where does this value come from?" / "Where is X used?" | `trace_variable` | `symbol`, optional `filePath` |
| "What does this file depend on?" / "Show the dependency graph" | `analyze_imports` | `entryFile`, optional `maxDepth` |
| "Who calls this?" / "What does this function call?" | `trace_call_flow` | `symbol`, `direction`, optional `maxDepth` |

For `trace_call_flow`, `direction: "callers"` (default) walks **upstream** — use
it when the question is where data or control originates. `direction: "callees"`
walks downstream.

Omit `projectRoot` to analyze the current workspace. Pass `filePath` only to
disambiguate when a name is declared in several places.

## Steps

1. **Identify the target** from `$ARGUMENTS`, the user's message, or the current
   selection: a symbol name, or a file for a module graph.
2. **Call the matching tool** from the table above. If the question is broad
   ("how does this data flow?"), start with `trace_variable`, then follow up with
   `analyze_imports` or `trace_call_flow` on what it reveals.
3. **Relay the result verbatim.** Output the returned Markdown + ```mermaid```
   block **as-is** — do not redraw, re-order, or invent edges. The static
   analyzer is the source of truth.
4. **Interpret, briefly.** After the graph, add a short plain-language reading:
   where it originates, which files participate, and anything in the tool's
   **Notes** (ambiguity, cycles, patterns it could not resolve statically).

## Notes

- Barrel files (`export * from './x'`) and tsconfig `paths` aliases are resolved
  automatically — the graph shows the real declaring file, not the barrel.
- `node_modules` appear as **external** leaf nodes and are not traversed.
- Graphs are depth-limited (default 3) and cycle-safe. If the user needs more
  reach, raise `maxDepth`.
- If a tool reports nothing found, suggest a `filePath`, a different spelling, or
  note that the symbol may be a destructured binding / property / method — not
  yet resolved in this version.
- For deep, multi-hop investigation across many files, hand off to the
  `code-archaeologist` agent instead of chaining calls inline.
