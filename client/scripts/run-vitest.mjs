import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function resolveVitestCliPath() {
  const vitestEntryPath = require.resolve("vitest");
  const vitestPackageDir =
    path.basename(path.dirname(vitestEntryPath)) === "dist"
      ? path.dirname(path.dirname(vitestEntryPath))
      : path.dirname(vitestEntryPath);
  const vitestPkg = JSON.parse(fs.readFileSync(path.join(vitestPackageDir, "package.json"), "utf8"));
  const vitestBin = typeof vitestPkg.bin === "string" ? vitestPkg.bin : vitestPkg.bin?.vitest;

  if (!vitestBin) {
    throw new Error("Could not resolve Vitest CLI entry from public package metadata.");
  }

  return path.resolve(vitestPackageDir, vitestBin);
}

const vitestPath = resolveVitestCliPath();

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(scriptDir, "..");
const localStorageFile = path.join(os.tmpdir(), `yasp-vitest-localstorage-${process.pid}-${Date.now()}.json`);

// --localstorage-file is only available in Node 22+.
const nodeVersion = process.versions.node.split(".").map(Number);
const supportsLocalStorageFile = nodeVersion[0] >= 22;

function formatNodeOptionValue(value) {
  if (!/\s/.test(value)) {
    return value;
  }

  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function normalizeNodeOptions(nodeOptions = "") {
  const withoutLocalStorageFile = nodeOptions
    .replace(/(?:^|\s)--localstorage-file(?:=(?:"[^"]*"|'[^']*'|[^\s]+))?/g, " ")
    .trim();

  if (!supportsLocalStorageFile) {
    return withoutLocalStorageFile;
  }

  return [withoutLocalStorageFile, `--localstorage-file=${formatNodeOptionValue(localStorageFile)}`]
    .filter(Boolean)
    .join(" ");
}

function cleanupLocalStorageFile() {
  try {
    fs.rmSync(localStorageFile, { force: true });
  } catch {
    // Best-effort cleanup for test-only state.
  }
}

cleanupLocalStorageFile();

const child = spawn(process.execPath, [vitestPath, ...process.argv.slice(2)], {
  cwd: clientDir,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: normalizeNodeOptions(process.env.NODE_OPTIONS),
  },
});

child.on("exit", (code, signal) => {
  cleanupLocalStorageFile();

  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
