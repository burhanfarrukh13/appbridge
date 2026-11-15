import { timingSafeEqual, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { okResult, failResult, type ActionResult } from "@appbridge/core";
import type { Bridge } from "./bridge.js";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

const TOOL_NAMES = [
  "screen.describe",
  "screen.capture",
  "screen.ocr",
  "ui.find",
  "ui.click",
  "ui.type",
  "ui.key",
  "ui.set_value",
  "ui.scroll",
  "ui.drag",
  "ui.wait_for",
  "apps.list",
  "apps.describe",
  "window.list",
  "window.focus",
  "window.action",
  "clipboard.get",
  "clipboard.set",
  "filesystem.roots",
  "filesystem.list",
  "filesystem.search",
  "filesystem.read",
  "filesystem.write",
  "filesystem.edit",
  "terminal.list",
  "terminal.run",
  "app.launch",
  "playbook.get",
  "session.status",
  "session.stop",
  "session.resume",
  "audit.tail",
  "dialog.list",
  "dialog.handle",
  "skill.compile",
  "skill.run",
  "skill.record_start",
  "skill.record_event",
  "skill.record_stop",
  "lab.run",
  "memory.store.get",
  "memory.store.list",
  "approval.list",
  "approval.decide",
  "inventory",
];

export interface HttpOptions {
  port?: number;
  host?: string;
}

export interface HttpGateway {
  server: Server;
  port: number;
  url: string;
  token: string;
}

async function ensureToken(tokenFile: string): Promise<string> {
  try {
    const existing = (await readFile(tokenFile, "utf8")).trim();
    if (existing.length >= 32) return existing;
  } catch {
    /* create below */
  }
  const token = randomBytes(32).toString("hex");
  await writeFile(tokenFile, `${token}\n`, { encoding: "utf8", mode: 0o600 });
  return token;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
  });
  res.end(text);
}

function authorized(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;
  const provided = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(token);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/** Reject DNS-rebinding style requests: Host must be loopback and Origin, if any, loopback. */
function sameOrigin(req: IncomingMessage, port: number): boolean {
  const host = (req.headers.host ?? "").toLowerCase();
  const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
  if (!allowedHosts.includes(host)) return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  return allowedHosts.some((allowed) => origin.toLowerCase() === `http://${allowed}`);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(buffer);
  }
  if (total === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function openApiDocument(port: number): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "Appbridge local gateway",
      version: "0.1.0",
      description:
        "Loopback REST surface for the Appbridge Floor. Every action passes the same Action Firewall as MCP. Bearer token required.",
    },
    servers: [{ url: `http://127.0.0.1:${port}` }],
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      "/healthz": { get: { summary: "Liveness", security: [], responses: { "200": { description: "ok" } } } },
      "/v1/status": { get: { summary: "Session status", responses: { "200": { description: "status" } } } },
      "/v1/scene": { get: { summary: "Describe a window", responses: { "200": { description: "scene" } } } },
      "/v1/audit": { get: { summary: "Recent audit records", responses: { "200": { description: "records" } } } },
      "/v1/settings/policy": {
        post: {
          summary: "Set an action policy",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["effect", "action"],
                  properties: {
                    effect: {
                      type: "string",
                      enum: ["navigate", "read", "edit-draft", "write", "destructive", "external-effect", "privileged", "credential", "unknown"],
                    },
                    action: { type: "string", enum: ["allow", "approve", "block", "handoff"] },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "policy updated" },
            "400": { description: "invalid policy setting" },
          },
        },
      },
      "/v1/tools/{tool}": {
        post: {
          summary: "Call an Appbridge tool",
          parameters: [
            {
              name: "tool",
              in: "path",
              required: true,
              schema: { type: "string", enum: TOOL_NAMES },
            },
          ],
          requestBody: {
            required: false,
            content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
          },
          responses: { "200": { description: "tool result" } },
        },
      },
    },
    "x-appbridge-tools": TOOL_NAMES,
  };
}

