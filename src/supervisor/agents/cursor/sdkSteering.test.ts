import { expect, it, vi } from "vitest";
import { CursorSdkSteering, type CursorSdkSteerInput } from "./sdkSteering";
import type { CursorSdkUserMessage } from "./sdkPrompt";
import type { CursorSdkWorkerSteerResult } from "./sdkWorkerProtocol";

it("ignores a cancelled preparation failure after fresh input has been accepted", async () => {
  const acknowledgement = Promise.withResolvers<CursorSdkWorkerSteerResult>();
  const image = Promise.withResolvers<string>();
  const oldImageAccepted = vi.fn<() => void>();
  const steer = vi
    .fn<(text: string) => Promise<CursorSdkWorkerSteerResult>>()
    .mockResolvedValue("complete_delivered")
    .mockReturnValueOnce(acknowledgement.promise);
  const buildMessage = vi.fn<
    (input: CursorSdkSteerInput) => Promise<string | CursorSdkUserMessage>
  >(async ({ prompt }) => (prompt === "old image" ? image.promise : prompt));
  const paintMessage = vi.fn<(input: CursorSdkSteerInput) => void>();
  const start = vi.fn<
    (input: CursorSdkSteerInput, message: string | CursorSdkUserMessage) => Promise<void>
  >(async () => {});
  const steering = new CursorSdkSteering({
    activeRun: () => ({
      ready: Promise.resolve(),
      completion: Promise.resolve(),
      canSteer: () => true,
      isCancelled: () => false,
      steer,
    }),
    buildMessage,
    paintMessage,
    start,
    drained: () => {},
  });
  const enqueue = (prompt: string, onPromptSubmitted?: () => void) =>
    steering.enqueue({
      prompt,
      config: { model: "test-model" },
      options: { userMessageItemId: prompt, ...(onPromptSubmitted ? { onPromptSubmitted } : {}) },
    });
  const first = enqueue("first");
  const queued = enqueue("old image", oldImageAccepted);
  try {
    await vi.waitFor(() => expect(steer).toHaveBeenCalledOnce());
    expect(buildMessage).toHaveBeenCalledTimes(2);
    steering.cancel();
    await enqueue("fresh input");
    image.reject(new Error("old image read failed after Stop"));
    await expect(queued).resolves.toBeUndefined();
    await first;
    expect(oldImageAccepted).not.toHaveBeenCalled();
    expect(paintMessage.mock.calls.map(([input]) => input.prompt)).toEqual([
      "first",
      "fresh input",
    ]);
    expect(steer.mock.calls).toEqual([["first"], ["fresh input"]]);
    expect(start).not.toHaveBeenCalled();
  } finally {
    steering.cancel();
    image.resolve("cancelled image");
    acknowledgement.resolve("complete_delivered");
    await Promise.allSettled([first, queued]);
  }
});
