import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runtimeItemPresentationSnapshot } from "./runtimeItemPresentationSnapshot";
import { runtimePresentationDigest } from "./runtimeItemPresentationProjection";
import {
  runtimeItemPresentationSnapshotSchema,
  runtimeItemPresentationSnapshotSlotSchema,
} from "./contracts/runtimeItemPresentationSnapshot";
import { workflowAgentChatResultSchema } from "./ipc/schemas";
import type { RuntimeEvent } from "./contracts/runtimeEvent";
import { runtimeEventSchema } from "./contracts/runtimeEvent";
import { z } from "zod";

const threadId = "synthetic-agent";
const start = (
  itemId: string,
  itemType: "command_execution" | "mcp_tool_call",
  payload: unknown,
): RuntimeEvent => ({ type: "item.started", threadId, itemId, itemType, payload });

describe("transient canonical transcript display hints", () => {
  it("shares PWA command and MCP semantics without rewriting complete events", () => {
    const fixture = z
      .object({
        version: z.literal(1),
        threadId: z.string(),
        events: z.array(runtimeEventSchema),
        itemPresentations: runtimeItemPresentationSnapshotSchema,
      })
      .parse(
        JSON.parse(
          readFileSync(
            "protocol/remote/v3/fixtures/client-transient-tool-presentations.json",
            "utf8",
          ),
        ),
      );
    const before = structuredClone(fixture.events);
    const hints = runtimeItemPresentationSnapshot(fixture.events, fixture.threadId);
    expect(hints).toEqual(fixture.itemPresentations);
    expect(runtimeItemPresentationSnapshotSchema.safeParse(hints).success).toBe(true);
    expect(fixture.events).toEqual(before);
  });

  it("pins state, shallow argument replacement and omitted/null patches to canonical reducer meaning", () => {
    const events: RuntimeEvent[] = [
      start("item", "command_execution", { args: { command: "cat before.ts", cwd: "/old" } }),
      {
        type: "item.updated",
        threadId,
        itemId: "item",
        payload: { args: { command: "cat after.ts" } },
      },
      { type: "item.completed", threadId, itemId: "item" },
      {
        type: "content.delta",
        threadId,
        itemId: "item",
        stream: "command_output",
        delta: "late output",
      },
    ];
    const hints = runtimeItemPresentationSnapshot(events, threadId);
    expect(hints?.items[0]?.entry).toMatchObject({
      inputDigest: runtimePresentationDigest("command_execution", "completed", {
        args: { command: "cat after.ts" },
      }),
    });
    expect(
      runtimeItemPresentationSnapshot(
        [...events, { type: "item.updated", threadId, itemId: "item", payload: null }],
        threadId,
      )?.items[0]?.entry,
    ).toMatchObject({
      inputDigest: runtimePresentationDigest("command_execution", "completed", undefined),
    });
  });

  it("never reads output bodies or unrelated argument properties", () => {
    const payload = {
      command: "cat file.ts",
      get result(): never {
        throw Error("body read");
      },
      args: {
        get script(): never {
          throw Error("script read");
        },
      },
    };
    expect(
      runtimeItemPresentationSnapshot([start("item", "command_execution", payload)], threadId)
        ?.items[0]?.entry.status,
    ).toBe("ready");
  });

  it("ignores foreign threads, duplicate starts and updates for absent items", () => {
    const events: RuntimeEvent[] = [
      {
        type: "item.started",
        threadId,
        itemId: "duplicate",
        itemType: "assistant_message",
        payload: {},
      },
      start("duplicate", "command_execution", { command: "cat wrong.ts" }),
      {
        ...start("foreign", "command_execution", { command: "cat foreign.ts" }),
        threadId: "other",
      },
      {
        type: "item.completed",
        threadId,
        itemId: "missing",
        payload: { command: "cat missing.ts" },
      },
    ];
    expect(runtimeItemPresentationSnapshot(events, threadId)).toBeUndefined();
  });

  it("bounds advisory growth while retaining the complete canonical response", () => {
    const events = Array.from({ length: 4097 }, (_, i) =>
      start(`item-${i}`, "mcp_tool_call", { name: "search", serverId: "docs", status: "success" }),
    );
    expect(runtimeItemPresentationSnapshot(events, threadId)).toBeUndefined();
    expect(events).toHaveLength(4097);
  });

  it("keeps pre-upgrade responses and opaque future hints valid", () => {
    expect(workflowAgentChatResultSchema.parse({ events: [] })).toEqual({ events: [] });
    const future = { version: 2, unknown: { preserve: true } };
    expect(runtimeItemPresentationSnapshotSlotSchema.parse(future)).toEqual(future);
    expect(workflowAgentChatResultSchema.parse({ events: [], itemPresentations: future })).toEqual({
      events: [],
      itemPresentations: future,
    });
    expect(
      z
        .object({ events: z.array(runtimeEventSchema) })
        .parse({ events: [], itemPresentations: future }),
    ).toEqual({ events: [] });
  });
});
