import { afterEach, vi, type Mock } from "vitest";
import type { Query, SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { RuntimeEvent, ThreadConfig } from "@/shared/contracts";
import type { StructuredSessionUpdate } from "../base";
import { ClaudeSdkSession } from "./sdkSession";
import { createClaudeTestQuery, flushSdkMessages } from "./sdkSessionTestHarness";

export const nativeSteerConfig: ThreadConfig = {
  model: "sonnet",
  mode: "agent",
  approvalPolicy: "acceptEdits",
};
const config = nativeSteerConfig;
const sessions: ClaudeSdkSession[] = [];
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.dispose()));
  vi.restoreAllMocks();
});
export async function createNativeSteerSession(
  sdkQuery: Mock<(input: { prompt: AsyncIterable<SDKUserMessage>; options: unknown }) => Query>,
) {
  const fake = createClaudeTestQuery();
  sdkQuery.mockReturnValue(fake.runtime);
  const events: RuntimeEvent[] = [];
  const updates: StructuredSessionUpdate[] = [];
  const session = await ClaudeSdkSession.create({
    threadId: "native-steer",
    projectLocation: { kind: "posix", path: process.cwd() },
    config,
    presentationMode: "gui",
  });
  sessions.push(session);
  session.setListener({
    onRuntimeEvent: (e) => events.push(e),
    onUpdate: (u) => updates.push(u),
    onError: () => {},
    onClose: () => {},
  });
  const id = await session.openThread(config);
  const inputs = sdkQuery.mock.calls.at(-1)![0].prompt[Symbol.asyncIterator]();
  fake.output.write({
    type: "system",
    subtype: "init",
    session_id: id,
    capabilities: ["interrupt_cancel_queued_v1"],
  } as unknown as SDKMessage);
  await flushSdkMessages();
  await session.startTurn("first", config);
  await inputs.next();
  const echo = async (message: SDKUserMessage) => {
    fake.output.write({ ...message, session_id: id, isReplay: true } as SDKMessage);
    await flushSdkMessages();
  };
  return { ...fake, session, id, inputs, events, updates, echo };
}
