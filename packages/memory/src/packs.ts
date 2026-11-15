import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  appbridgeHome,
  ensureHome,
  memoryDirFor,
  sha256Hex,
  slugify,
  type Playbook,
} from "@appbridge/core";
import { SkillStore, type Skill } from "./skills.js";
import { MemoryStore } from "./store.js";
import { scanInjection } from "@appbridge/safety";

export interface PackManifest {
  schema: 1;
  app_id: string;
  app_name: string;
  technology: string;
  version_range: string;
  grade: string;
  pack_version: string;
  created_at: string;
  skills_count: number;
  hashes: Record<string, string>;
}

export interface ExportPackOptions {
  app_id: string;
  output_dir?: string;
  target?: "generic" | "claude" | "codex" | "antigravity" | "cursor" | "vscode";
  sanitize?: boolean;
}

export interface SanitizationResult {
  redacted_strings: number;
  masked_paths: number;
  warnings: string[];
}

export function sanitizeText(text: string): { clean: string; count: number } {
  let count = 0;
  // Mask API keys and bearer tokens
  let clean = text.replace(/(?:key|token|secret|password|bearer)\s*[:=]\s*["']?([a-zA-Z0-9_\-\.]{16,})["']?/gi, (match) => {
    count++;
    return match.replace(/([a-zA-Z0-9_\-\.]{16,})/, "[REDACTED_SECRET]");
  });
  // Mask personal user directories e.g. C:\Users\username or /home/username
  clean = clean.replace(/(?:[C-Z]:\\Users\\|\/home\/)([a-zA-Z0-9_\-]+)/gi, (_match, user) => {
    count++;
    return `[USER_HOME]`;
  });
  return { clean, count };
}

export function generateSkillMarkdown(playbook: Playbook, skills: Skill[]): string {
  const lines: string[] = [
    `# Skill: ${playbook.app.name}`,
    ``,
    `> Technology: ${playbook.app.technology} | Grade: ${playbook.grade}`,
    ``,
    `## Overview`,
    `This App Pack enables AI agents to operate **${playbook.app.name}** through Appbridge.`,
    ``,
    `## Known Window Titles`,
    ...(playbook.app.window_titles.length ? playbook.app.window_titles.map((t) => `- "${t}"`) : [`- Any matching window`]),
    ``,
    `## Available Compiled Skills`,
  ];

  if (skills.length === 0) {
    lines.push(`No compiled skills saved yet. Use tool mode or teach mode to compile skills.`);
  } else {
    for (const skill of skills) {
      lines.push(`### \`${skill.name}\` (\`${skill.id}\`)`);
      lines.push(`- **Description:** ${skill.description}`);
      lines.push(`- **Risk Class:** ${skill.risk}`);
      lines.push(`- **Steps:** ${skill.steps.length}`);
      if (Object.keys(skill.params).length > 0) {
        lines.push(`- **Parameters:**`);
        for (const [p, spec] of Object.entries(skill.params)) {
          lines.push(`  - \`${p}\` (${spec.type}${spec.required !== false ? ", required" : ""}): ${spec.description ?? ""}`);
        }
      }
      lines.push(``);
    }
  }

  lines.push(
    `## Safety & Approvals`,
    `All actions are filtered by Appbridge's Action Firewall on the local device.`,
    `Irreversible actions (delete, overwrite, send, purchase) always require human approval.`,
    ``,
    `## How to Connect`,
    `Ensure the Appbridge daemon or MCP server is running on the local machine:`,
    `\`\`\`json`,
    `{`,
    `  "mcpServers": {`,
    `    "appbridge": {`,
    `      "command": "appbridge",`,
    `      "args": ["mcp"]`,
    `    }`,
    `  }`,
    `}\`\`\``,
  );

  return lines.join("\n");
}

export function generateOnboardPrompt(app_name: string, mcpConfigPath: string): string {
  return `# Instructions for AI Agent

You have received an **App Pack** for **${app_name}**.

1. **Verify Connection**:
   Check if you can access Appbridge by running the MCP tool \`session.status\` or \`apps.list\`.
   If Appbridge is not yet configured, add the entry in \`${mcpConfigPath}\`.

2. **Understand Capabilities**:
   Read \`SKILL.md\` and \`references/playbook.md\` to see what actions and compiled skills are available.

3. **Respect Safety Boundaries**:
   Appbridge enforces local user permissions. If an action returns \`needs_human\` or requires an approval, explain the situation clearly to the user with the approval id and wait for confirmation.

4. **Execute Skills**:
   Prefer calling compiled skills via \`skill.run\` with parameters instead of individual fine-grained clicks when available.
`;
}

export class AppPackManager {
  readonly home: string;
  readonly memory: MemoryStore;
  readonly skills: SkillStore;

  constructor(home: string = appbridgeHome()) {
    this.home = ensureHome(home).home;
    this.memory = new MemoryStore(this.home);
    this.skills = new SkillStore(this.home);
  }

