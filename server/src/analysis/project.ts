/**
 * ts-morph `Project` loader with a warm cache.
 *
 * Loading + type-resolving a TypeScript project is expensive, so the MCP server
 * (a long-lived process) caches one `Project` per resolved project root. Repeat
 * tool calls against the same workspace reuse the in-memory instance.
 */
import { Project } from "ts-morph";
import * as fs from "node:fs";
import * as path from "node:path";

/** Normalize a filesystem path to forward slashes (ts-morph's convention). */
export function norm(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Workspace-relative, forward-slashed path for display and node ids. */
export function relFile(absPath: string, projectRoot: string): string {
  return norm(path.relative(projectRoot, absPath)) || norm(absPath);
}

const cache = new Map<string, Project>();

/** Locate the nearest `tsconfig.json` at or above `projectRoot`. */
function findTsConfig(projectRoot: string): string | undefined {
  let dir = path.resolve(projectRoot);
  // Walk up a few levels so monorepo package roots still resolve.
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "tsconfig.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Load (or reuse) a ts-morph `Project` for `projectRoot`. When a `tsconfig.json`
 * is present it drives file discovery and compiler options; otherwise we glob
 * `.ts`/`.tsx` sources with permissive defaults.
 */
export function loadProject(projectRoot: string): Project {
  const root = path.resolve(projectRoot);
  const tsConfigFilePath = findTsConfig(root);
  const key = tsConfigFilePath ? norm(tsConfigFilePath) : norm(root);

  const cached = cache.get(key);
  if (cached) return cached;

  let project: Project;
  if (tsConfigFilePath) {
    project = new Project({ tsConfigFilePath });
  } else {
    project = new Project({
      compilerOptions: { allowJs: true, jsx: 4 /* react-jsx */ },
    });
    project.addSourceFilesAtPaths([
      norm(path.join(root, "**/*.ts")),
      norm(path.join(root, "**/*.tsx")),
      `!${norm(path.join(root, "**/node_modules/**"))}`,
    ]);
  }

  cache.set(key, project);
  return project;
}

/** Test-only: clear the warm cache so fixtures don't bleed across cases. */
export function clearProjectCache(): void {
  cache.clear();
}
