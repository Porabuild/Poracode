import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  HookJSONOutput,
  Options,
  PostToolBatchHookInput,
  Query,
  SDKMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { RuntimeEvent, ThreadConfig } from "@/shared/contracts";
import { ClaudeSdkSession } from "./sdkSession";
import {
  assistantMessage,
  createClaudeTestQuery,
  flushSdkMessages,
  resultMessage,
} from "./sdkSessionTestHarness";

const sdk = vi.hoisted(() => ({
  query: vi.fn<(input: { prompt: AsyncIterable<SDKUserMessage>; options?: Options }) => Query>(),
}));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: sdk.query }));
vi.mock("../binaryResolver", () => ({ resolveAgentBinaryPath: () => "/test-bin/claude" }));

const config: ThreadConfig = { model: "sonnet", mode: "agent", approvalPolicy: "acceptEdits" };
const reminder = "[crew] You just edited files yourself instead of handing the work to your crew.";

const sessions: ClaudeSdkSession[] = [];
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.dispose()));
  vi.restoreAllMocks();
});

async function createSession(mayReceiveContextSteers = true) {
  const fake = createClaudeTestQuery();
  sdk.query.mockReturnValue(fake.runtime);
  const events: RuntimeEvent[] = [];
  const session = await ClaudeSdkSession.create({
    threadId: "claude-context-steer",
    projectLocation: { kind: "posix", path: process.cwd() },
    config,
    presentationMode: "gui",
    ...(mayReceiveContextSteers ? { mayReceiveContextSteers } : {}),
  });
  sessions.push(session);
  session.setListener({
    onRuntimeEvent: (event) => events.push(event),
    onUpdate: () => {},
    onError: () => {},
    onClose: () => {},
  });
  const id = await session.openThread(config);
  const call = sdk.query.mock.calls.at(-1)![0];
  const inputs = call.prompt[Symbol.asyncIterator]();
  const options = call.options!;
  const postToolBatch = (
    input: Partial<PostToolBatchHookInput> = {},
    signal = new AbortController().signal,
  ): Promise<HookJSONOutput> => {
    const hook = options.hooks?.PostToolBatch?.[0]?.hooks[0];
    if (!hook) throw new Error("No PostToolBatch hook was registered.");
    return hook(batch(id, input), undefined, { signal });
  };
  const steer = (text = reminder) => {
    if (!session.steerContext) throw new Error("The session exposes no steerContext.");
    return session.steerContext(text);
  };
  /** Streams one main-thread assistant block of response `responseId`. */
  const reply = async (responseId: string, extra: Record<string, unknown> = {}) => {
    fake.output.write({ ...assistantMessage(id, responseId), ...extra } as SDKMessage);
    await flushSdkMessages();
  };
  return { ...fake, session, id, inputs, options, events, postToolBatch, steer, reply };
}

/** A main-agent batch unless `agent_id` says it ran inside one of Claude's sub-agents. */
function batch(sessionId: string, input: Partial<PostToolBatchHookInput>): PostToolBatchHookInput {
  return {
    hook_event_name: "PostToolBatch",
    session_id: sessionId,
    transcript_path: `/tmp/${sessionId}.jsonl`,
    cwd: process.cwd(),
    tool_calls: [
      {
        tool_name: "Edit",
        tool_input: { file_path: "src/a.ts" },
        tool_use_id: "edit-1",
        tool_response: "ok",
      },
    ],
    ...input,
  };
}

const delivered = (text: string): HookJSONOutput => ({
  hookSpecificOutput: { hookEventName: "PostToolBatch", additionalContext: text },
});

/** Observes a steer's settlement without awaiting it. */
function track(promise: Promise<unknown>) {
  const state: { outcome?: "resolved" | "rejected"; error?: unknown } = {};
  void promise.then(
    () => {
      state.outcome = "resolved";
    },
    (error: unknown) => {
      state.outcome = "rejected";
      state.error = error;
    },
  );
  return state;
}

/** A turn whose model already answered with response `resp-tools`, the one that ran the batch. */
async function runningTurn() {
  const h = await createSession();
  await h.session.startTurn("first", config);
  await h.inputs.next();
  await h.reply("resp-tools");
  h.events.length = 0;
  return h;
}

