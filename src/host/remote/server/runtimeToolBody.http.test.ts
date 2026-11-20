import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("poracode:tool-presentation-adapters", () => ({
  toolPresentationAdapters: [{ workflowRegistrationNames: ["fixture-batch"] }],
}));

import { getSqlite } from "@/host/db/connection";
import { dbUpsertThread } from "@/host/db/projectsThreads";
import { sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";
import { runtimePresentationDigest } from "./runtimeItemPresentationProjection";
import {
  cleanupRuntimePresentationFixture,
  startRuntimePresentationFixture as start,
  seedRuntimePresentationItem as seed,
  postRuntimePresentationRead as post,
} from "./runtimeItemPresentation.testFixtures";

afterEach(cleanupRuntimePresentationFixture);

describe.skipIf(!sqliteAvailable)("resolved tool bodies over authenticated HTTP", () => {
  it("projects complete findings for independent readers without writing or changing older versions", async () => {
    const { base, token } = await start();
    const payload = {
      name: "fixture-batch",
      status: "success",
      args: { script: "never execute this" },
      result: { findings: [{ title: "Layout", summary: "Complete detail", confirmed: false }] },
    };
    seed("result", "tool_call", payload);
    const before = getSqlite().prepare("SELECT * FROM thread_runtime_items").all();
    const inputDigest = runtimePresentationDigest("tool_call", "completed", payload, 5);
    const rows = [{ itemId: "result", inputDigest }];
    const first = await post(base, token, rows, "notices=v1", "thread-1", 5);
    expect(first.status).toBe(200);
    const result = await first.json();
    expect(result).toMatchObject({
      version: 5,
      items: [
        {
          status: "ready",
          inputDigest,
          body: {
            blocks: [
              {
                kind: "disclosure-list",
                countLabel: "1 title",
                rows: [
                  {
                    title: "Layout",
                    detail: "Complete detail",
                    fields: [{ label: "confirmed", text: "false" }],
                  },
                ],
              },
            ],
          },
        },
      ],
    });
    const second = await post(base, token, rows, "notices=v1", "thread-1", 5);
    expect(await second.json()).toEqual(result);
    expect(getSqlite().prepare("SELECT * FROM thread_runtime_items").all()).toEqual(before);
    expect(await (await post(base, token, rows)).json()).toMatchObject({
      version: 1,
      items: [{ reason: "unsupported" }],
    });
    expect((await post(base, undefined, rows, "notices=v1", "thread-1", 5)).status).toBe(401);
    expect((await post(base, token, rows, "notices=v1&maxBytes=128", "thread-1", 5)).status).toBe(
      413,
    );
    getSqlite()
      .prepare("UPDATE thread_runtime_items SET payload = ? WHERE item_id = 'result'")
      .run(JSON.stringify({ ...payload, result: "changed" }));
    expect(await (await post(base, token, rows, "notices=v1", "thread-1", 5)).json()).toMatchObject(
      { items: [{ reason: "changed" }] },
    );
  });

  it("requires session read scope and refuses foreign, missing, MCP, and stale rows", async () => {
    const { base, token } = await start();
    const payload = { name: "fixture-batch", status: "success", result: "private" };
    dbUpsertThread({ ...testThread(), id: "other" }, 1);
    seed("foreign", "tool_call", payload, "other");
    seed("mcp", "mcp_tool_call", { ...payload, serverId: "external" });
    seed("changed", "tool_call", payload);
    const response = await post(
      base,
      token,
      ["foreign", "missing", "mcp", "changed"].map((itemId) => ({
        itemId,
        inputDigest: "0".repeat(64),
      })),
      "notices=v1",
      "thread-1",
      5,
    );
    expect(await response.json()).toMatchObject({
      version: 5,
      items: [
        { itemId: "foreign", reason: "missing" },
        { itemId: "missing", reason: "missing" },
        { itemId: "mcp", reason: "unsupported" },
        { itemId: "changed", reason: "changed" },
      ],
    });
  });

  it("does not grant reads to operation-only clients", async () => {
    const { base, token } = await start(["session:operate"]);
    expect(
      (
        await post(
          base,
          token,
          [{ itemId: "x", inputDigest: "0".repeat(64) }],
          "notices=v1",
          "thread-1",
          5,
        )
      ).status,
    ).toBe(403);
  });
});
