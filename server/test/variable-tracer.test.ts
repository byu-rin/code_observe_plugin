import { describe, it, expect, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import { clearProjectCache, loadProject } from "../src/analysis/project.js";
import { traceVariable } from "../src/analysis/variable-tracer.js";
import { toMermaid } from "../src/output/mermaid.js";

const fixtureRoot = fileURLToPath(new URL("./fixtures/basic", import.meta.url));

describe("traceVariable", () => {
  beforeEach(() => clearProjectCache());

  it("finds the declaration and classifies cross-file references", () => {
    const project = loadProject(fixtureRoot);
    const result = traceVariable(project, { symbol: "initialCount", projectRoot: fixtureRoot });

    // Declaration is the root and lives in store.ts.
    const root = result.graph.nodes.find((n) => n.id === result.root);
    expect(root?.kind).toBe("declaration");
    expect(root?.file).toBe("src/store.ts");

    // Reference set spans both files.
    const files = new Set(result.graph.nodes.map((n) => n.file));
    expect(files).toContain("src/store.ts");
    expect(files).toContain("src/app.ts");

    // The import in app.ts is classified as an import node.
    expect(result.graph.nodes.some((n) => n.kind === "import")).toBe(true);

    // Every non-root node has an edge from the declaration.
    const nonRoot = result.graph.nodes.filter((n) => n.id !== result.root);
    expect(result.graph.edges.length).toBe(nonRoot.length);
    expect(nonRoot.length).toBeGreaterThanOrEqual(2);
  });

  it("reports a note when the symbol is not found", () => {
    const project = loadProject(fixtureRoot);
    const result = traceVariable(project, { symbol: "doesNotExist", projectRoot: fixtureRoot });
    expect(result.root).toBeUndefined();
    expect(result.graph.nodes).toHaveLength(0);
    expect(result.notes.join(" ")).toMatch(/No simple-identifier declaration/);
  });

  it("renders a valid Mermaid flowchart with per-file subgraphs", () => {
    const project = loadProject(fixtureRoot);
    const result = traceVariable(project, { symbol: "initialCount", projectRoot: fixtureRoot });
    const mermaid = toMermaid(result.graph);

    expect(mermaid.startsWith("flowchart TD")).toBe(true);
    expect(mermaid).toContain('subgraph f0["src/store.ts"]');
    expect(mermaid).toMatch(/:::decl/);
    expect(mermaid).toMatch(/-->\|.+\|/); // labeled edge
  });
});
