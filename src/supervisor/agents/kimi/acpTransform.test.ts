import type { SessionNotification } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import {
  createAcpMapperState,
  mapAcpSessionUpdate,
  PORACODE_ACP_DETACHED_SUBAGENT_META_KEY,
  PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY,
  PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY,
  PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY,
} from "../acp/canonicalMapping";
import { isAcpSubAgentToolCall } from "../acp/canonicalMapping/subagents";
import {
  createKimiAcpSessionUpdateTransform,
  transformKimiAcpSessionUpdate,
  type KimiBackgroundLaunch,
} from "./acpTransform";

function toolCall(overrides: Record<string, unknown>): SessionNotification {
  return {
    sessionId: "ses-1",
    update: {
      sessionUpdate: "tool_call",
      toolCallId: "tc-agent",
      status: "pending",
      ...overrides,
    },
  } as unknown as SessionNotification;
}

function textContent(text: string) {
  return { type: "content", content: { type: "text", text } };
}

/** Casts a session-update payload to a plain record so tests can read whichever fields they need without a bespoke inline interface. */
function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function transformedRawInput(input: SessionNotification): Record<string, unknown> {
  return asRecord(transformKimiAcpSessionUpdate(input).update).rawInput as Record<string, unknown>;
}

// Verbatim shape of Kimi's detached-launch receipt: identical text arrives as
// both `rawOutput` and the `content[0].content.text` echo.
const DETACHED_LAUNCH_RECEIPT =
  "task_id: agent-1a2b3c4d\nstatus: running\nagent_id: agent-0\nactual_subagent_type: explore\nautomatic_notification: true\n\ndescription: Inspect files";

