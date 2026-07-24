/**
 * Shared symbol utilities used by every analysis producer.
 *
 * Extracted so the variable tracer, call-flow analyzer, and import analyzer all
 * classify locations and declarations the same way.
 */
import { Node, Project, SyntaxKind, type Identifier } from "ts-morph";
import { norm, relFile } from "./project.js";
import type { NodeKind } from "./types.js";

export interface Located {
  id: string;
  file: string;
  line: number;
  column: number;
}

/** Resolve a node's location into a stable id + display coordinates. */
export function locate(node: Node, projectRoot: string): Located {
  const sf = node.getSourceFile();
  const { line, column } = sf.getLineAndColumnAtPos(node.getStart());
  const file = relFile(sf.getFilePath(), projectRoot);
  return { id: `${file}:${line}:${column}`, file, line, column };
}

/** If `node` is a named declaration with a simple identifier name, return it. */
export function asDeclaration(node: Node): { decl: Node; name: Identifier } | undefined {
  if (
    Node.isVariableDeclaration(node) ||
    Node.isFunctionDeclaration(node) ||
    Node.isParameterDeclaration(node) ||
    Node.isClassDeclaration(node) ||
    Node.isBindingElement(node)
  ) {
    const nameNode = node.getNameNode();
    if (nameNode && Node.isIdentifier(nameNode)) return { decl: node, name: nameNode };
  }
  return undefined;
}

/** Classify a reference by the syntactic context it appears in. */
export function classifyReference(node: Node): NodeKind {
  if (
    node.getFirstAncestorByKind(SyntaxKind.ImportSpecifier) ||
    node.getFirstAncestorByKind(SyntaxKind.ImportClause) ||
    node.getFirstAncestorByKind(SyntaxKind.NamespaceImport)
  ) {
    return "import";
  }
  if (node.getFirstAncestorByKind(SyntaxKind.ExportSpecifier)) return "export";
  return "reference";
}

/**
 * Turn a user-supplied path into ts-morph's normalized absolute form.
 * Accepts absolute paths (POSIX or Windows) and paths relative to the root.
 */
export function resolveUserPath(filePath: string, projectRoot: string): string {
  const isAbsolute = /^([a-zA-Z]:)?[\\/]/.test(filePath);
  return norm(isAbsolute ? filePath : `${projectRoot}/${filePath}`);
}

/** Collect every simple-identifier declaration named `symbol`. */
export function collectDeclarations(
  project: Project,
  symbol: string,
  filterFile?: string,
): Array<{ decl: Node; name: Identifier }> {
  const found: Array<{ decl: Node; name: Identifier }> = [];
  for (const sf of project.getSourceFiles()) {
    if (filterFile && norm(sf.getFilePath()) !== filterFile) continue;
    sf.forEachDescendant((node) => {
      const named = asDeclaration(node);
      if (named && named.name.getText() === symbol) found.push(named);
    });
  }
  return found;
}

/** True when a node is any callable form. */
export function isFunctionLike(node: Node): boolean {
  return (
    Node.isFunctionDeclaration(node) ||
    Node.isMethodDeclaration(node) ||
    Node.isArrowFunction(node) ||
    Node.isFunctionExpression(node)
  );
}

/**
 * Best-effort display name for a callable. Arrow functions and function
 * expressions borrow the name of the binding they are assigned to.
 */
export function functionName(fn: Node): string {
  if (Node.isFunctionDeclaration(fn) || Node.isMethodDeclaration(fn)) {
    return fn.getName() ?? "<anonymous>";
  }
  const parent = fn.getParent();
  if (parent && Node.isVariableDeclaration(parent)) return parent.getName();
  if (parent && Node.isPropertyAssignment(parent)) return parent.getName();
  return "<anonymous>";
}

/** The nearest enclosing callable, i.e. the function a node lives inside. */
export function enclosingFunction(node: Node): { fn: Node; name: string } | undefined {
  const fn = node.getFirstAncestor(isFunctionLike);
  if (!fn) return undefined;
  return { fn, name: functionName(fn) };
}
