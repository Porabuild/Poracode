import { expect, test } from "bun:test";
import * as S from "./test-support";
import { OpenCode } from "@opencode/client";
import { createData } from "@opencode/client/solid";
import { fileURLToPath } from "node:url";
import { createRoot } from "solid-js";
import type { CreateDataInput } from "@opencode/client/solid";

test("generated client request table: supported ops answer the declared contract", async () => {
  // The generated client, not protocol/openapi.json, is the real contract —
  // a missing route hangs or 404s silently, a wrong status or missing body
  // makes the client throw (the /undo interrupt bug).
  const source = await Bun.file(
    fileURLToPath(
      new URL("../../../opencode/packages/client/src/promise/generated/client.ts", import.meta.url),
    ),
  ).text();
  const operations = [
    ...source.matchAll(
      /method:\s*"([A-Z]+)",\s*path:\s*`([^`]+)`,[\s\S]{0,400}?successStatus:\s*(\d+),[\s\S]{0,200}?empty:\s*(true|false)/gu,
    ),
  ].map((match) => ({
    method: match[1]!,
    path: match[2]!,
    status: Number(match[3]),
    empty: match[4] === "true",
  }));
  expect(operations.length).toBeGreaterThan(100);
  // Operations the adapter intentionally does not implement (host-level or
  // not-yet-claimed surfaces).
  const unsupported = new Set([
    "POST /api/pair",
    "GET /auth/connect/${encodeURIComponent(input.code)}",
    "GET /api/agent/${encodeURIComponent(input.agentID)}",
    "GET /api/plugin",
    "POST /api/plugin/check",
    "POST /api/plugin/update",
    "GET /api/experimental/session/stats",
    "POST /api/experimental/session/import",
    "POST /api/experimental/session/${encodeURIComponent(input.sessionID)}/skill",
    "POST /api/session/${encodeURIComponent(input.sessionID)}/synthetic",
    "POST /api/session/${encodeURIComponent(input.sessionID)}/shell",
    "POST /api/session/${encodeURIComponent(input.sessionID)}/generate",
    "GET /api/session/${encodeURIComponent(input.sessionID)}/context",
    "GET /api/session/${encodeURIComponent(input.sessionID)}/diff",
    "GET /api/experimental/session/${encodeURIComponent(input.sessionID)}/log",
    "GET /api/experimental/session/${encodeURIComponent(input.sessionID)}/instructions/entries",
    "PUT /api/experimental/session/${encodeURIComponent(input.sessionID)}/instructions/entries/${encodeURIComponent(input.key)}",
    "DELETE /api/experimental/session/${encodeURIComponent(input.sessionID)}/instructions/entries/${encodeURIComponent(input.key)}",
    "POST /api/session/${encodeURIComponent(input.sessionID)}/form",
    "POST /api/session/${encodeURIComponent(input.sessionID)}/permission",
    "POST /api/experimental/fs/write",
    "GET /api/pty",
    "POST /api/pty",
    "GET /api/pty/${encodeURIComponent(input.ptyID)}",
    "PUT /api/pty/${encodeURIComponent(input.ptyID)}",
    "DELETE /api/pty/${encodeURIComponent(input.ptyID)}",
    "POST /api/pty/${encodeURIComponent(input.ptyID)}/connect-token",
    "GET /api/experimental/session/${encodeURIComponent(input.sessionID)}/terminal/read",
    "POST /api/experimental/session/${encodeURIComponent(input.sessionID)}/terminal",
    "POST /api/experimental/persistent-pty/shutdown",
    "POST /api/experimental/persistent-pty/handoff",
    "GET /api/experimental/persistent-pty/${encodeURIComponent(input.ptyID)}",
    "PUT /api/experimental/persistent-pty/${encodeURIComponent(input.ptyID)}",
    "GET /api/experimental/persistent-pty/${encodeURIComponent(input.ptyID)}/snapshot",
    "DELETE /api/experimental/persistent-pty/${encodeURIComponent(input.ptyID)}",
    "POST /api/experimental/persistent-pty/${encodeURIComponent(input.ptyID)}/connect-token",
    "GET /api/reference",
    "DELETE /api/worktree",
    "GET /api/debug/location",
    "DELETE /api/debug/location",
    "GET /api/websearch/provider",
    "POST /api/websearch",
    "GET /api/config/shell",
    "PATCH /api/experimental/config",
    "GET /api/provider/${encodeURIComponent(input.providerID)}",
    "GET /api/integration/${encodeURIComponent(input.integrationID)}",
    "POST /api/experimental/integration/wellknown",
    "POST /api/integration/${encodeURIComponent(input.integrationID)}/connect/key",
    "POST /api/integration/${encodeURIComponent(input.integrationID)}/connect/external",
    "POST /api/integration/${encodeURIComponent(input.integrationID)}/connect/oauth",
    "GET /api/integration/${encodeURIComponent(input.integrationID)}/connect/oauth/${encodeURIComponent(input.attemptID)}",
    "POST /api/integration/${encodeURIComponent(input.integrationID)}/connect/oauth/${encodeURIComponent(input.attemptID)}/complete",
    "DELETE /api/integration/${encodeURIComponent(input.integrationID)}/connect/oauth/${encodeURIComponent(input.attemptID)}",
    "POST /api/integration/${encodeURIComponent(input.integrationID)}/connect/command",
    "GET /api/integration/${encodeURIComponent(input.integrationID)}/connect/command/${encodeURIComponent(input.attemptID)}",
    "DELETE /api/integration/${encodeURIComponent(input.integrationID)}/connect/command/${encodeURIComponent(input.attemptID)}",
    "PUT /api/experimental/mcp/${encodeURIComponent(input.server)}",
    "DELETE /api/experimental/mcp/${encodeURIComponent(input.server)}",
    "GET /api/mcp/resource",
    "GET /api/credential",
    "POST /api/credential",
    "PATCH /api/credential/${encodeURIComponent(input.credentialID)}",
    "POST /api/credential/${encodeURIComponent(input.credentialID)}/activate",
    "DELETE /api/credential/${encodeURIComponent(input.credentialID)}",
    "PATCH /api/project/${encodeURIComponent(input.projectID)}",
    "GET /api/permission/request",
    "GET /api/permission/saved",
    "PATCH /api/permission/saved/${encodeURIComponent(input.id)}",
    "DELETE /api/permission/saved/${encodeURIComponent(input.id)}",
    "POST /api/rpc/${encodeURIComponent(input.rpcID)}/${encodeURIComponent(input.method)}",
    "POST /api/experimental/voice/session",
    "POST /api/experimental/generate",
  ]);
  // Supported but unassertable here — the happy path needs state the fixtures
  // cannot provide (reason per entry, keep this list short).
  const fixtureBound = new Map<string, string>([
    ["POST /api/session/${encodeURIComponent(input.sessionID)}/fork", "needs the host fork path"],
    ["POST /api/session/${encodeURIComponent(input.sessionID)}/move", "needs a listed worktree"],
    ["POST /api/worktree", "needs a gitAddWorktree result"],
    ["POST /api/vcs/init", "intentionally unsupported"],
    ["GET /api/vcs", "needs a git snapshot fixture"],
    ["GET /api/vcs/base", "needs a git snapshot fixture"],
    ["GET /api/vcs/status", "needs a git snapshot fixture"],
    ["GET /api/vcs/branch", "needs a git snapshot fixture"],
    ["GET /api/vcs/diff", "needs a git snapshot fixture"],
    [
      "POST /api/session/${encodeURIComponent(input.sessionID)}/revert/stage",
      "needs a real user message + checkpoint",
    ],
    [
      "PATCH /api/session/${encodeURIComponent(input.sessionID)}/inbox/${encodeURIComponent(input.inboxID)}",
      "needs a live steer/queue entry",
    ],
    [
      "GET /api/session/${encodeURIComponent(input.sessionID)}/message/${encodeURIComponent(input.messageID)}",
      "needs a mapped persisted message",
    ],
    [
      "GET /api/session/${encodeURIComponent(input.sessionID)}/form/${encodeURIComponent(input.formID)}",
      "needs a live pending form",
    ],
    [
      "POST /api/session/${encodeURIComponent(input.sessionID)}/form/${encodeURIComponent(input.formID)}/reply",
      "needs a live pending form",
    ],
    [
      "DELETE /api/session/${encodeURIComponent(input.sessionID)}/form/${encodeURIComponent(input.formID)}",
      "needs a live pending form",
    ],
    [
      "GET /api/session/${encodeURIComponent(input.sessionID)}/permission/${encodeURIComponent(input.requestID)}",
      "needs a live pending permission",
    ],
    [
      "POST /api/session/${encodeURIComponent(input.sessionID)}/permission/${encodeURIComponent(input.requestID)}/reply",
      "needs a live pending permission",
    ],
    ["GET /api/shell/${encodeURIComponent(input.id)}", "needs a seeded background task"],
    ["GET /api/shell/${encodeURIComponent(input.id)}/output", "needs a seeded background task"],
    ["DELETE /api/shell/${encodeURIComponent(input.id)}", "needs a seeded background task"],
    ["POST /api/shell", "intentionally 501 until user shells land"],
    ["GET /api/fs/read/${encodePath(input.path)}", "needs a readable path"],
    ["GET /api/fs/list", "needs a real directory on disk"],
    ["GET /api/fs/find", "needs a real directory on disk"],
  ]);
  const bodies = new Map<string, string>([
    [
      "POST /api/session/${encodeURIComponent(input.sessionID)}/model",
      JSON.stringify({ model: { providerID: "codex", id: "m1" } }),
    ],
    [
      "POST /api/session/${encodeURIComponent(input.sessionID)}/agent",
      JSON.stringify({ agent: "build" }),
    ],
    [
      "POST /api/session/${encodeURIComponent(input.sessionID)}/command",
      JSON.stringify({ name: "compact", text: "" }),
    ],
    [
      "POST /api/session/${encodeURIComponent(input.sessionID)}/prompt",
      JSON.stringify({ text: "hi" }),
    ],
  ]);
  const client = S.promptClient({
    sendThreadInput: async () => ({}),
    sendThreadCommand: async () => ({}),
    callRemoteProcedure: async (name: string) =>
      name === "gitListWorktrees" ? { worktrees: [] } : null,
    agentSlashCommands: async () => ({ commands: [{ id: "compact" }] }),
  });
  const { value } = S.router(client);
  // Top-level body shape per startup GET the vendored UI reads — "map" = a
  // server-keyed record, "array" = a JSON array, a list = required object keys.
  const shapes = new Map<string, "array" | "map" | string[]>([
    ["GET /api/mcp", ["location", "data"]],
    ["GET /api/session", ["data", "cursor"]],
    ["GET /api/provider", ["data"]],
    ["GET /api/integration", ["data"]],
    ["GET /api/agent", ["data"]],
    ["GET /api/model", ["location", "data"]],
    ["GET /api/config", "array"],
    ["GET /api/command", ["data"]],
    ["GET /api/skill", ["data"]],
    ["GET /api/project", "array"],
    ["GET /api/vcs", ["location", "data"]],
    ["GET /api/location", "map"],
  ]);
  const failures: string[] = [];
  for (const serialized of new Set(operations.map((entry) => JSON.stringify(entry)))) {
    const op = JSON.parse(serialized) as {
      method: string;
      path: string;
      status: number;
      empty: boolean;
    };
    const key = `${op.method} ${op.path}`;
    if (unsupported.has(key) || fixtureBound.has(key)) continue;
    const path = op.path.replaceAll(
      /\$\{encodeURIComponent\(input\.(\w+)\)\}|\$\{encodePath\(input\.(\w+)\)\}/gu,
      (_whole, encoded: string | undefined, plain: string | undefined) =>
        (encoded ?? plain) === "sessionID" ? "ses_thread-1" : "x",
    );
    const body =
      bodies.get(key) ?? (op.method === "GET" || op.method === "DELETE" ? undefined : "{}");
    const response = await value.handle(
      new Request(`http://poracode.invalid${path}`, {
        method: op.method,
        headers: { "content-type": "application/json" },
        body,
      }),
    );
    if (response.status !== op.status) {
      failures.push(`${key} -> ${response.status} (expected ${op.status})`);
      continue;
    }
    if (path === "/api/event") continue; // SSE stream — a 200 is the route answering.
    const text = await response.text();
    if (op.empty && text !== "") failures.push(`${key} -> expected an empty body`);
    if (!op.empty && text === "") failures.push(`${key} -> expected a JSON body`);
    // Startup GETs the vendored UI reads must keep their top-level JSON shape —
    // a list-vs-map mismatch crashes the client at boot (the /api/mcp bug).
    const shape = shapes.get(key);
    if (!op.empty && text !== "" && shape) {
      const parsed = JSON.parse(text) as unknown;
      if (shape === "array" && !Array.isArray(parsed))
        failures.push(`${key} -> expected an array body`);
      if (
        shape === "map" &&
        (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      )
        failures.push(`${key} -> expected a server-keyed map body`);
      if (Array.isArray(shape)) {
        const keys = Object.keys((parsed ?? {}) as Record<string, unknown>);
        for (const required of shape)
          if (!keys.includes(required))
            failures.push(`${key} -> missing top-level key ${required}`);
      }
    }
  }
  expect(failures).toEqual([]);
});

