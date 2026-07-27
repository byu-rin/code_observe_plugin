/**
 * Module + export resolution.
 *
 * Handles the cases that make "where did this come from?" hard in real
 * codebases: tsconfig `paths` aliases, barrel files (`export * from './x'`),
 * and re-export chains. ts-morph's module resolution already honours the
 * tsconfig, so aliases resolve for free; `getExportedDeclarations()` walks
 * re-export chains back to the originating declaration.
 */
import type { ExportDeclaration, ImportDeclaration, SourceFile } from "ts-morph";
import { relFile } from "./project.js";

/** Any declaration that can point at another module via a specifier. */
export type ModuleRef = ImportDeclaration | ExportDeclaration;

/** A module the graph can point at, whether or not it is in the project. */
export interface ResolvedModule {
  /** Workspace-relative path for in-project files, else the raw specifier. */
  id: string;
  label: string;
  /** Undefined for externals (node_modules) and unresolvable specifiers. */
  sourceFile?: SourceFile;
  external: boolean;
}

/** node_modules files are treated as opaque leaves so graphs stay bounded. */
function isExternalFile(sf: SourceFile): boolean {
  return sf.getFilePath().includes("/node_modules/");
}

/**
 * Resolve an import *or* re-export declaration to the module it refers to.
 * Falls back to an external node when the specifier points outside the project
 * or cannot be resolved (missing types, unbuilt package, …). Returns undefined
 * for `export { a }` forms that carry no module specifier.
 */
export function resolveModuleRef(
  decl: ModuleRef,
  projectRoot: string,
): ResolvedModule | undefined {
  const specifier = decl.getModuleSpecifierValue();
  if (!specifier) return undefined;

  const target = decl.getModuleSpecifierSourceFile();
  if (!target || isExternalFile(target)) {
    return { id: specifier, label: specifier, external: true };
  }

  const id = relFile(target.getFilePath(), projectRoot);
  return { id, label: id, sourceFile: target, external: false };
}

/** The names an import declaration pulls in, for edge labelling. */
export function importedNames(decl: ImportDeclaration): string[] {
  const names: string[] = [];

  const defaultImport = decl.getDefaultImport();
  if (defaultImport) names.push(`default as ${defaultImport.getText()}`);

  const namespaceImport = decl.getNamespaceImport();
  if (namespaceImport) names.push(`* as ${namespaceImport.getText()}`);

  for (const named of decl.getNamedImports()) {
    const alias = named.getAliasNode();
    names.push(alias ? `${named.getName()} as ${alias.getText()}` : named.getName());
  }

  // A bare `import './side-effect'` imports no bindings.
  return names;
}

/** The names a re-export declaration forwards, for edge labelling. */
export function reExportedNames(decl: ExportDeclaration): string[] {
  if (decl.isNamespaceExport()) return ["*"];
  return decl.getNamedExports().map((named) => {
    const alias = named.getAliasNode();
    return alias ? `${named.getName()} as ${alias.getText()}` : named.getName();
  });
}

export interface ExportOrigin {
  name: string;
  /** File where the export is actually declared, after following barrels. */
  file: string;
  line: number;
}

/**
 * Follow `sourceFile`'s exports back to where each one is really declared.
 * A barrel that re-exports from several modules resolves to those modules,
 * not to the barrel itself — which is the whole point when tracing origins.
 */
export function resolveExportOrigins(
  sourceFile: SourceFile,
  projectRoot: string,
  only?: string,
): ExportOrigin[] {
  const origins: ExportOrigin[] = [];

  for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
    if (only && name !== only) continue;
    for (const declaration of declarations) {
      const declSf = declaration.getSourceFile();
      origins.push({
        name,
        file: relFile(declSf.getFilePath(), projectRoot),
        line: declSf.getLineAndColumnAtPos(declaration.getStart()).line,
      });
    }
  }

  return origins;
}
