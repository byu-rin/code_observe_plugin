import { describe, it, expect, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import { clearProjectCache, loadProject } from "../src/analysis/project.js";
import { analyzeImports } from "../src/analysis/import-analyzer.js";
import { traceCallFlow } from "../src/analysis/call-flow.js";
import { resolveExportOrigins } from "../src/analysis/resolver.js";
import { toMermaid } from "../src/output/mermaid.js";

const root = fileURLToPath(new URL("./fixtures/layered", import.meta.url));

describe("analyzeImports", () => {
  beforeEach(() => clearProjectCache());

  it("walks the module chain through a path alias and a barrel", () => {
    const project = loadProject(root);
    const result = analyzeImports(project, { entryFile: "src/app.ts", projectRoot: root });

    const ids = result.graph.nodes.map((n) => n.id);
    expect(result.root).toBe("src/app.ts");
    expect(ids).toContain("src/services/user-service.ts");
    // `@core/index` alias must resolve to the real barrel file...
    expect(ids).toContain("src/core/index.ts");
    // ...and the barrel must chain onward to the true origin.
    expect(ids).toContain("src/core/config.ts");
  });

  it("labels edges with the imported binding names", () => {
    const project = loadProject(root);
    const result = analyzeImports(project, { entryFile: "src/app.ts", projectRoot: root });

    const edge = result.graph.edges.find(
      (e) => e.from === "src/app.ts" && e.to === "src/services/user-service.ts",
    );
    expect(edge?.label).toBe("fetchAdminPath");
  });

  it("respects maxDepth", () => {
    const project = loadProject(root);
    const shallow = analyzeImports(project, {
      entryFile: "src/app.ts",
      projectRoot: root,
      maxDepth: 1,
    });
    expect(shallow.graph.nodes.map((n) => n.id)).not.toContain("src/core/config.ts");
  });

  it("reports a note for a missing entry file", () => {
    const project = loadProject(root);
    const result = analyzeImports(project, { entryFile: "src/nope.ts", projectRoot: root });
    expect(result.graph.nodes).toHaveLength(0);
    expect(result.notes.join(" ")).toMatch(/was not found/);
  });
});

describe("traceCallFlow", () => {
  beforeEach(() => clearProjectCache());

  it("finds upstream callers across files", () => {
    const project = loadProject(root);
    const result = traceCallFlow(project, {
      symbol: "buildUrl",
      direction: "callers",
      projectRoot: root,
    });

    const labels = result.graph.nodes.map((n) => n.label).join(" ");
    // buildUrl is called by fetchUserPath, which is called by fetchAdminPath.
    expect(labels).toContain("fetchUserPath");
    expect(labels).toContain("fetchAdminPath");
    expect(result.graph.edges.every((e) => e.label === "calls")).toBe(true);
  });

  it("finds downstream callees", () => {
    const project = loadProject(root);
    const result = traceCallFlow(project, {
      symbol: "fetchAdminPath",
      direction: "callees",
      projectRoot: root,
    });

    const labels = result.graph.nodes.map((n) => n.label).join(" ");
    expect(labels).toContain("fetchUserPath");
  });

  it("notes when a function is never called", () => {
    const project = loadProject(root);
    const result = traceCallFlow(project, {
      symbol: "main",
      direction: "callers",
      projectRoot: root,
    });
    expect(result.notes.join(" ")).toMatch(/never called/);
  });
});

describe("resolveExportOrigins", () => {
  beforeEach(() => clearProjectCache());

  it("resolves a barrel re-export back to the declaring file", () => {
    const project = loadProject(root);
    const barrel = project.getSourceFileOrThrow((sf) =>
      sf.getFilePath().endsWith("src/core/index.ts"),
    );
    const origins = resolveExportOrigins(barrel, root, "API_BASE");

    expect(origins).toHaveLength(1);
    // Declared in config.ts, not in the barrel that re-exports it.
    expect(origins[0]?.file).toBe("src/core/config.ts");
  });
});

describe("toMermaid", () => {
  it("highlights the root and can skip per-file grouping", () => {
    const project = loadProject(root);
    const result = analyzeImports(project, { entryFile: "src/app.ts", projectRoot: root });
    const mermaid = toMermaid(result.graph, { rootId: result.root, groupByFile: false });

    expect(mermaid).toMatch(/:::root/);
    expect(mermaid).not.toContain("subgraph");
  });
});
