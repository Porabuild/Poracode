import { PassThrough } from "node:stream";
import { expect, it, vi } from "vitest";
import type { Query, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { RuntimeEvent } from "@/shared/contracts";
import type { FollowUpQueueCoordinator } from "../../runtime/threadSession/followUpQueueCoordinator";
import { createFollowUpQueueHarness } from "../../runtime/threadSessionManager.followUpQueueTestHarness";
import { ClaudeSdkSession } from "./sdkSession";

const sdk = vi.hoisted(() => ({
  query: vi.fn<(input: { prompt: AsyncIterable<SDKUserMessage> }) => Query>(),
}));

vi.mock("node-pty", () => ({ spawn: vi.fn<() => never>() }));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: sdk.query }));
vi.mock("../binaryResolver", () => ({ resolveAgentBinaryPath: () => undefined }));

async function flushSdkMessages(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function assistantMessage(sessionId: string, id: string): SDKMessage {
  return {
    type: "assistant",
    uuid: id,
    session_id: sessionId,
    parent_tool_use_id: null,
    message: { id, role: "assistant", content: [{ type: "text", text: id }] },
  } as unknown as SDKMessage;
}

function resultMessage(sessionId: string): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    session_id: sessionId,
  } as unknown as SDKMessage;
}

// PR #747 adds this capability. Keep the integration gate dormant while the
// adapter uses interrupt-and-drain, then exercise the real SDK adapter and
// supervisor as soon as native steering is present in a combined checkout.
it.skipIf(!("steerTurn" in ClaudeSdkSession.prototype))(
  "keeps an accepted native SDK follow-up ahead of FIFO across the preceding result",
  async () => {
    const output = new PassThrough({ objectMode: true });
    const interrupt = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const query = Object.assign(output, {
      interrupt,
      setModel: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      setPermissionMode: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      applyFlagSettings: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      initializationResult: async () => ({ commands: [] }),
      supportedCommands: async () => [],
      supportedModels: async () => [],
      getContextUsage: async () => null,
      close: () => output.end(),
    }) as unknown as Query;
    sdk.query.mockReturnValue(query);

    const { manager, session, finish } = createFollowUpQueueHarness();
    const queue = (manager as unknown as { followUpQueue: FollowUpQueueCoordinator }).followUpQueue;
    const events: RuntimeEvent[] = [];
    const errors: string[] = [];
    const native = await ClaudeSdkSession.create({
      threadId: session.threadId,
      projectLocation: session.projectLocation,
      config: session.config,
      presentationMode: "gui",
    });
    session.structuredSession = native;
    const start = vi.spyOn(native, "startTurn");
    native.setListener({
      onRuntimeEvent: (event) => {
        events.push(event);
        queue.onStructuredRuntimeEvent(session, event);
      },
      onUpdate: (update) => {
        session.status = update.status;
        session.attention = update.attention;
        queue.onStructuredUpdate(session, update.status);
      },
      onError: (error) => errors.push(error),
      onClose: () => {},
    });

    try {
      const providerId = await native.openThread(session.config);
      const inputs = sdk.query.mock.calls.at(-1)![0].prompt[Symbol.asyncIterator]();
      await manager.sendThreadInput({
        threadId: session.threadId,
        prompt: "initial prompt",
        config: session.config,
      });
      expect((await inputs.next()).value?.message.content).toBe("initial prompt");
      output.write(assistantMessage(providerId, "initial response"));
      await flushSdkMessages();

      await manager.queueThreadFollowUp({
        threadId: session.threadId,
        prompt: "FIFO follow-up",
        config: session.config,
      });
      await manager.setPendingSteer({
        threadId: session.threadId,
        prompt: "native follow-up",
        config: session.config,
      });
      // The SDK has already consumed the iterable entry. Its pending work
      // cannot be inferred from the local AsyncPromptQueue's length.
      expect((await inputs.next()).value?.message.content).toBe("native follow-up");
      expect(interrupt).not.toHaveBeenCalled();
      expect(start).toHaveBeenCalledTimes(1);

      output.write(resultMessage(providerId));
      await flushSdkMessages();
      expect(events.filter((event) => event.type === "turn.completed")).toHaveLength(1);
      // SDK acceptance happened before the preceding turn's result. FIFO
      // must still wait through this gap and through the native reply itself.
      expect(start).toHaveBeenCalledTimes(1);
      expect(manager.getThreadFollowUpQueue(session.threadId)?.items).toHaveLength(1);

      output.write(assistantMessage(providerId, "native response"));
      await flushSdkMessages();
      expect(events.filter((event) => event.type === "turn.started")).toHaveLength(2);
      expect(start).toHaveBeenCalledTimes(1);

      output.write(resultMessage(providerId));
      await flushSdkMessages();
      await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(2));
      expect(start.mock.calls[1]?.[0]).toBe("FIFO follow-up");
      expect((await inputs.next()).value?.message.content).toBe("FIFO follow-up");
      expect(interrupt).not.toHaveBeenCalled();
      expect(errors).toEqual([]);
    } finally {
      finish();
      await manager.dispose();
      output.destroy();
      vi.restoreAllMocks();
    }
  },
);