test("the generated client syncs every location catalog, including a second location", async () => {
  const client = S.promptClient({
    callRemoteProcedure: async () => null,
    agentSlashCommands: async () => ({ commands: [] }),
  });
  const { value } = S.router(client);
  // The real generated promise client, driven against the in-process S.router
  // exactly like tui/src/main.ts wires adapter.fetch into the vendored UI.
  const api = OpenCode.make({
    baseUrl: "http://poracode.invalid/",
    fetch: ((input: RequestInfo | URL, init?: RequestInit) =>
      value.handle(new Request(input, init))) as typeof fetch,
  });
  const root = createRoot((close) => {
    const event: CreateDataInput["event"] = {
      on: () => () => undefined,
      listen: () => () => undefined,
    };
    return { data: createData({ api: () => api, directory: "C:/repo", event }), close };
  });
  try {
    // The startup sync reads every location-scoped catalog; a response without
    // a matching location rejects here and the session route loses its composer.
    await root.data.location.sync();
    const servers = root.data.location.mcp.server.list();
    expect(servers?.map((server) => server.name).sort()).toEqual([
      "browser",
      "chrome",
      "crossagents",
    ]);
    expect(servers?.find((server) => server.name === "crossagents")?.status.status).toBe(
      "connected",
    );
    // A worktree session syncs its own location; the adapter must echo the
    // requested directory or the data layer keys the catalog somewhere else.
    const worktree = { directory: "D:/worktree" };
    await root.data.location.sync(worktree);
    expect(root.data.location.agent.list(worktree)).toBeDefined();
    expect(
      root.data.location.mcp.server
        .list(worktree)
        ?.map((s) => s.name)
        .sort(),
    ).toEqual(["browser", "chrome", "crossagents"]);
  } finally {
    root.close();
  }
});
