# Changelog

All notable changes to Code Archaeologist will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-07-27

### Added

#### Phase 0: Plugin Scaffolding
- `.claude-plugin/plugin.json` manifest with metadata (name, version, author, keywords)
- `.claude-plugin/marketplace.json` for self-hosted distribution
- `.mcp.json` MCP server registration (stdio transport)
- `/skills/trace` skill entry point for user interaction
- Base server structure (Node.js MCP using @modelcontextprotocol/sdk)

#### Phase 1: Variable Tracing
- `trace_variable` MCP tool: find variable declarations and all cross-file references
- Reference classification: import, export, re-export, usage
- ts-morph `Project` loader with warm cache (keyed by tsconfig path)
- Mermaid flowchart output with per-file subgraphs and color-coded node kinds
- Markdown summary table with exact locations (file:line:column)
- Pure TypeScript fixtures + 3 unit tests

#### Phase 2: Import/Export Graph & Call Flow
- `analyze_imports` MCP tool: module dependency chain with depth limit & cycle detection
- Automatic resolution of tsconfig `paths` aliases and barrel re-exports
- `trace_call_flow` MCP tool: upstream (callers) or downstream (callees) function chains
- Safe handling of recursion and cycles via `TraversalGuard`
- External modules (node_modules) treated as opaque leaf nodes
- Shared symbol utilities (locate, classify, resolve) across all analyzers
- `GraphAccumulator` for deduplication; `graph-builder` for graph operations
- Layered fixtures with path aliases, barrel files, and 3-hop call chains + 9 tests

#### Phase 3: React State Flow
- `trace_state_flow` MCP tool: useState/useReducer, useContext, createContext, prop drilling
- Syntactic heuristics for state lifecycle (state → setter → call sites)
- Provider ↔ consumer linkage via Context tracing
- JSX prop crossing detection (`<Component prop={state}>`)
- Ambiguity warnings (multiple declarations with same name)
- Mermaid sanitizer improvements: HTML entity encoding for JSX labels instead of deletion
- React .tsx fixtures (Counter, ThemeContext, Display) + 8 tests

#### Phase 4: Autonomous Agent & Bootstrap Hook
- `agents/code-archaeologist.md` subagent with multi-hop tracing instructions
- Tool chaining heuristics (which tool to start with, when to chain to the next)
- Edge case handling (external boundaries, dynamic patterns, ambiguity)
- `SessionStart` hook → `bootstrap.mjs` for automatic dependency installation
- Package.json SHA-256 caching (skip reinstall if unchanged)
- Cross-platform Node.js bootstrap (Windows + Unix compatible)
- `hooks/hooks.json` configuration

#### Phase 5: Deployment Readiness
- Comprehensive README.md with features, installation, usage, examples, limitations
- CHANGELOG.md (this file) documenting all phases
- CLI validation (all 4 tools registered and discoverable)
- Marketplace readiness (plugin.json completes CLI specification)

### Technical Details

**MCP Tools:** 4 total
- `trace_variable(symbol, filePath?, projectRoot?)`
- `analyze_imports(entryFile, maxDepth?, projectRoot?)`
- `trace_call_flow(symbol, direction?, filePath?, maxDepth?, projectRoot?)`
- `trace_state_flow(symbol, filePath?, projectRoot?)`

**Analysis Engine:** ts-morph 28 with Language Service for accurate symbol resolution
**Output:** Mermaid flowcharts (fenced markdown) + structured summary tables
**Tests:** 20+ unit tests (vitest) covering all phases
**Runtime:** Node.js 18+, MCP over stdio

### Known Limitations

- **Dynamic patterns:** `require(variable)`, `import(expr)`, string-keyed property access
- **Framework magic:** HOCs, render props, conditional Context rendering
- **Scope:** Limited to static symbol analysis; no runtime value tracking
- **External modules:** node_modules shown as leaf nodes, internals not traversed

### Future Work (Post-v0.1.0)

- Global state management (Redux, Zustand)
- API/fetch data flow tracing
- Custom decorator and annotation support
- Incremental analysis for faster re-runs
- Web UI for large dependency graphs
- Export to GraphQL, Cypher, DOT formats

---

**Release Notes:** This is the first stable release of Code Archaeologist. It provides a solid foundation for TypeScript/React code origin tracing with room for feature expansion.
