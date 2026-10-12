// @vitest-environment jsdom
// Run with the repository's renderer Lingui/Babel plugins (see the qualification
// report's exact isolated Vitest invocation). No app process or real tools run.
import { describe, expect, it } from "vitest";
import type { ToolCallPayload } from "@/shared/contracts";
import { requestOutcomeSchema, runtimeEventSchema } from "@/shared/contracts/runtimeEvent";
import { applyRuntimeEventsToState } from "@/renderer/state/slices/runtimeEventReducer";
import { selectVisibleThreadTimelineEntries } from "@/renderer/components/thread/ChatPane/chatPaneSelectors";
import {
  ALL_TAXONOMY_CASES,
  CROSSAGENT_STATE_CASES,
  createToolTaxonomyReplay,
  imageDataUrl,
  NORMALIZED_TRANSITIONS,
  REQUEST_CASES,
} from "../fixtures/tool-taxonomy-workload";
import { selectorState } from "./tool-taxonomy/test-support";

describe("reusable deterministic normalized replay", () => {
  it.each(NORMALIZED_TRANSITIONS.filter((scenario) => scenario.id.startsWith("media-transition:")))(
    "$id: production reducer preserves names while promoting media",
    ({ events }) => {
      const threadId = "transition-thread";
      let state = selectorState([], threadId);
      for (const event of events.slice(0, 3))
        state = { ...state, ...applyRuntimeEventsToState(state, threadId, [event]) };
      expect(selectVisibleThreadTimelineEntries(state, threadId)).toEqual([
        { kind: "tool_call_group", id: "tool-call-group:neighbor", itemIds: ["neighbor", "image"] },
      ]);
      for (const event of events.slice(3))
        state = { ...state, ...applyRuntimeEventsToState(state, threadId, [event]) };
      expect(state.runtimeItemsByIdByThread[threadId]?.image).toMatchObject({
        state: "completed",
        payload: { name: "FixtureImage", status: "success", images: [imageDataUrl("png")] },
      });
      expect(selectVisibleThreadTimelineEntries(state, threadId)).toEqual([
        { kind: "item", id: "neighbor" },
        { kind: "item", id: "image" },
      ]);
    },
  );

  it("late question updates remain hidden and background snapshots replace rather than merge", () => {
    const threadId = "transition-thread";
    let state = selectorState([], threadId);
    for (const event of NORMALIZED_TRANSITIONS.find(
      (scenario) => scenario.id === "late-question-name",
    )!.events) {
      state = { ...state, ...applyRuntimeEventsToState(state, threadId, [event]) };
      expect(selectVisibleThreadTimelineEntries(state, threadId)).toEqual([]);
    }
    expect(state.runtimeItemsByIdByThread[threadId]?.late).toMatchObject({
      state: "completed",
      payload: { name: "AskUser", title: "Choose fixture option", status: "success" },
    });
    const background = NORMALIZED_TRANSITIONS.find(
      (scenario) => scenario.id === "background-replacement",
    )!.events;
    for (const [index, event] of background.entries()) {
      state = { ...state, ...applyRuntimeEventsToState(state, threadId, [event]) };
      expect(state.runtimeBackgroundTasksByThread[threadId] ?? []).toEqual(
        event.type === "background_tasks.changed" ? event.tasks : [],
      );
      expect(state.runtimeBackgroundTasksByThread[threadId] ?? []).toHaveLength(2 - index);
    }
    expect(state.runtimeBackgroundTasksByThread).not.toHaveProperty(threadId);
  });

  it.each(NORMALIZED_TRANSITIONS.filter((scenario) => scenario.id.startsWith("request-outcome:")))(
    "$id: opens/resolves request state without producing a tool row",
    ({ events }) => {
      const threadId = "transition-thread";
      let state = selectorState([], threadId);
      state = { ...state, ...applyRuntimeEventsToState(state, threadId, [events[0]!]) };
      expect(state.runtimeRequestsByThread[threadId]).toHaveLength(1);
      expect(selectVisibleThreadTimelineEntries(state, threadId)).toEqual([]);
      state = { ...state, ...applyRuntimeEventsToState(state, threadId, [events[1]!]) };
      expect(state.runtimeRequestsByThread[threadId]).toHaveLength(0);
      expect(selectVisibleThreadTimelineEntries(state, threadId)).toEqual([]);
    },
  );

  it("every transition uses decodable canonical event envelopes", () => {
    const requests = NORMALIZED_TRANSITIONS.filter((scenario) =>
      scenario.id.startsWith("request-outcome:"),
    ).flatMap((scenario) => scenario.events.filter((event) => event.type === "request.resolved"));
    expect(new Set(requests.map((event) => event.outcome))).toEqual(
      new Set(requestOutcomeSchema.options),
    );
    for (const scenario of NORMALIZED_TRANSITIONS)
      for (const event of scenario.events)
        expect(runtimeEventSchema.safeParse(event).success).toBe(true);
  });
  it("serializes only valid canonical events, retains child identities, and isolates repetitions", () => {
    const events = createToolTaxonomyReplay("fixture-thread", 0);
    expect(createToolTaxonomyReplay("fixture-thread", 0)).toEqual(events);
    for (const event of events) expect(runtimeEventSchema.safeParse(event).success).toBe(true);
    const starts = events.filter((e) => e.type === "item.started");
    expect(starts).toHaveLength(ALL_TAXONOMY_CASES.length + CROSSAGENT_STATE_CASES.length);
    expect(new Set(starts.map((e) => e.itemId)).size).toBe(starts.length);
    const other = createToolTaxonomyReplay("fixture-thread", 1).filter(
      (e) => e.type === "item.started",
    );
    expect(other.every((e) => !starts.some((a) => a.itemId === e.itemId))).toBe(true);
    for (const e of starts.filter((candidate) => candidate.parentItemId))
      expect(starts.some((p) => p.itemId === e.parentItemId)).toBe(true);
    expect(events.filter((e) => e.type === "content.delta")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stream: "command_output", delta: "first\nlast-marker" }),
        expect.objectContaining({ stream: "reasoning_text", delta: "fixture reasoning-marker" }),
      ]),
    );
    expect(events.filter((e) => e.type === "request.opened")).toHaveLength(10);
    expect(events.filter((e) => e.type === "request.resolved")).toHaveLength(10);
    expect(events.filter((e) => e.type === "background_tasks.changed")).toMatchObject([
      { tasks: [{ kind: "command" }, { kind: "other" }] },
      { tasks: [] },
    ]);
    expect(events.at(-1)).toMatchObject({ type: "turn.completed", state: "completed" });
    // Mutation of a consumer's replay must not poison later paired runs.
    const start = starts[0]!;
    (start.payload as ToolCallPayload).name = "consumer mutation";
    expect(
      createToolTaxonomyReplay("fixture-thread", 0).filter((e) => e.type === "item.started")[0]!
        .payload,
    ).not.toEqual(start.payload);
  });

  it("represents all request outcomes independently from displaying question tool names", () => {
    for (const outcome of requestOutcomeSchema.options) {
      expect(
        runtimeEventSchema.safeParse({
          type: "request.resolved",
          threadId: "fixture-thread",
          requestId: "fixture-request",
          outcome,
        }).success,
      ).toBe(true);
    }
    expect(REQUEST_CASES.map((c) => c.payload.details)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userInputForm: expect.objectContaining({ questions: expect.any(Array) }),
        }),
        expect.objectContaining({
          structuredElicitation: expect.objectContaining({ mode: "form" }),
        }),
        expect.objectContaining({
          structuredElicitation: expect.objectContaining({ mode: "url" }),
        }),
      ]),
    );
    expect(() => createToolTaxonomyReplay("fixture-thread", -1)).toThrow(
      "Invalid taxonomy repetition",
    );
  });
});
