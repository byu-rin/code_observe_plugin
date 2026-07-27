import { describe, it, expect, beforeEach } from "vitest";
import { fileURLToPath } from "node:url";
import { clearProjectCache, loadProject } from "../src/analysis/project.js";
import { traceStateFlow } from "../src/analysis/react-hooks.js";
import { toMermaid } from "../src/output/mermaid.js";

const root = fileURLToPath(new URL("./fixtures/react", import.meta.url));

describe("traceStateFlow — useState", () => {
  beforeEach(() => clearProjectCache());

  it("identifies the state, its setter, and the setter's call site", () => {
    const project = loadProject(root);
    const result = traceStateFlow(project, { symbol: "count", projectRoot: root });

    const rootNode = result.graph.nodes.find((n) => n.id === result.root);
    expect(rootNode?.kind).toBe("state");
    expect(rootNode?.file).toBe("src/Counter.tsx");

    const setter = result.graph.nodes.find((n) => n.kind === "setter");
    expect(setter?.label).toContain("setCount");

    // The setter is updated from inside `increment`.
    const callSite = result.graph.nodes.find((n) => n.label.includes("calls setCount"));
    expect(callSite?.label).toContain("increment");

    // Direction matters: the setter writes *into* the state.
    expect(result.graph.edges).toContainEqual(
      expect.objectContaining({ to: result.root, label: "updates" }),
    );
  });

  it("detects state crossing into a child component as a prop", () => {
    const project = loadProject(root);
    const result = traceStateFlow(project, { symbol: "count", projectRoot: root });

    const prop = result.graph.nodes.find((n) => n.kind === "prop");
    expect(prop?.label).toContain("Display");
    expect(prop?.label).toContain("count={count}");
    expect(result.graph.edges).toContainEqual(
      expect.objectContaining({ from: result.root, to: prop?.id, label: "passed as prop" }),
    );
  });
});

describe("traceStateFlow — context", () => {
  beforeEach(() => clearProjectCache());

  it("links a createContext definition to its provider and consumer", () => {
    const project = loadProject(root);
    const result = traceStateFlow(project, { symbol: "ThemeContext", projectRoot: root });

    const provider = result.graph.nodes.find((n) => n.kind === "provider");
    expect(provider?.label).toContain("ThemeContext.Provider");
    // The provider's value expression is surfaced, not just its existence.
    expect(provider?.label).toContain("value={theme}");

    const consumer = result.graph.nodes.find((n) => n.kind === "consumer");
    expect(consumer?.label).toContain("useTheme");
  });

  it("links a useContext binding back to the providers that supply it", () => {
    const project = loadProject(root);
    const result = traceStateFlow(project, { symbol: "activeTheme", projectRoot: root });

    const rootNode = result.graph.nodes.find((n) => n.id === result.root);
    expect(rootNode?.kind).toBe("consumer");

    const provider = result.graph.nodes.find((n) => n.kind === "provider");
    expect(provider).toBeDefined();
    expect(result.graph.edges).toContainEqual(
      expect.objectContaining({ from: provider?.id, to: result.root, label: "provides" }),
    );
  });
});

describe("Mermaid rendering of JSX labels", () => {
  beforeEach(() => clearProjectCache());

  it("encodes angle brackets instead of dropping them", () => {
    const project = loadProject(root);
    const result = traceStateFlow(project, { symbol: "count", projectRoot: root });
    const mermaid = toMermaid(result.graph, { rootId: result.root });

    // The prop crossing must still read as JSX, not as `Display count=count`.
    expect(mermaid).toContain("&lt;Display count={count}&gt;");
    expect(mermaid).not.toMatch(/\[""/); // no empty/garbled labels
  });
});

describe("traceStateFlow — ambiguity", () => {
  beforeEach(() => clearProjectCache());

  it("warns instead of silently picking when a name has several declarations", () => {
    const project = loadProject(root);
    // `theme` is bound by useState in ThemeProvider and appears elsewhere too.
    const result = traceStateFlow(project, { symbol: "theme", projectRoot: root });
    expect(result.notes.join(" ")).toMatch(/declarations named "theme"; tracing the one at/);
  });
});

describe("traceStateFlow — non-React values", () => {
  beforeEach(() => clearProjectCache());

  it("notes when the symbol is not bound to a state hook", () => {
    const project = loadProject(root);
    const result = traceStateFlow(project, { symbol: "Display", projectRoot: root });
    expect(result.notes.join(" ")).toMatch(/not bound to a React state hook/);
  });

  it("notes when the symbol does not exist", () => {
    const project = loadProject(root);
    const result = traceStateFlow(project, { symbol: "nope", projectRoot: root });
    expect(result.graph.nodes).toHaveLength(0);
    expect(result.notes.join(" ")).toMatch(/No declaration named/);
  });
});