describe("transformKimiAcpSessionUpdate", () => {
  it("recovers subagent_type and description from a Kimi launch title", () => {
    // Verbatim shape Kimi's ACP server sends for its `Agent` tool: a human
    // title, `kind: "other"`, and no rawInput.
    const input = toolCall({
      kind: "other",
      title: "Launching explore agent: Investigate PWA state bugs 3-7",
    });
    const rawInput = transformedRawInput(input);
    expect(rawInput).toMatchObject({
      subagent_type: "explore",
      description: "Investigate PWA state bugs 3-7",
    });
    expect(isAcpSubAgentToolCall({ rawInput })).toBe(true);
  });

  it("recognizes background agent launches", () => {
    const input = toolCall({
      kind: "other",
      title: "Launching background coder agent: Serve local images to PWA",
    });
    expect(transformedRawInput(input)).toMatchObject({
      subagent_type: "coder",
      description: "Serve local images to PWA",
      background: true,
    });
  });

  it("also normalizes tool_call_update notifications", () => {
    const input = toolCall({
      sessionUpdate: "tool_call_update",
      status: "completed",
      title: "Launching explore agent: Investigate PWA state bugs 3-7",
      rawOutput: "agent_id: agent-0\nactual_subagent_type: explore\nstatus: completed",
    });
    expect(transformedRawInput(input)).toMatchObject({ subagent_type: "explore" });
  });

  it("removes Kimi's transport header from foreground subagent output", () => {
    const input = toolCall({
      sessionUpdate: "tool_call_update",
      status: "completed",
      title: "Launching explore agent: Investigate",
      rawOutput:
        "agent_id: agent-0\nactual_subagent_type: explore\nstatus: completed\n\n[summary]\nThe useful result",
    });
    expect(asRecord(transformKimiAcpSessionUpdate(input).update).rawOutput).toBe(
      "The useful result",
    );
  });

  it("preserves an existing rawInput subagent_type", () => {
    const input = toolCall({
      title: "Launching explore agent: Investigate",
      rawInput: { subagent_type: "custom", prompt: "p" },
    });
    expect(transformedRawInput(input)).toMatchObject({
      subagent_type: "custom",
      prompt: "p",
    });
  });

  it("merges recovered fields into an existing rawInput", () => {
    const input = toolCall({
      title: "Launching explore agent: Investigate",
      rawInput: { prompt: "the full prompt" },
    });
    expect(transformedRawInput(input)).toMatchObject({
      prompt: "the full prompt",
      subagent_type: "explore",
      description: "Investigate",
    });
  });

  it("ignores ordinary tool calls and non-tool updates", () => {
    const read = toolCall({ kind: "read", title: "Reading src/mobile/views/ThreadView.tsx" });
    expect(transformKimiAcpSessionUpdate(read)).toBe(read);
    const untitled = toolCall({ kind: "other" });
    expect(transformKimiAcpSessionUpdate(untitled)).toBe(untitled);
    const chunk = {
      sessionId: "ses-1",
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } },
    } as unknown as SessionNotification;
    expect(transformKimiAcpSessionUpdate(chunk)).toBe(chunk);
  });

  it("classifies the initial empty Agent call and hides streamed JSON input", () => {
    const transform = createKimiAcpSessionUpdateTransform();
    const initial = transform(toolCall({ title: "Agent", content: [] }));
    const initialUpdate = asRecord(initial.update);
    const initialMeta = initialUpdate._meta as Record<string, unknown> | undefined;
    expect(initialUpdate.rawInput).toMatchObject({ subagent_type: "agent" });
    expect(initialMeta?.[PORACODE_ACP_DETACHED_SUBAGENT_META_KEY]).toBeUndefined();
    expect(initialMeta?.[PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY]).toBe(true);
    expect(initialUpdate).not.toHaveProperty("content");

    const streamed = transform(
      toolCall({
        sessionUpdate: "tool_call_update",
        status: "in_progress",
        title: undefined,
        content: [textContent('{"description":"Inspect files","subagent_type":"explore"}')],
      }),
    );
    expect(asRecord(streamed.update).rawInput).toMatchObject({
      description: "Inspect files",
      subagent_type: "explore",
    });
    expect(streamed.update).not.toHaveProperty("content");
  });

  it("keeps concurrent foreground Agent calls as top-level siblings", () => {
    const transform = createKimiAcpSessionUpdateTransform();
    const state = createAcpMapperState("thread-1");

    const first = mapAcpSessionUpdate(
      transform(toolCall({ toolCallId: "agent-a", title: "Agent" })),
      state,
    );
    const second = mapAcpSessionUpdate(
      transform(toolCall({ toolCallId: "agent-b", title: "Agent" })),
      state,
    );

    expect(first.find((event) => event.type === "item.started")).not.toHaveProperty("parentItemId");
    expect(second.find((event) => event.type === "item.started")).not.toHaveProperty(
      "parentItemId",
    );
  });

  it("keeps a background launch running and reports its task to the bridge", () => {
    const launches: KimiBackgroundLaunch[] = [];
    const transform = createKimiAcpSessionUpdateTransform({
      onBackgroundLaunch: (launch) => launches.push(launch),
    });
    transform(toolCall({ title: "Agent" }));
    transform(
      toolCall({
        sessionUpdate: "tool_call_update",
        status: "in_progress",
        title: "Launching background explore agent: Inspect files",
        rawInput: {
          description: "Inspect files",
          subagent_type: "explore",
          run_in_background: true,
        },
      }),
    );
    const receipt = transform(
      toolCall({
        sessionUpdate: "tool_call_update",
        status: "completed",
        title: undefined,
        rawOutput:
          "task_id: agent-task\nstatus: running\nagent_id: agent-0\nautomatic_notification: true",
        content: [textContent("launch receipt")],
      }),
    );
    expect(asRecord(receipt.update).status).toBe("in_progress");
    expect(
      (asRecord(receipt.update)._meta as Record<string, unknown> | undefined)?.[
        PORACODE_ACP_DETACHED_SUBAGENT_META_KEY
      ],
    ).toBe(true);
    expect(receipt.update).not.toHaveProperty("rawOutput");
    expect(receipt.update).not.toHaveProperty("content");
    expect(launches).toEqual([
      {
        sessionId: "ses-1",
        toolCallId: "tc-agent",
        taskId: "agent-task",
        agentId: "agent-0",
        subagentType: "explore",
        description: "Inspect files",
      },
    ]);
  });

  it("maps streamed input as arguments and foreground output as a nested child", () => {
    const transform = createKimiAcpSessionUpdateTransform();
    const state = createAcpMapperState("thread-1");
    const started = mapAcpSessionUpdate(transform(toolCall({ title: "Agent" })), state);
    const parentItemId = (started[0] as { itemId: string }).itemId;
    expect((started[0] as { payload?: unknown }).payload).toMatchObject({ isSubAgent: true });

    const inputEvents = mapAcpSessionUpdate(
      transform(
        toolCall({
          sessionUpdate: "tool_call_update",
          status: "in_progress",
          title: "Launching explore agent: Inspect files",
          rawInput: { description: "Inspect files", subagent_type: "explore" },
          content: [textContent("input JSON")],
        }),
      ),
      state,
    );
    expect(inputEvents).toContainEqual(
      expect.objectContaining({
        type: "item.updated",
        payload: expect.objectContaining({
          args: {
            _toolName: "task",
            description: "Inspect files",
            subagent_type: "explore",
          },
        }),
      }),
    );
    expect(inputEvents).not.toContainEqual(
      expect.objectContaining({ type: "content.delta", delta: "input JSON" }),
    );
    const child = inputEvents.find(
      (event) => event.type === "item.started" && event.itemType === "assistant_message",
    );
    expect(child).toMatchObject({ parentItemId });

    const completed = mapAcpSessionUpdate(
      transform(
        toolCall({
          sessionUpdate: "tool_call_update",
          status: "completed",
          title: undefined,
          rawOutput:
            "agent_id: agent-0\nactual_subagent_type: explore\nstatus: completed\n\n[summary]\nUseful result",
        }),
      ),
      state,
    );
    expect(completed).toContainEqual(
      expect.objectContaining({
        type: "content.delta",
        delta: expect.stringContaining("Useful result"),
      }),
    );
  });

  it("promotes a launch to detached when background input arrives late", () => {
    const transform = createKimiAcpSessionUpdateTransform();
    const state = createAcpMapperState("thread-1");
    mapAcpSessionUpdate(transform(toolCall({ title: "Agent" })), state);
    expect(state.toolCallItems.get("tc-agent")?.detached).toBe(false);
    mapAcpSessionUpdate(
      transform(
        toolCall({
          sessionUpdate: "tool_call_update",
          status: "in_progress",
          title: "Launching background explore agent: Inspect files",
          rawInput: { subagent_type: "explore", run_in_background: true },
        }),
      ),
      state,
    );
    expect(state.toolCallItems.get("tc-agent")?.detached).toBe(true);
  });

  it("normalizes the v2 streamed sequence: pending create, cumulative deltas, started upgrade, receipt", () => {
    const launches: KimiBackgroundLaunch[] = [];
    const transform = createKimiAcpSessionUpdateTransform({
      onBackgroundLaunch: (launch) => launches.push(launch),
    });

    // v2 lazily CREATEs the tool_call from the first `tool.call.delta`: the
    // raw tool name as title, status `pending`, and a PARTIAL args fragment
    // as content.
    const create = transform(
      toolCall({
        status: "pending",
        title: "Agent",
        kind: "other",
        content: [textContent('{"description":"Insp')],
      }),
    );
    const createUpdate = asRecord(create.update);
    expect(createUpdate.status).toBe("pending");
    expect(createUpdate.rawInput).toMatchObject({ subagent_type: "agent" });
    expect(
      (createUpdate._meta as Record<string, unknown> | undefined)?.[
        PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY
      ],
    ).toBe(true);
    expect(createUpdate).not.toHaveProperty("content");

    // Later deltas REPLACE the content with the CUMULATIVE args text; the
    // partial fragment must not leak into the normalized input.
    const partial = transform(
      toolCall({
        sessionUpdate: "tool_call_update",
        status: "in_progress",
        content: [textContent('{"description":"Inspect files","subagent')],
      }),
    );
    expect(asRecord(partial.update).rawInput).toMatchObject({
      subagent_type: "agent",
    });
    expect(partial.update).not.toHaveProperty("content");

    const delta = transform(
      toolCall({
        sessionUpdate: "tool_call_update",
        status: "in_progress",
        content: [
          textContent(
            '{"description":"Inspect files","subagent_type":"explore","run_in_background":true}',
          ),
        ],
      }),
    );
    expect(asRecord(delta.update).rawInput).toMatchObject({
      description: "Inspect files",
      subagent_type: "explore",
      background: true,
    });
    expect(delta.update).not.toHaveProperty("content");

    // `tool.call.started` upgrades the lazy create: rewrites the title,
    // carries kind/rawInput/locations.
    const fullArgs =
      '{"description":"Inspect files","subagent_type":"explore","run_in_background":true}';
    const upgrade = transform(
      toolCall({
        sessionUpdate: "tool_call_update",
        status: "in_progress",
        title: "Launching background explore agent: Inspect files",
        kind: "other",
        rawInput: {
          description: "Inspect files",
          subagent_type: "explore",
          run_in_background: true,
        },
        locations: [],
        content: [textContent(fullArgs)],
      }),
    );
    const upgradeUpdate = asRecord(upgrade.update);
    expect(upgradeUpdate.rawInput).toMatchObject({
      subagent_type: "explore",
      description: "Inspect files",
      background: true,
    });
    expect(
      (upgradeUpdate._meta as Record<string, unknown> | undefined)?.[
        PORACODE_ACP_DETACHED_SUBAGENT_META_KEY
      ],
    ).toBe(true);
    expect(upgradeUpdate).not.toHaveProperty("content");

    // `tool.result` delivers the detached launch receipt; the call stays
    // open for the session-file bridge.
    const receipt = transform(
      toolCall({
        sessionUpdate: "tool_call_update",
        status: "completed",
        rawOutput: DETACHED_LAUNCH_RECEIPT,
        content: [textContent(DETACHED_LAUNCH_RECEIPT)],
      }),
    );
    expect(asRecord(receipt.update).status).toBe("in_progress");
    expect(receipt.update).not.toHaveProperty("rawOutput");
    expect(receipt.update).not.toHaveProperty("content");
    expect(launches).toEqual([
      {
        sessionId: "ses-1",
        toolCallId: "tc-agent",
        taskId: "agent-1a2b3c4d",
        agentId: "agent-0",
        subagentType: "explore",
        description: "Inspect files",
      },
    ]);
  });

  it("normalizes a v2 non-streamed create and strips the transport header from its result", () => {
    const transform = createKimiAcpSessionUpdateTransform();

    // No streamed deltas: `tool.call.started` emits a plain CREATE with
    // status `in_progress` + rawInput and the descriptive title.
    const create = transform(
      toolCall({
        status: "in_progress",
        title: "Launching explore agent: Inspect files",
        kind: "other",
        rawInput: { description: "Inspect files", subagent_type: "explore" },
        content: [textContent('{"description":"Inspect files","subagent_type":"explore"}')],
      }),
    );
    const createUpdate = asRecord(create.update);
    expect(createUpdate.rawInput).toMatchObject({
      subagent_type: "explore",
      description: "Inspect files",
    });
    expect(
      (createUpdate._meta as Record<string, unknown> | undefined)?.[
        PORACODE_ACP_DETACHED_SUBAGENT_META_KEY
      ],
    ).toBeUndefined();
    expect(createUpdate).not.toHaveProperty("content");

    const done = transform(
      toolCall({
        sessionUpdate: "tool_call_update",
        status: "completed",
        rawOutput:
          "agent_id: agent-0\nactual_subagent_type: explore\nstatus: completed\n\n[summary]\nThe useful result",
      }),
    );
    expect(asRecord(done.update).rawOutput).toBe("The useful result");
  });

  it("detaches a v2 foreground call whose tool result is a late background receipt", () => {
    const launches: KimiBackgroundLaunch[] = [];
    const transform = createKimiAcpSessionUpdateTransform({
      onBackgroundLaunch: (launch) => launches.push(launch),
    });
    transform(toolCall({ status: "pending", title: "Agent", content: [] }));
    transform(
      toolCall({
        sessionUpdate: "tool_call_update",
        status: "in_progress",
        title: "Launching explore agent: Inspect files",
        rawInput: { description: "Inspect files", subagent_type: "explore" },
      }),
    );

    // v2 detaches a foreground call mid-run: the terminal tool result is
    // the launch receipt even though nothing was marked background.
    const receipt = transform(
      toolCall({
        sessionUpdate: "tool_call_update",
        status: "completed",
        rawOutput:
          "task_id: agent-9f8e7d6c\nstatus: running\nagent_id: agent-1\nactual_subagent_type: explore\nautomatic_notification: true",
      }),
    );
    const receiptUpdate = asRecord(receipt.update);
    expect(receiptUpdate.status).toBe("in_progress");
    expect(receiptUpdate.rawInput).toMatchObject({ background: true });
    expect(
      (receiptUpdate._meta as Record<string, unknown> | undefined)?.[
        PORACODE_ACP_DETACHED_SUBAGENT_META_KEY
      ],
    ).toBe(true);
    expect(receiptUpdate).not.toHaveProperty("rawOutput");
    expect(launches).toEqual([
      {
        sessionId: "ses-1",
        toolCallId: "tc-agent",
        taskId: "agent-9f8e7d6c",
        agentId: "agent-1",
        subagentType: "explore",
        description: "Inspect files",
      },
    ]);
  });

  it("keeps the canonical input across v2 title-only progress updates", () => {
    const transform = createKimiAcpSessionUpdateTransform();
    transform(toolCall({ status: "pending", title: "Agent", content: [] }));
    transform(
      toolCall({
        sessionUpdate: "tool_call_update",
        status: "in_progress",
        title: "Launching explore agent: Inspect files",
        rawInput: { description: "Inspect files", subagent_type: "explore" },
      }),
    );

    // `tool.progress` (kind: status) refreshes only the card title.
    const progress = transform(
      toolCall({
        sessionUpdate: "tool_call_update",
        title: "Exploring the repository",
      }),
    );
    const progressUpdate = asRecord(progress.update);
    expect(progressUpdate.title).toBe("Exploring the repository");
    expect(progressUpdate.rawInput).toMatchObject({
      subagent_type: "explore",
      description: "Inspect files",
    });
  });

  it("maps a v2 pending create to a running top-level subagent item", () => {
    const transform = createKimiAcpSessionUpdateTransform();
    const state = createAcpMapperState("thread-1");

    const started = mapAcpSessionUpdate(
      transform(toolCall({ status: "pending", title: "Agent", content: [] })),
      state,
    );
    const item = started.find((event) => event.type === "item.started") as {
      itemId: string;
      payload?: Record<string, unknown>;
    };
    expect(item.payload).toMatchObject({ isSubAgent: true, status: "running" });
    expect(item).not.toHaveProperty("parentItemId");

    // The started-upgrade flips the tracked item to detached.
    mapAcpSessionUpdate(
      transform(
        toolCall({
          sessionUpdate: "tool_call_update",
          status: "in_progress",
          title: "Launching background explore agent: Inspect files",
          rawInput: { subagent_type: "explore", run_in_background: true },
        }),
      ),
      state,
    );
    expect(state.toolCallItems.get("tc-agent")?.detached).toBe(true);
  });

  it("separates recovered background output from the automatic parent reply", () => {
    const transform = createKimiAcpSessionUpdateTransform();
    const state = createAcpMapperState("thread-1");
    mapAcpSessionUpdate(transform(toolCall({ title: "Agent" })), state);
    const parentItemId = state.toolCallItems.get("tc-agent")?.itemId;
    mapAcpSessionUpdate(
      transform(
        toolCall({
          sessionUpdate: "tool_call_update",
          status: "in_progress",
          title: "Launching background explore agent: Inspect files",
          rawInput: { subagent_type: "explore", run_in_background: true },
        }),
      ),
      state,
    );

    const nested = mapAcpSessionUpdate(
      {
        sessionId: "ses-1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "child result" },
          _meta: { [PORACODE_ACP_PARENT_TOOL_CALL_ID_META_KEY]: "tc-agent" },
        },
      } as SessionNotification,
      state,
    );
    expect(nested.find((event) => event.type === "item.started")).toMatchObject({
      parentItemId,
    });

    const parentReply = mapAcpSessionUpdate(
      {
        sessionId: "ses-1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "parent reply" },
          _meta: { [PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY]: true },
        },
      } as SessionNotification,
      state,
    );
    expect(parentReply.map((event) => event.type)).toEqual([
      "item.completed",
      "item.started",
      "content.delta",
    ]);
    expect(parentReply[1]).not.toHaveProperty("parentItemId");
  });
});

