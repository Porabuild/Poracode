import { expect, it, vi } from "vitest";
import type { Query, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { RuntimeEvent } from "@/shared/contracts";
import type { FollowUpQueueCoordinator } from "../../runtime/threadSession/followUpQueueCoordinator";
import { createFollowUpQueueHarness } from "../../runtime/threadSessionManager.followUpQueueTestHarness";
import { ClaudeSdkSession } from "./sdkSession";
import {
  assistantMessage,
  resultMessage,
  flushSdkMessages,
  createClaudeTestQuery,
} from "./sdkSessionTestHarness";

const sdk = vi.hoisted(() => ({
  query: vi.fn<(input: { prompt: AsyncIterable<SDKUserMessage> }) => Query>(),
}));

vi.mock("node-pty", () => ({ spawn: vi.fn<() => never>() }));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: sdk.query }));
vi.mock("../binaryResolver", () => ({ resolveAgentBinaryPath: () => undefined }));

it.each([false, true])(
  "keeps an accepted native follow-up ahead of FIFO (folded: %s)",
  async (folded) => {
    const { output, interrupt, runtime } = createClaudeTestQuery();
    sdk.query.mockReturnValue(runtime);

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
      output.write({
        type: "system",
        subtype: "init",
        session_id: providerId,
        capabilities: ["interrupt_cancel_queued_v1"],
      } as unknown as SDKMessage);
      await flushSdkMessages();
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
      const delivered = (await inputs.next()).value!;
      expect(delivered.message.content).toBe("native follow-up");
      expect(delivered.priority).toBe("next");
      expect(interrupt).not.toHaveBeenCalled();
      expect(start).toHaveBeenCalledTimes(1);

      if (!folded) {
        output.write(resultMessage(providerId));
        await flushSdkMessages();
      }
      expect(session.status).toBe("working");
      expect(manager.getThreadFollowUpQueue(session.threadId)?.items).toHaveLength(1);
      output.write({ ...delivered, session_id: providerId, isReplay: true } as SDKMessage);
      output.write(assistantMessage(providerId, "native response"));
      await flushSdkMessages();
      expect(events.filter((event) => event.type === "turn.started")).toHaveLength(folded ? 1 : 2);
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
