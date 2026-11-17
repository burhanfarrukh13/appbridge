import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import test from "node:test";

test("MCP client can connect while operator controls stay unavailable as tools", async () => {
  const home = mkdtempSync(join(tmpdir(), "appbridge-mcp-client-"));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(process.cwd(), "packages", "cli", "dist", "index.js"), "mcp"],
    cwd: process.cwd(),
    env: { ...getDefaultEnvironment(), APPBRIDGE_HOME: home },
    stderr: "pipe",
  });
  const client = new Client({ name: "appbridge-mcp-smoke", version: "1.0.0" });

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const toolNames = new Set(tools.map((tool) => tool.name));
    assert.ok(toolNames.has("session.status"));
    assert.equal(toolNames.has("session.resume"), false);
    assert.equal(toolNames.has("approval.decide"), false);

    const status = await client.callTool({
      name: "session.status",
      arguments: {},
    });
    assert.ok(Array.isArray(status.content) && status.content.length > 0);
    assert.equal(status.isError, false);
  } finally {
    await client.close();
    rmSync(home, { recursive: true, force: true });
  }
});
