import { describe, expect, it } from "vitest";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import { createAcpMapperState, mapAcpSessionUpdate } from "../acp/canonicalMapping";
import { createDevinAcpTransform } from "./acpTransform";
import foreground from "./fixtures/subagent.json";
import background from "./fixtures/subagent-background.json";

describe("Devin native subagents (3000.10.21 wire fixtures)", () => {
  it.each([
    ["foreground", foreground, 1],
    ["parallel background", background, 2],
  ] as const)(
    "renders %s calls as sibling subagents with nested results",
    (_name, fixture, count) => {
      const transform = createDevinAcpTransform();
      const state = createAcpMapperState("thread");
      const notifications = fixture.map((note) => transform(note as SessionNotification));
      const events = notifications.flatMap((note) => mapAcpSessionUpdate(note, state));
      const starts = events.filter(
        (e) =>
          e.type === "item.started" &&
          e.itemType === "tool_call" &&
          (e.payload as { args?: Record<string, unknown> } | undefined)?.args?._toolName === "task",
      );
      expect(starts).toHaveLength(count);
      for (const start of starts) expect(start).not.toHaveProperty("parentItemId");
      const completions = notifications.filter(
        (note) =>
          (note.update._meta as Record<string, unknown>)?.poracodeSubAgentStatus === "completed",
      );
      expect(completions).toHaveLength(count);
      expect(
        completions.map((n) => (n.update as { rawOutput?: unknown }).rawOutput).sort(),
      ).toEqual(count === 1 ? ["143"] : ["143", "168"]);
      expect(
        events.some(
          (e) => e.type === "item.started" && e.itemType === "assistant_message" && e.parentItemId,
        ),
      ).toBe(true);
    },
  );
  it("keeps background launch acknowledgement open until its native completion", () => {
    const transform = createDevinAcpTransform();
    const outputs = background.map((note) => transform(note as SessionNotification));
    const acknowledgement = outputs.find(
      (n) =>
        n.update.sessionUpdate === "tool_call_update" &&
        n.update.toolCallId === "call_HEcSHR9hna4Kb0wwPtLGieVR" &&
        (n.update as { rawInput?: Record<string, unknown> }).rawInput?.background,
    );
    expect(acknowledgement?.update).toMatchObject({ status: "in_progress" });
  });
});

it("correlates reversed native starts by profile and background, never just description", () => {
  const transform = createDevinAcpTransform();
  const note = (update: Record<string, unknown>) =>
    ({ sessionId: "session", update }) as SessionNotification;
  for (const [id, isBackground] of [
    ["foreground", false],
    ["background", true],
  ] as const)
    transform(
      note({
        sessionUpdate: "tool_call",
        toolCallId: id,
        rawInput: {
          title: "Same",
          task: "Same task",
          profile: "subagent_explore",
          is_background: isBackground,
        },
        _meta: { "cognition.ai/inferenceToolName": "run_subagent" },
      }),
    );
  const start = transform(
    note({
      sessionUpdate: "tool_call_update",
      toolCallId: "native-background",
      status: "in_progress",
      _meta: {
        "cognition.ai/subagent_started": {
          agentId: "native-background",
          title: "Same",
          task: "Same task",
          profile: "Explore",
          isBackground: true,
        },
      },
    }),
  );
  expect(start.update).toMatchObject({ toolCallId: "background" });
  const end = transform(
    note({
      sessionUpdate: "tool_call_update",
      toolCallId: "native-background",
      status: "completed",
      _meta: {
        "cognition.ai/subagent_completed": {
          agentId: "native-background",
          success: true,
          summary: "Correct result",
        },
      },
    }),
  );
  expect(end.update).toMatchObject({ toolCallId: "background", rawOutput: "Correct result" });
});

it("does not strand ambiguous background launches awaiting an unresolvable completion", () => {
  const transform = createDevinAcpTransform();
  const note = (update: Record<string, unknown>) =>
    ({ sessionId: "session", update }) as SessionNotification;
  for (const id of ["first", "second"])
    transform(
      note({
        sessionUpdate: "tool_call",
        toolCallId: id,
        rawInput: { title: "Same", task: "Same", profile: "subagent_explore", is_background: true },
        _meta: { "cognition.ai/inferenceToolName": "run_subagent" },
      }),
    );
  transform(
    note({
      sessionUpdate: "tool_call_update",
      toolCallId: "native",
      status: "in_progress",
      _meta: {
        "cognition.ai/subagent_started": {
          agentId: "native",
          title: "Same",
          task: "Same",
          profile: "Explore",
          isBackground: true,
        },
      },
    }),
  );
  for (const id of ["first", "second"])
    expect(
      transform(
        note({
          sessionUpdate: "tool_call_update",
          toolCallId: id,
          status: "completed",
          _meta: { "cognition.ai/inferenceToolName": "run_subagent" },
        }),
      ).update,
    ).toMatchObject({ toolCallId: id, status: "completed" });
});