describe("transformKimiAcpSessionUpdate (thought level)", () => {
  // Probed from kimi 0.33.0: the `thinking` select lists the untiered `on`
  // after K3's real tiers and reports it as `currentValue` even there.
  function configOptionUpdate(thinking: {
    currentValue?: string;
    options: { value: string; name: string }[];
  }): SessionNotification {
    return {
      sessionId: "s1",
      update: {
        sessionUpdate: "config_option_update",
        configOptions: [
          {
            id: "model",
            category: "model",
            type: "select",
            currentValue: "kimi-code/k3-256k",
            options: [{ value: "kimi-code/k3-256k", name: "K3-256k" }],
          },
          { id: "thinking", category: "thought_level", type: "select", ...thinking },
        ],
      },
    } as unknown as SessionNotification;
  }

  function thoughtLevelOf(notification: SessionNotification) {
    const options = (notification.update as { configOptions?: unknown[] }).configOptions ?? [];
    return options.find((option) => (option as { id?: unknown }).id === "thinking") as {
      currentValue?: string;
      options: { value: string }[];
    };
  }

  it("drops the untiered `on` level and its stale current value for a tiered model", () => {
    const result = transformKimiAcpSessionUpdate(
      configOptionUpdate({
        currentValue: "on",
        options: [
          { value: "low", name: "Thinking Low" },
          { value: "high", name: "Thinking High" },
          { value: "max", name: "Thinking Max" },
          { value: "on", name: "Thinking On" },
        ],
      }),
    );
    const thinking = thoughtLevelOf(result);
    expect(thinking.options.map((option) => option.value)).toEqual(["low", "high", "max"]);
    // `on` is not one of the model's efforts, so the session must not adopt it.
    expect(thinking).not.toHaveProperty("currentValue");
  });

  it("keeps a real tier as the current value", () => {
    const thinking = thoughtLevelOf(
      transformKimiAcpSessionUpdate(
        configOptionUpdate({
          currentValue: "max",
          options: [
            { value: "low", name: "Thinking Low" },
            { value: "max", name: "Thinking Max" },
            { value: "on", name: "Thinking On" },
          ],
        }),
      ),
    );
    expect(thinking.options.map((option) => option.value)).toEqual(["low", "max"]);
    expect(thinking.currentValue).toBe("max");
  });

  // Verified against kimi 0.33.0: after K3 `max` -> K2.7 the session still
  // reports `max`, and lists it as a K2.7 option. Adopting it would run the
  // untiered model at a tier it does not offer.
  it("drops the previous model's tier after switching to an untiered model", () => {
    const thinking = thoughtLevelOf(
      transformKimiAcpSessionUpdate(
        configOptionUpdate({
          currentValue: "max",
          options: [
            { value: "on", name: "Thinking On" },
            { value: "max", name: "Thinking Max" },
          ],
        }),
      ),
    );
    expect(thinking.options.map((option) => option.value)).toEqual(["on"]);
    expect(thinking).not.toHaveProperty("currentValue");
  });

  it("leaves an on-only selector untouched (K2.7 has no tier to choose)", () => {
    const notification = configOptionUpdate({
      currentValue: "on",
      options: [{ value: "on", name: "Thinking On" }],
    });
    expect(transformKimiAcpSessionUpdate(notification)).toBe(notification);
  });
});
