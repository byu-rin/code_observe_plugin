#!/usr/bin/env node
/**
 * Bootstrap hook: install deps and build the MCP server if needed.
 *
 * Runs on SessionStart. Compares package.json hash with a cached version to
 * avoid reinstalling if nothing changed. This lets Code Archaeologist work
 * out-of-the-box after clone with no manual `npm install`.
 *
 * Cross-platform: uses Node.js, not bash, for Windows compatibility.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
const serverDir = path.join(pluginRoot, "server");
const packageJsonPath = path.join(serverDir, "package.json");
const distDir = path.join(serverDir, "dist");
const cacheDir = path.join(serverDir, ".bootstrap-cache");
const hashPath = path.join(cacheDir, "package.json.sha256");

function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}

function log(msg) {
  console.error(`[bootstrap] ${msg}`);
}

try {
  // Ensure cache directory exists.
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const packageJsonContent = fs.readFileSync(packageJsonPath, "utf8");
  const currentHash = hash(packageJsonContent);
  const cachedHash = fs.existsSync(hashPath) ? fs.readFileSync(hashPath, "utf8").trim() : "";

  const needsInstall = currentHash !== cachedHash || !fs.existsSync(distDir);

  if (!needsInstall) {
    log("package.json unchanged, dist/ exists. Skipping install & build.");
    process.exit(0);
  }

  log("Installing dependencies...");
  execSync("npm install", { cwd: serverDir, stdio: "inherit" });

  log("Building TypeScript...");
  execSync("npm run build", { cwd: serverDir, stdio: "inherit" });

  // Cache the hash for next time.
  fs.writeFileSync(hashPath, currentHash);
  log("Bootstrap complete.");
} catch (error) {
  log(`Error: ${error.message}`);
  process.exit(1);
}
