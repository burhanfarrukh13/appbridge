import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import test from "node:test";
import type { Bridge } from "./bridge.js";
import { createMcpServer } from "./mcp.js";

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
    for (const tool of tools) {
      for (const hint of [
        "readOnlyHint",
        "destructiveHint",
        "idempotentHint",
        "openWorldHint",
      ] as const) {
        assert.equal(typeof tool.annotations?.[hint], "boolean", `${tool.name}.${hint}`);
      }
    }

    const filesystemRead = tools.find((tool) => tool.name === "filesystem.read");
    assert.deepEqual(filesystemRead?.annotations, {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    const terminalRun = tools.find((tool) => tool.name === "terminal.run");
    assert.deepEqual(terminalRun?.annotations, {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    });

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

test("MCP tool handler exceptions return a structured error result", async () => {
  const bridge = {
    isToolAllowed: () => true,
    describe: async () => {
      throw new Error("simulated handler failure");
    },
  } as unknown as Bridge;
  const server = createMcpServer(bridge);
  const client = new Client({ name: "appbridge-mcp-error-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const result = await client.callTool({ name: "screen.describe", arguments: {} });

    assert.equal(result.isError, true);
    assert.ok(Array.isArray(result.content));
    const firstContent = result.content[0];
    assert.equal(firstContent?.type, "text");
    if (firstContent?.type !== "text") throw new Error("Expected text error content");
    assert.deepEqual(JSON.parse(firstContent.text), {
      ok: false,
      error: {
        code: "tool_execution_error",
        message: "simulated handler failure",
      },
    });
  } finally {
    await client.close();
    await server.close();
  }
});