export async function startHttpGateway(bridge: Bridge, options: HttpOptions = {}): Promise<HttpGateway> {
  const port = options.port ?? bridge.config.gateway?.port ?? 0;
  const host = options.host ?? bridge.config.gateway?.bind ?? "localhost";
  const token = await ensureToken(bridge.paths.token);

  const server = createServer((req, res) => {
    void handle(req, res).catch((error) => {
      json(res, 500, failResult("unsupported", error instanceof Error ? error.message : String(error)));
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${actualPort}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "Content-Type, Authorization",
      });
      res.end();
      return;
    }
    if (url.pathname === "/healthz") {
      json(res, 200, { ok: true, service: "appbridge", version: "0.1.0" });
      return;
    }
    if (!sameOrigin(req, actualPort)) {
      json(res, 403, { error: "forbidden origin or host" });
      return;
    }
    if (!authorized(req, token)) {
      json(res, 401, { error: "missing or invalid bearer token" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/v1/status") {
      json(res, 200, await bridge.status());
      return;
    }
    if (req.method === "GET" && url.pathname === "/v1/approvals") {
      json(res, 200, await bridge.listApprovals());
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/settings/policy") {
      let body: unknown;
      try {
        body = await readBody(req);
      } catch (error) {
        json(res, 400, failResult("unsupported", error instanceof Error ? error.message : "invalid body"));
        return;
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        json(res, 400, failResult("unsupported", "body must be a JSON object"));
        return;
      }
      const input = body as { effect?: unknown; action?: unknown };
      if (typeof input.effect !== "string" || typeof input.action !== "string") {
        json(res, 400, failResult("unsupported", "effect and action must be strings"));
        return;
      }
      const result = await bridge.updatePolicy(input.effect, input.action);
      json(res, result.ok ? 200 : 400, result);
      return;
    }
    if (req.method === "POST" && url.pathname.startsWith("/v1/approvals/")) {
      const approvalId = url.pathname.slice("/v1/approvals/".length).replace(/\/decide$/, "");
      const body = (await readBody(req)) as { decision?: "granted" | "denied"; scope?: "once" | "session"; ttl_seconds?: number };
      const decisionResult = await bridge.decideApproval({
        id: approvalId,
        decision: body.decision ?? "granted",
        scope: body.scope,
        ttl_seconds: body.ttl_seconds,
      });
      json(res, decisionResult.ok ? 200 : 400, decisionResult);
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/halt") {
      json(res, 200, await bridge.stop());
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/resume") {
      json(res, 200, await bridge.resume());
      return;
    }
    if (req.method === "GET" && url.pathname === "/v1/scene") {
      const result = await bridge.describe({
        window_id: url.searchParams.get("window_id") ?? undefined,
        window_title: url.searchParams.get("window_title") ?? undefined,
        max_elements: url.searchParams.has("max_elements")
          ? Number(url.searchParams.get("max_elements"))
          : undefined,
      });
      json(res, result.ok ? 200 : 400, result);
      return;
    }
    if (req.method === "GET" && url.pathname === "/v1/audit") {
      const limit = Number(url.searchParams.get("limit") ?? "20");
      json(res, 200, await bridge.auditTail({ limit: Number.isFinite(limit) ? limit : 20 }));
      return;
    }
    if (req.method === "GET" && url.pathname === "/v1/openapi.json") {
      json(res, 200, openApiDocument(actualPort));
      return;
    }
    const match = /^\/v1\/tools\/([A-Za-z0-9._-]+)$/.exec(url.pathname);
    if (req.method === "POST" && match) {
      const tool = match[1] as string;
      let args: unknown;
      try {
        args = await readBody(req);
      } catch (error) {
        json(res, 400, failResult("unsupported", error instanceof Error ? error.message : "invalid body"));
        return;
      }
      if (!args || typeof args !== "object" || Array.isArray(args)) {
        json(res, 400, failResult("unsupported", "body must be a JSON object"));
        return;
      }
      const result: ActionResult = await bridge.callTool(tool, args as Record<string, unknown>);
      json(res, result.ok ? 200 : result.class === "needs_human" ? 409 : 400, result);
      return;
    }
    json(res, 404, { error: "not found", tools: TOOL_NAMES });
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return { server, port: actualPort, url: `http://${host}:${actualPort}`, token };
}

export function stopHttpGateway(gateway: HttpGateway): Promise<void> {
  return new Promise((resolve) => gateway.server.close(() => resolve()));
}

export { TOOL_NAMES };
