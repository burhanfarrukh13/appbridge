#!/usr/bin/env node
/**
 * Fill OWNER/REPO placeholders with the real GitHub repository.
 *
 *   npm run repo:set -- your-name/appbridge
 */
import { readFileSync, writeFileSync } from "node:fs";

const target = process.argv[2];
if (!target || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(target)) {
  console.error("usage: npm run repo:set -- <owner>/<repo>");
  process.exit(1);
}

const files = [
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "docs/status.md",
  "docs/architecture.md",
  ".github/ISSUE_TEMPLATE/config.yml",
  "package.json",
  "packages/cli/package.json",
  "packages/connect/package.json",
  "packages/core/package.json",
  "packages/floor/package.json",
  "packages/gateway/package.json",
  "packages/memory/package.json",
  "packages/providers/package.json",
  "packages/safety/package.json",
];

let changed = 0;
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (!text.includes("OWNER/REPO")) continue;
  const original = text;
  text = text.split("OWNER/REPO").join(target);

  // Turn the commented CI badge into a real one.
  text = text.replace(
    /<!-- After you create the GitHub repo, enable the CI badge:\n(\[!\[CI\][\s\S]*?)\n-->/,
    "$1",
  );
  if (text !== original) {
    writeFileSync(file, text, "utf8");
    changed += 1;
  }
}

if (changed === 0) {
  console.log("No OWNER/REPO placeholders left; nothing to do.");
} else {
  console.log(`Updated ${changed} file(s) for ${target}.`);
  console.log("Next: git add -A && git commit -m \"chore: point metadata at the repository\"");
}
