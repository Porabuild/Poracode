import { describe, expect, it } from "vitest";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import type { RuntimeEvent } from "@/shared/contracts";
import { runtimeEventSchema, toolCallPayloadSchema } from "@/shared/contracts/runtimeEvent";
import {
  createAcpMapperState,
  mapAcpSessionUpdate,
} from "@/supervisor/agents/acp/canonicalMapping";
import {
  createRichToolWorkload,
  TOOL_CASES,
  TOOL_PROFILES,
  type RichToolProfile,
} from "../fixtures/rich-tool-workload.mjs";

// Completed events can carry only the changed fields; names remain on starts.
const toolPatchSchema = toolCallPayloadSchema.partial();

// Normalization proof, not real tool/delegation execution or UI qualification.
describe("heterogeneous ACP workload normalization", () => {
  for (const profile of Object.keys(TOOL_PROFILES) as RichToolProfile[]) {
    it(`${profile}: retains results, image blocks, failure and nested ownership`, () => {
      const state = createAcpMapperState("fixture-thread");
      const events: RuntimeEvent[] = [];
      const workload = createRichToolWorkload((update) => {
        events.push(...mapAcpSessionUpdate({ sessionId: "fixture-session", update }, state));
      }, 0);
      const ticks =
        (TOOL_PROFILES[profile].everyTicks * TOOL_CASES.length) / TOOL_PROFILES[profile].batch + 7;
      for (let i = 0; i < ticks; i++) workload.tick(profile, TOOL_CASES.length);
      for (const event of events) expect(runtimeEventSchema.safeParse(event).success).toBe(true);
      expect(Object.keys(workload.stats.byCase)).toEqual(TOOL_CASES);
      expect(workload.stats).toMatchObject({
        started: 24,
        completed: 24,
        failed: 1,
        imageBlocks: 3,
        childTools: 2,
        childMessages: 2,
        pending: 0,
      });
      const tools = events
        .filter((event) => event.type === "item.started")
        .filter((event) =>
          ["tool_call", "command_execution", "file_change", "web_search"].includes(event.itemType),
        );
      expect(tools).toHaveLength(26);
      expect(tools.filter((event) => event.itemType === "file_change")).toHaveLength(5);
      expect(tools.filter((event) => event.itemType === "command_execution")).toHaveLength(2);
      expect(tools.filter((event) => event.itemType === "web_search")).toHaveLength(1);
      const completed = events
        .filter((event) => event.type === "item.completed")
        .filter((event) => tools.some((tool) => tool.itemId === event.itemId));
      expect(new Set(completed.map((event) => event.itemId)).size).toBe(26);
      expect(
        completed.filter(
          (event) => toolPatchSchema.safeParse(event.payload).data?.status === "error",
        ),
      ).toHaveLength(1);
      const toolPayloads = completed
        .filter((event) =>
          tools.some((tool) => tool.itemId === event.itemId && tool.itemType === "tool_call"),
        )
        .map((event) => toolPatchSchema.parse(event.payload));
      expect(toolPayloads.flatMap((payload) => payload.images ?? [])).toHaveLength(3);
      const parents = tools.filter(
        (event) => toolCallPayloadSchema.safeParse(event.payload).data?.isSubAgent,
      );
      expect(parents).toHaveLength(2);
      for (const parent of parents) {
        expect(
          tools.some(
            (event) =>
              event.parentItemId === parent.itemId &&
              toolCallPayloadSchema.safeParse(event.payload).data?.name === "Read",
          ),
        ).toBe(true);
        expect(
          events.some(
            (event) =>
              event.type === "item.started" &&
              event.parentItemId === parent.itemId &&
              event.itemType === "assistant_message",
          ),
        ).toBe(true);
      }
      expect(state.toolCallItems.size).toBe(0);
    });
  }

  it("cancellation completes outstanding operations with an error", () => {
    const updates: SessionNotification["update"][] = [];
    const workload = createRichToolWorkload((update) => updates.push(update), 0);
    for (let i = 0; i < 5; i++) workload.tick("heavy", 1);
    expect(workload.stats.pending).toBe(1);
    workload.cancel();
    expect(workload.stats).toMatchObject({ started: 1, completed: 1, failed: 1, pending: 0 });
    expect(updates.at(-1)).toMatchObject({ sessionUpdate: "tool_call_update", status: "failed" });
  });

  it("post-measurement drain completes existing tools without starting another cycle", () => {
    const updates: SessionNotification["update"][] = [];
    const workload = createRichToolWorkload((update) => updates.push(update), 0);
    for (let i = 0; i < 5; i++) workload.tick("heavy");
    expect(workload.stats).toMatchObject({ started: 1, pending: 1 });
    for (let i = 0; i < 20; i++) workload.drain();
    expect(workload.stats).toMatchObject({ started: 1, completed: 1, failed: 0, pending: 0 });
    expect(updates.at(-1)).toMatchObject({
      sessionUpdate: "tool_call_update",
      status: "completed",
    });
    expect(updates.filter((update) => update.sessionUpdate === "tool_call")).toHaveLength(1);
  });

  it("sustained calls have unique identities across repeated taxonomies", () => {
    const state = createAcpMapperState("fixture-thread");
    const events: RuntimeEvent[] = [];
    const workload = createRichToolWorkload(
      (update) =>
        events.push(...mapAcpSessionUpdate({ sessionId: "fixture-session", update }, state)),
      0,
    );
    for (let i = 0; i < 307; i++) workload.tick("bursty");
    const starts = events.filter((event) => event.type === "item.started");
    expect(new Set(starts.map((event) => event.itemId)).size).toBe(starts.length);
    expect(workload.stats).toMatchObject({ started: 48, completed: 48, pending: 0 });
    for (const counts of Object.values(workload.stats.byCase))
      expect(counts).toEqual({ started: 2, completed: 2 });
    expect(state.toolCallItems.size).toBe(0);
  });
});
