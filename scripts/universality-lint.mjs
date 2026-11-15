#!/usr/bin/env node
/**
 * Universality Contract lint (plan section 3.2): zero app or vendor names in
 * core code. App knowledge belongs in data (Playbooks, Skills, packs), never in
 * packages. Technology-class names (win32, chromium, java, qt, ...) are allowed:
 * routing is by technology, not brand.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const packagesDir = join(ROOT, "packages");
const PACKAGES = readdirSync(packagesDir).filter((name) => {
  try {
    return statSync(join(packagesDir, name)).isDirectory();
  } catch {
    return false;
  }
});

const FORBIDDEN = [
  "outlook",
  "microsoft word",
  "ms word",
  "powerpoint",
  "onenote",
  "sharepoint",
  "microsoft teams",
  "teams",
  "slack",
  "discord",
  "gmail",
  "google docs",
  "google sheets",
  "salesforce",
  "quickbooks",
  "sap gui",
  "jira",
  "confluence",
  "trello",
  "asana",
  "zoom",
  "skype",
  "dropbox",
  "notion",
  "evernote",
  "obsidian",
  "visual studio code",
  "intellij",
  "photoshop",
  "illustrator",
  "figma",
  "spotify",
  "whatsapp",
  "telegram",
  "wunderlist",
];

const EXTENSIONS = new Set([".ts", ".ps1", ".mjs", ".js"]);

function walk(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(path, found);
    } else if (EXTENSIONS.has(path.slice(path.lastIndexOf(".")))) {
      found.push(path);
    }
  }
  return found;
}

const violations = [];
for (const pkg of PACKAGES) {
  const dir = join(ROOT, "packages", pkg);
  let files = [];
  try {
    files = walk(dir);
  } catch {
    continue;
  }
  for (const file of files) {
    if (file.includes(".test.")) continue;
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    for (const word of FORBIDDEN) {
      const pattern = new RegExp(`(?:^|[^a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z])`, "i");
      lines.forEach((line, index) => {
        if (pattern.test(line)) {
          violations.push({ file: relative(ROOT, file), line: index + 1, word });
        }
      });
    }
  }
}

if (violations.length > 0) {
  console.error("Universality Contract violated: app or vendor names found in core packages.");
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line}  "${violation.word}"`);
  }
  console.error("Move this knowledge into Playbooks, Skills or App Packs (data), not code.");
  process.exit(1);
}
console.log(`Universality Contract: clean (${PACKAGES.length} packages scanned, no app or vendor names).`);
