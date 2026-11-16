import { afterEach, describe, expect, it } from "vitest";
import { getSqlite } from "@/host/db/connection";
import { dbUpsertThread } from "@/host/db/projectsThreads";
import { sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";
import { runtimeItemPresentationResponseSchema } from "@/shared/contracts/runtimeItemPresentation";
import { runtimePresentationDigest } from "./runtimeItemPresentationProjection";
import {
  cleanupRuntimePresentationFixture,
  startRuntimePresentationFixture as start,
  seedRuntimePresentationItem as seed,
  postRuntimePresentationRead as post,
} from "./runtimeItemPresentation.testFixtures";

afterEach(cleanupRuntimePresentationFixture);

describe.skipIf(!sqliteAvailable)("runtime headings over authenticated HTTP and SQLite", () => {
  it("serves legacy persisted MCP rows only to the V2 opt-in without rewriting them", async () => {
    const { base, token } = await start();
    const payload = {
      name: "search",
      serverId: "workspace_docs",
      status: "success",
      args: false,
      result: { text: "retained" },
    };
    seed("legacy-mcp", "mcp_tool_call", payload);
    const before = getSqlite().prepare("SELECT * FROM thread_runtime_items").all();
    const inputDigest = runtimePresentationDigest("mcp_tool_call", "completed", payload, 2);
    const rows = [{ itemId: "legacy-mcp", inputDigest }];
    const legacy = await post(base, token, rows);
    expect(await legacy.json()).toMatchObject({ version: 1, items: [{ reason: "unsupported" }] });
    const response = await post(base, token, rows, "notices=v1", "thread-1", 2);
    expect(response.status).toBe(200);
    expect(runtimeItemPresentationResponseSchema.parse(await response.json())).toMatchObject({
      version: 2,
      items: [{ header: { tool: { kind: "mcp", title: "workspace docs: search" } } }],
    });
    expect(getSqlite().prepare("SELECT * FROM thread_runtime_items").all()).toEqual(before);
    expect((await post(base, undefined, rows, "notices=v1", "thread-1", 2)).status).toBe(401);
    expect((await post(base, token, rows, "notices=v1", "thread-1", 6)).status).toBe(400);
  });
  it("requires read authorization rather than operate scope", async () => {
    const { base, token } = await start(["session:operate"]);
    const rows = [{ itemId: "x", inputDigest: "0".repeat(64) }];
    expect((await post(base, undefined, rows)).status).toBe(401);
    expect((await post(base, token, rows)).status).toBe(403);
  });

  it("projects the persisted item without changing canonical data", async () => {
    const { base, token } = await start();
    const payload = {
      command: "sed -n '5,12p' src/App.tsx",
      cwd: "/project",
      result: "original body",
      exitCode: 0,
      durationMs: 12,
    };
    seed("read", "command_execution", payload);
    const before = getSqlite().prepare("SELECT * FROM thread_runtime_items").all();
    const inputDigest = runtimePresentationDigest("command_execution", "completed", payload);
    const response = await post(base, token, [{ itemId: "read", inputDigest }]);
    expect(response.status).toBe(200);
    const body = runtimeItemPresentationResponseSchema.parse(await response.json());
    expect(body.items[0]).toMatchObject({
      status: "ready",
      inputDigest,
      header: {
        command: { kind: "view", title: { kind: "view", lines: "5-12" } },
        failed: false,
        durationMs: 12,
      },
    });
    expect(getSqlite().prepare("SELECT * FROM thread_runtime_items").all()).toEqual(before);
  });

  it("refuses stale, missing, foreign and unsupported items individually", async () => {
    const { base, token } = await start();
    seed("changed", "command_execution", { command: "node after.js" });
    seed("assistant", "assistant_message", { text: "response" });
    dbUpsertThread({ ...testThread(), id: "other" }, 1);
    seed("foreign", "command_execution", { command: "private" }, "other");
    const rows = ["changed", "assistant", "foreign", "missing"].map((itemId) => ({
      itemId,
      inputDigest: "0".repeat(64),
    }));
    const response = await post(base, token, rows);
    expect(response.status).toBe(200);
    expect(((await response.json()) as { items: unknown[] }).items).toEqual([
      { status: "unavailable", itemId: "changed", reason: "changed" },
      { status: "unavailable", itemId: "assistant", reason: "unsupported" },
      { status: "unavailable", itemId: "foreign", reason: "missing" },
      { status: "unavailable", itemId: "missing", reason: "missing" },
    ]);
  });

  it("enforces batch, uniqueness, source and negotiated response bounds", async () => {
    const { base, token } = await start();
    const row = { itemId: "x", inputDigest: "0".repeat(64) };
    expect((await post(base, token, [])).status).toBe(400);
    expect((await post(base, token, [row, row])).status).toBe(400);
    expect((await post(base, token, [row], "")).status).toBe(400);
    expect((await post(base, token, [row], "notices=future")).status).toBe(400);
    expect(
      (
        await post(
          base,
          token,
          Array.from({ length: 33 }, (_, i) => ({ ...row, itemId: String(i) })),
        )
      ).status,
    ).toBe(400);
    expect((await post(base, token, [row], "notices=v1&maxBytes=1")).status).toBe(413);
    expect((await post(base, token, [row], "notices=v1", "absent")).status).toBe(404);
    seed("large", "command_execution", { command: "node x", body: "x".repeat(4 * 1024 * 1024) });
    const response = await post(base, token, [{ ...row, itemId: "large" }]);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ items: [{ reason: "too_large" }] });
  });
});
