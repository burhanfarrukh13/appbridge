#!/usr/bin/env node
/**
 * Verify that `npm install -g @appbridge/cli` would actually work.
 *
 * The packages were private until now, so nothing checked that a tarball contains what it
 * needs at runtime. The one that bites is the native host: `packages/floor` resolves
 * `../native/uia-host.ps1` relative to its own dist, so `native/` must be in its tarball
 * or every installed copy fails at the first UI Automation call.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const workspaces = [
  "core",
  "safety",
  "floor",
  "memory",
  "providers",
  "gateway",
  "connect",
  "cli",
];

const requiredFiles = {
  floor: ["dist/index.js", "dist/native-host.js", "native/uia-host.ps1"],
  cli: ["dist/index.js", "dist/index.d.ts"],
  gateway: ["dist/index.js", "dist/mcp.js", "dist/http.js"],
};

let failures = 0;

for (const workspace of workspaces) {
  const manifest = JSON.parse(
    readFileSync(new URL(`../packages/${workspace}/package.json`, import.meta.url), "utf8"),
  );
  const label = manifest.name ?? workspace;

  if (manifest.private === true) {
    console.log(`FAIL ${label}: still private, npm publish would refuse it`);
    failures += 1;
    continue;
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    console.log(`FAIL ${label}: no "files" whitelist, the tarball would guess`);
    failures += 1;
    continue;
  }

  // npm is a .cmd shim on Windows, so this has to go through a shell; the label comes
  // from the package manifest, never from user input.
  const output = execSync(`npm pack --dry-run --json --workspace ${label}`, {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  // npm returns an object keyed by package name for one --workspace, an array for many.
  const parsed = JSON.parse(output);
  const info = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
  const packed = new Set(info.files.map((file) => file.path));

  const missing = (requiredFiles[workspace] ?? ["dist/index.js"]).filter(
    (file) => !packed.has(file),
  );
  if (missing.length > 0) {
    console.log(`FAIL ${label}: tarball is missing ${missing.join(", ")}`);
    failures += 1;
    continue;
  }

  // A bin entry without a shebang installs a command the shell cannot run.
  if (workspace === "cli") {
    const bin = manifest.bin?.appbridge;
    if (!bin) {
      console.log(`FAIL ${label}: no appbridge bin entry`);
      failures += 1;
      continue;
    }
    const source = readFileSync(new URL(`../packages/cli/${bin}`, import.meta.url), "utf8");
    if (!source.startsWith("#!")) {
      console.log(`FAIL ${label}: ${bin} has no shebang, npm i -g would install a broken command`);
      failures += 1;
      continue;
    }
  }

  console.log(`ok   ${label}: ${packed.size} files, ${info.size} bytes packed`);
}

if (failures > 0) {
  console.error(`\n${failures} package(s) cannot be published as-is.`);
  process.exit(1);
}
console.log("\nAll workspaces pack for install.");
