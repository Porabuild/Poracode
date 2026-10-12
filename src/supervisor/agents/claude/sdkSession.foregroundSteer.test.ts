import { expect, it, vi } from "vitest";
import type { Query, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  createNativeSteerSession,
  nativeSteerConfig as config,
} from "./sdkSessionNativeSteerTestHarness";
import { assistantMessage, flushSdkMessages } from "./sdkSessionTestHarness";

const sdk = vi.hoisted(() => ({
  query: vi.fn<(input: { prompt: AsyncIterable<SDKUserMessage>; options: unknown }) => Query>(),
}));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: sdk.query }));
vi.mock("../binaryResolver", () => ({ resolveAgentBinaryPath: () => "/test-bin/claude" }));
const createSession = () => createNativeSteerSession(sdk.query);

it("Stop invalidates a steer while foreground backgrounding is still pending", async () => {
  const h = await createSession();
  h.output.write({
    ...assistantMessage(h.id, "live-tool"),
    message: {
      id: "live-tool",
      role: "assistant",
      content: [
        { type: "tool_use", id: "live-tool", name: "Bash", input: { command: "sleep 20" } },
      ],
    },
  } as SDKMessage);
  await flushSdkMessages();
  const backgrounded = Promise.withResolvers<boolean>();
  h.backgroundTasks.mockReturnValueOnce(backgrounded.promise);
  const submission = h.session.steerTurn("must not run", config);
  await flushSdkMessages();
  expect(h.backgroundTasks).toHaveBeenCalledTimes(1);
  await h.session.interruptTurn();
  backgrounded.resolve(true);
  await submission;
  await h.session.startTurn("replacement", config);
  expect((await h.inputs.next()).value?.message.content).toBe("replacement");
});

it("waits for foreground task registration before backgrounding and sending a steer", async () => {
  const h = await createSession();
  h.output.write({
    ...assistantMessage(h.id, "foreground"),
    message: {
      id: "foreground",
      role: "assistant",
      content: [
        { type: "tool_use", id: "foreground", name: "Bash", input: { command: "sleep 20" } },
      ],
    },
  } as SDKMessage);
  await flushSdkMessages();
  h.backgroundTasks.mockResolvedValueOnce(false);
  const submission = h.session.steerTurn("replacement", config);
  await flushSdkMessages();
  expect(h.backgroundTasks).toHaveBeenCalledTimes(1);
  expect(h.interrupt).not.toHaveBeenCalled();
  const delivered = vi.fn<(result: IteratorResult<SDKUserMessage>) => void>();
  void h.inputs.next().then(delivered);
  h.output.write({
    type: "system",
    subtype: "task_started",
    task_id: "foreground-task",
    tool_use_id: "foreground",
    task_type: "local_bash",
    description: "Sleep",
    session_id: h.id,
  } as SDKMessage);
  await submission;
  await flushSdkMessages();
  expect(h.backgroundTasks).toHaveBeenCalledTimes(2);
  expect(h.backgroundTasks).toHaveBeenLastCalledWith("foreground");
  expect(h.interrupt).not.toHaveBeenCalled();
  expect(delivered).toHaveBeenCalledWith(
    expect.objectContaining({ value: expect.objectContaining({ priority: "now" }) }),
  );
});

it("Stop releases a steer waiting for foreground task registration", async () => {
  const h = await createSession();
  h.output.write({
    ...assistantMessage(h.id, "foreground"),
    message: {
      id: "foreground",
      role: "assistant",
      content: [
        { type: "tool_use", id: "foreground", name: "Bash", input: { command: "sleep 20" } },
      ],
    },
  } as SDKMessage);
  await flushSdkMessages();
  h.backgroundTasks.mockResolvedValue(false);
  const submission = h.session.steerTurn("must not run", config);
  await flushSdkMessages();
  await h.session.interruptTurn();
  await submission;
  await h.session.startTurn("replacement", config);
  expect((await h.inputs.next()).value?.message.content).toBe("replacement");
});
