/**
 * Import/export dependency graph (Phase 2).
 *
 * Walks the module graph outward from an entry file, depth-limited and
 * cycle-safe. Externals (node_modules) become leaf nodes so the graph shows
 * third-party boundaries without exploding into their internals.
 */
import type { Project, SourceFile } from "ts-morph";
import { relFile } from "./project.js";
import { GraphAccumulator, TraversalGuard } from "./graph-builder.js";
import { importedNames, reExportedNames, resolveModuleRef } from "./resolver.js";
import { resolveUserPath } from "./symbols.js";
import type { TraceResult } from "./types.js";

export interface ImportGraphOptions {
  /** Entry file, relative to `projectRoot` or absolute. */
  entryFile: string;
  projectRoot: string;
  /** How many module hops to follow. Keeps graphs readable. */
  maxDepth?: number;
}

const MAX_LABEL_NAMES = 3;

function edgeLabel(names: string[]): string {
  if (names.length === 0) return "side-effect import";
  if (names.length <= MAX_LABEL_NAMES) return names.join(", ");
  return `${names.slice(0, MAX_LABEL_NAMES).join(", ")} +${names.length - MAX_LABEL_NAMES} more`;
}

export function analyzeImports(project: Project, opts: ImportGraphOptions): TraceResult {
  const { projectRoot, maxDepth = 3 } = opts;
  const notes: string[] = [];
  const graph = new GraphAccumulator();

  const wanted = resolveUserPath(opts.entryFile, projectRoot);
  const entry = project.getSourceFile((sf) => sf.getFilePath() === wanted);

  if (!entry) {
    notes.push(
      `Entry file "${opts.entryFile}" was not found in the project. ` +
        `Check the path, or that it is covered by the tsconfig "include".`,
    );
    return { symbol: opts.entryFile, graph: { nodes: [], edges: [] }, notes };
  }

  const rootId = relFile(entry.getFilePath(), projectRoot);
  const guard = new TraversalGuard(maxDepth);

  const addModuleNode = (id: string, label: string, external: boolean): void => {
    graph.addNode({
      id,
      label: external ? `${label} · external` : label,
      kind: external ? "external" : "module",
      file: id,
      line: 0,
      column: 0,
    });
  };

  addModuleNode(rootId, rootId, false);

  const walk = (sf: SourceFile, depth: number): void => {
    const fromId = relFile(sf.getFilePath(), projectRoot);
    guard.enter(fromId);

    for (const decl of sf.getImportDeclarations()) {
      const resolved = resolveModuleRef(decl, projectRoot);
      if (!resolved) continue;
      addModuleNode(resolved.id, resolved.label, resolved.external);
      graph.addEdge({
        from: fromId,
        to: resolved.id,
        label: edgeLabel(importedNames(decl)),
      });

      if (resolved.sourceFile && guard.canVisit(resolved.id, depth + 1)) {
        walk(resolved.sourceFile, depth + 1);
      }
    }

    // Barrel files reach their origins via `export ... from`, not imports.
    // Following these is what makes a barrel transparent instead of a dead end.
    for (const decl of sf.getExportDeclarations()) {
      const resolved = resolveModuleRef(decl, projectRoot);
      if (!resolved) continue;
      addModuleNode(resolved.id, resolved.label, resolved.external);
      graph.addEdge({
        from: fromId,
        to: resolved.id,
        label: `re-exports ${edgeLabel(reExportedNames(decl))}`,
      });

      if (resolved.sourceFile && guard.canVisit(resolved.id, depth + 1)) {
        walk(resolved.sourceFile, depth + 1);
      }
    }

    guard.leave(fromId);
  };

  walk(entry, 0);
  notes.push(...guard.cycleNotes);

  if (graph.size === 1) {
    notes.push(`"${rootId}" has no imports or re-exports.`);
  }

  return { symbol: rootId, root: rootId, graph: graph.build(), notes };
}