describe("Claude steerContext", () => {
  it("installs the PostToolBatch hook only for a session the runtime may steer", async () => {
    const steered = await createSession();
    expect(steered.session.steerContext).toBeTypeOf("function");
    expect(Object.keys(steered.options.hooks ?? {})).toEqual(["PostToolBatch"]);
    // Settings and plugin hooks still load from the same sources.
    expect(steered.options.settingSources).toEqual(["user", "project", "local"]);
    expect(steered.options.canUseTool).toBeTypeOf("function");
    expect(steered.options.includeHookEvents).toBeUndefined();

    const plain = await createSession(false);
    expect(plain.session.steerContext).toBeUndefined();
    expect(plain.options.hooks).toBeUndefined();
  });

  it("hands the text to the next main-agent batch and settles with the reply to it", async () => {
    const h = await runningTurn();
    const startTurn = vi.spyOn(h.session, "startTurn");
    const nextInput = vi.fn<(result: IteratorResult<SDKUserMessage>) => void>();
    void h.inputs.next().then(nextInput);

    const steer = track(h.steer());
    await flushSdkMessages();
    // Waits for the batch: nothing is sent, queued, or acknowledged yet.
    expect(steer.outcome).toBeUndefined();

    expect(await h.postToolBatch()).toEqual(delivered(reminder));
    await flushSdkMessages();
    // Handed over, not settled: a tool result could still end the turn.
    expect(steer.outcome).toBeUndefined();
    // Delivered once: the next batch carries nothing.
    expect(await h.postToolBatch()).toEqual({});

    // A late block of the response that ran the batch is not the reply to it.
    await h.reply("resp-tools");
    expect(steer.outcome).toBeUndefined();
    await h.reply("resp-reply");
    expect(steer.outcome).toBe("resolved");

    expect(startTurn).not.toHaveBeenCalled();
    expect(h.interrupt).not.toHaveBeenCalled();
    expect(h.backgroundTasks).not.toHaveBeenCalled();
    expect(nextInput).not.toHaveBeenCalled();

    // The same turn runs on and ends normally.
    h.output.write(resultMessage(h.id));
    await flushSdkMessages();
    expect(h.events.filter((event) => event.type === "turn.started")).toEqual([]);
    expect(h.events.filter((event) => event.type === "turn.completed")).toHaveLength(1);
    expect(JSON.stringify(h.events)).not.toContain("user_message");
  });

  it("rejects when a tool result ends the turn after the hand-over", async () => {
    const h = await runningTurn();
    const steer = track(h.steer());
    expect(await h.postToolBatch()).toEqual(delivered(reminder));

    h.output.write(resultMessage(h.id));
    await flushSdkMessages();
    expect(steer.outcome).toBe("rejected");
    expect(String(steer.error)).toContain("turn ended");
  });

  it("does not take a synthetic API-error message for the reply", async () => {
    const h = await runningTurn();
    const steer = track(h.steer());
    expect(await h.postToolBatch()).toEqual(delivered(reminder));

    await h.reply("resp-error", { error: "server_error" });
    expect(steer.outcome).toBeUndefined();
    h.output.write(resultMessage(h.id));
    await flushSdkMessages();
    expect(steer.outcome).toBe("rejected");
  });

  it("returns a no-op from every batch while nothing is pending", async () => {
    const h = await createSession();
    expect(await h.postToolBatch()).toEqual({});
    await h.session.startTurn("first", config);
    await h.inputs.next();
    expect(await h.postToolBatch()).toEqual({});
  });

  it("skips the batches of Claude's own sub-agents", async () => {
    const h = await runningTurn();
    const steer = track(h.steer());

    expect(await h.postToolBatch({ agent_id: "agent-1", agent_type: "general-purpose" })).toEqual(
      {},
    );
    // A main thread started with --agent reports only agent_type.
    expect(await h.postToolBatch({ agent_type: "reviewer" })).toEqual(delivered(reminder));
    await h.reply("resp-reply");
    expect(steer.outcome).toBe("resolved");
  });

  it("ignores a batch whose hook was already aborted", async () => {
    const h = await runningTurn();
    const steer = track(h.steer());
    const aborted = new AbortController();
    aborted.abort();

    expect(await h.postToolBatch({}, aborted.signal)).toEqual({});
    expect(await h.postToolBatch()).toEqual(delivered(reminder));
    await h.reply("resp-reply");
    expect(steer.outcome).toBe("resolved");
  });

  it("joins a second steer into the pending text", async () => {
    const h = await runningTurn();
    const first = track(h.steer("first"));
    const second = track(h.steer("second"));
    const repeated = track(h.steer("first"));

    expect(await h.postToolBatch()).toEqual(delivered("first\n\nsecond"));
    await h.reply("resp-reply");
    expect([first.outcome, second.outcome, repeated.outcome]).toEqual([
      "resolved",
      "resolved",
      "resolved",
    ]);
  });

  it("rejects instead of starting a turn when none is running", async () => {
    const h = await createSession();
    const startTurn = vi.spyOn(h.session, "startTurn");

    await expect(h.steer()).rejects.toThrow("No Claude turn is running");

    // Nor once the turn it would have joined has ended.
    await h.session.steerTurn("first", config);
    await h.inputs.next();
    h.output.write(resultMessage(h.id));
    await flushSdkMessages();
    startTurn.mockClear();
    await expect(h.steer()).rejects.toThrow("No Claude turn is running");
    expect(startTurn).not.toHaveBeenCalled();
    expect(h.events.filter((event) => event.type === "turn.started")).toHaveLength(1);
  });

  it("rejects when the turn ends before a tool batch takes the text", async () => {
    const h = await runningTurn();
    const steer = track(h.steer());

    h.output.write(resultMessage(h.id));
    await flushSdkMessages();
    expect(steer.outcome).toBe("rejected");
    expect(String(steer.error)).toContain("turn ended");

    // Nothing carries over into the next turn's batches.
    await h.session.startTurn("second", config);
    await h.inputs.next();
    expect(await h.postToolBatch()).toEqual({});
  });

  it("rejects when the turn is stopped, and refuses text while it stops", async () => {
    const h = await runningTurn();
    const handedOver = track(h.steer());
    expect(await h.postToolBatch()).toEqual(delivered(reminder));
    const pending = track(h.steer("pending"));

    await h.session.interruptTurn();
    await flushSdkMessages();
    for (const steer of [handedOver, pending]) {
      expect(steer.outcome).toBe("rejected");
      expect(String(steer.error)).toContain("stopped");
    }
    await expect(h.steer()).rejects.toThrow("No Claude turn is running");
    expect(await h.postToolBatch()).toEqual({});
  });

  it("rejects when the session closes", async () => {
    const h = await runningTurn();
    const steer = track(h.steer());

    await h.session.dispose();
    expect(steer.outcome).toBe("rejected");
    expect(String(steer.error)).toContain("closed");
    await expect(h.steer()).rejects.toThrow("No Claude turn is running");
  });

  it("paints nothing for hook lifecycle or replayed hook context on the stream", async () => {
    const h = await runningTurn();
    void h.steer().catch(() => {});
    expect(await h.postToolBatch()).toEqual(delivered(reminder));
    const hookContext = `PostToolBatch hook additional context: ${reminder}`;

    // Claude Code emits none of these for a PostToolBatch callback today
    // (hook events are opt-in, attachments stay off stream-json); if a
    // version did, the mapping must still drop them.
    for (const message of [
      {
        type: "system",
        subtype: "hook_started",
        hook_id: "hook-1",
        hook_name: "PostToolBatch",
        hook_event: "PostToolBatch",
        uuid: "hook-started",
        session_id: h.id,
      },
      {
        type: "system",
        subtype: "hook_response",
        hook_id: "hook-1",
        hook_name: "PostToolBatch",
        hook_event: "PostToolBatch",
        output: JSON.stringify(delivered(reminder)),
        stdout: "",
        stderr: "",
        outcome: "success",
        uuid: "hook-response",
        session_id: h.id,
      },
      {
        type: "attachment",
        attachment: {
          type: "hook_additional_context",
          content: [reminder],
          hookName: "PostToolBatch",
          hookEvent: "PostToolBatch",
        },
        uuid: "hook-attachment",
        session_id: h.id,
      },
      {
        type: "user",
        isSynthetic: true,
        isReplay: true,
        uuid: "meta-user",
        parent_tool_use_id: null,
        session_id: h.id,
        message: { role: "user", content: [{ type: "text", text: hookContext }] },
      },
    ]) {
      h.output.write(message as unknown as SDKMessage);
    }
    await flushSdkMessages();

    expect(h.events).toEqual([]);
  });
});