  async exportPack(options: ExportPackOptions): Promise<{ pack_dir: string; manifest: PackManifest; sanitization: SanitizationResult }> {
    const appId = slugify(options.app_id);
    const playbook = await this.memory.get(appId);
    if (!playbook) {
      throw new Error(`no playbook found for app: ${options.app_id}`);
    }

    const summaries = await this.skills.list(appId);
    const skillList: Skill[] = [];
    for (const s of summaries) {
      const full = await this.skills.get(appId, s.id);
      if (full) skillList.push(full);
    }

    const outRoot = options.output_dir ?? join(this.home, "packs");
    const packDir = join(outRoot, `${appId}-pack`);
    await mkdir(join(packDir, "references"), { recursive: true });
    await mkdir(join(packDir, "skills"), { recursive: true });
    await mkdir(join(packDir, "connect"), { recursive: true });

    let redactedCount = 0;
    const warnings: string[] = [];

    // 1. References
    const playbookMd = `# Playbook: ${playbook.app.name}\n\nTechnology: ${playbook.app.technology}\nGrade: ${playbook.grade}\n\n## Controls Mapped: ${playbook.ui_map.windows[0]?.controls.length ?? 0}\n`;
    await writeFile(join(packDir, "references", "playbook.md"), playbookMd, "utf8");

    const riskLines = [`# Risk Map: ${playbook.app.name}`, ""];
    for (const r of playbook.risk_map) {
      riskLines.push(`- ${r.effect.padEnd(16)} ${r.match.role ?? "*"}:${r.match.name}`);
    }
    await writeFile(join(packDir, "references", "risk-map.md"), riskLines.join("\n"), "utf8");

    // 2. Skills
    const hashes: Record<string, string> = {};
    for (const skill of skillList) {
      let content = JSON.stringify(skill, null, 2);
      if (options.sanitize !== false) {
        const san = sanitizeText(content);
        content = san.clean;
        redactedCount += san.count;
      }
      const filename = `${skill.id}.json`;
      await writeFile(join(packDir, "skills", filename), content, "utf8");
      hashes[`skills/${filename}`] = sha256Hex(content);
    }

    // 3. Connect config
    const mcpConfig = {
      mcpServers: {
        appbridge: {
          command: "appbridge",
          args: ["mcp"],
        },
      },
    };
    await writeFile(join(packDir, "connect", "mcp.json"), JSON.stringify(mcpConfig, null, 2), "utf8");

    // 4. SKILL.md
    const skillMd = generateSkillMarkdown(playbook, skillList);
    await writeFile(join(packDir, "SKILL.md"), skillMd, "utf8");
    hashes["SKILL.md"] = sha256Hex(skillMd);

    // 5. Onboard prompt
    const onboardPrompt = generateOnboardPrompt(playbook.app.name, "connect/mcp.json");
    await writeFile(join(packDir, "ONBOARD_PROMPT.md"), onboardPrompt, "utf8");

    // 6. Sanitization report
    const sanitization: SanitizationResult = {
      redacted_strings: redactedCount,
      masked_paths: 0,
      warnings,
    };
    await writeFile(
      join(packDir, "SANITIZATION_REPORT.md"),
      `# Sanitization Report\n\n- Redacted sensitive tokens/keys: ${redactedCount}\n- Warnings: ${warnings.length}\n`,
      "utf8",
    );

    // 7. Manifest
    const manifest: PackManifest = {
      schema: 1,
      app_id: appId,
      app_name: playbook.app.name,
      technology: playbook.app.technology,
      version_range: ">=1.0.0",
      grade: playbook.grade,
      pack_version: "1.0.0",
      created_at: new Date().toISOString(),
      skills_count: skillList.length,
      hashes,
    };
    await writeFile(join(packDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

    return { pack_dir: packDir, manifest, sanitization };
  }

  async importPack(packDir: string): Promise<{ ok: boolean; app_id: string; skills_imported: number; warnings: string[] }> {
    const manifestPath = join(packDir, "manifest.json");
    if (!existsSync(manifestPath)) {
      throw new Error(`invalid pack: missing manifest.json at ${packDir}`);
    }

    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as PackManifest;
    if (manifest.schema !== 1) throw new Error("unsupported pack schema version");

    const warnings: string[] = [];
    const skillsDir = join(packDir, "skills");
    let imported = 0;

    if (existsSync(skillsDir)) {
      const files = await readdir(skillsDir);
      for (const file of files.filter((f) => f.endsWith(".json"))) {
        const text = await readFile(join(skillsDir, file), "utf8");
        // Scan for prompt injection / hostile instructions in skill definition
        const injections = scanInjection(text);
        if (injections.length > 0) {
          warnings.push(`potential instruction injection in ${file}: ${injections.join(", ")}`);
        }
        const skill = JSON.parse(text) as Skill;
        skill.app_id = manifest.app_id;
        skill.source = "imported";
        await this.skills.save(skill);
        imported++;
      }
    }

    return { ok: true, app_id: manifest.app_id, skills_imported: imported, warnings };
  }
}
