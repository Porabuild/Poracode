import { afterEach, describe, expect, it } from "vitest";
import { getSqlite } from "@/host/db/connection";
import { sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";
import { dbUpsertThread } from "@/host/db/projectsThreads";
import {
  cleanupRuntimePresentationFixture,
  startRuntimePresentationFixture,
  seedRuntimePresentationItem,
  postRuntimePresentationRead,
} from "@/host/remote/server/runtimeItemPresentation.testFixtures";
import { runtimePresentationDigest } from "@/host/remote/server/runtimeItemPresentationProjection";
import { legacyWorkflowPayload } from "./workflowRegistration.testFixtures";

afterEach(cleanupRuntimePresentationFixture);

describe.skipIf(!sqliteAvailable)("legacy workflow registration over authenticated HTTP", () => {
  it("recovers an old persisted launch without replacing canonical data or changing V1/V2 reads", async () => {
    const { base, token } = await startRuntimePresentationFixture();
    const payload = legacyWorkflowPayload({
      runId: "old-run",
      transcriptDir: "/session/subagents/workflows/old-run",
      summary: "Review the workspace",
    });
    seedRuntimePresentationItem("old", "tool_call", payload);
    const before = getSqlite().prepare("SELECT * FROM thread_runtime_items").all();
    const rows = [
      {
        itemId: "old",
        inputDigest: runtimePresentationDigest("tool_call", "completed", payload, 3),
      },
    ];
    const response = await postRuntimePresentationRead(
      base,
      token,
      rows,
      "notices=v1",
      "thread-1",
      3,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      version: 3,
      items: [
        {
          status: "ready",
          header: { workflow: { runId: "old-run", summary: "Review the workspace" } },
        },
      ],
    });
    for (const version of [1, 2]) {
      expect(
        await (
          await postRuntimePresentationRead(base, token, rows, "notices=v1", "thread-1", version)
        ).json(),
      ).toMatchObject({ version, items: [{ status: "unavailable" }] });
    }
    expect(getSqlite().prepare("SELECT * FROM thread_runtime_items").all()).toEqual(before);
  });

  it("fences missing, stale and foreign rows and refuses external MCP lookalikes", async () => {
    const { base, token } = await startRuntimePresentationFixture();
    const payload = legacyWorkflowPayload({
      runId: "old-run",
      transcriptDir: "/session/subagents/workflows/old-run",
    });
    seedRuntimePresentationItem("stale", "tool_call", payload);
    const mcp = { ...payload, serverId: "external" };
    seedRuntimePresentationItem("mcp", "tool_call", mcp);
    dbUpsertThread({ ...testThread(), id: "other" }, 1);
    seedRuntimePresentationItem("foreign", "tool_call", payload, "other");
    const response = await postRuntimePresentationRead(
      base,
      token,
      [
        { itemId: "stale", inputDigest: "0".repeat(64) },
        { itemId: "mcp", inputDigest: runtimePresentationDigest("tool_call", "completed", mcp, 3) },
        {
          itemId: "foreign",
          inputDigest: runtimePresentationDigest("tool_call", "completed", payload, 3),
        },
      ],
      "notices=v1",
      "thread-1",
      3,
    );
    expect(response.status).toBe(200);
    expect((await response.json()).items).toMatchObject([
      { reason: "changed" },
      { reason: "unsupported" },
      { reason: "missing" },
    ]);
    expect(
      (
        await postRuntimePresentationRead(
          base,
          undefined,
          [{ itemId: "stale", inputDigest: "0".repeat(64) }],
          "notices=v1",
          "thread-1",
          3,
        )
      ).status,
    ).toBe(401);
  });

  it("reads the full viewer only on V4, preserves old reads and fences changed scripts", async () => {
    const { base, token } = await startRuntimePresentationFixture();
    const payload = {
      ...legacyWorkflowPayload({
        runId: "old-run",
        transcriptDir: "/session/subagents/workflows/old-run",
      }),
      args: {
        script:
          "const meta = { description: 'Review', phases: [{title: 'Inspect'}, {title: 'Verify'}] };",
      },
    };
    seedRuntimePresentationItem("viewer", "tool_call", payload);
    const before = getSqlite().prepare("SELECT * FROM thread_runtime_items").all();
    const row = {
      itemId: "viewer",
      inputDigest: runtimePresentationDigest("tool_call", "completed", payload, 4),
    };
    const response = await postRuntimePresentationRead(
      base,
      token,
      [row],
      "notices=v1",
      "thread-1",
      4,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      version: 4,
      items: [
        {
          status: "ready",
          header: {
            workflowView: {
              description: "Review",
              phases: [{ title: "Inspect" }, { title: "Verify" }],
              runId: "old-run",
            },
          },
        },
      ],
    });
    expect(getSqlite().prepare("SELECT * FROM thread_runtime_items").all()).toEqual(before);
    getSqlite()
      .prepare("UPDATE thread_runtime_items SET payload = ? WHERE item_id = ?")
      .run(JSON.stringify({ ...payload, args: { script: "changed" } }), "viewer");
    expect(
      await (
        await postRuntimePresentationRead(base, token, [row], "notices=v1", "thread-1", 4)
      ).json(),
    ).toMatchObject({ version: 4, items: [{ status: "unavailable", reason: "changed" }] });
    expect(
      (await postRuntimePresentationRead(base, undefined, [row], "notices=v1", "thread-1", 4))
        .status,
    ).toBe(401);
  });
});
