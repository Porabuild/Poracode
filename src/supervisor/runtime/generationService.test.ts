import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JudgeExperimentPayload } from "@/shared/contracts";
import type { AgentAdapter } from "../agents/base";

const mocks = vi.hoisted(() => ({
  judgeExperiment: vi.fn<(...args: unknown[]) => Promise<never>>(),
}));

vi.mock("../experimentJudge", () => ({
  judgeExperiment: mocks.judgeExperiment,
}));

import { GenerationService } from "./generationService";

const payload: JudgeExperimentPayload = {
  experimentId: "experiment-1",
  projectLocation: { kind: "windows", path: "C:\\repo" },
  agentKind: "claude",
  prompt: "Choose the best solution",
  candidates: [
    { threadId: "thread-1", diff: "first" },
    { threadId: "thread-2", diff: "second" },
  ],
};

describe("GenerationService experiment judge cancellation", () => {
  beforeEach(() => {
    mocks.judgeExperiment.mockReset();
  });

  it("keeps the replacement run cancellable after the superseded run settles", async () => {
    const signals: AbortSignal[] = [];
    mocks.judgeExperiment.mockImplementation(
      async (...args: unknown[]) =>
        new Promise<never>((_resolve, reject) => {
          const options = args[7] as { signal: AbortSignal };
          signals.push(options.signal);
          options.signal.addEventListener(
            "abort",
            () => reject(new DOMException("The operation was aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const adapter = { kind: "claude", label: "Claude" } as AgentAdapter;
    const service = new GenerationService({
      adapters: new Map([["claude", adapter]]),
      readTerminalScrollback: () => "",
      wslBridgeClient: undefined,
    });

    const first = service.judgeExperiment(payload).catch((error: unknown) => error);
    await vi.waitFor(() => expect(signals).toHaveLength(1));
    const second = service.judgeExperiment(payload).catch((error: unknown) => error);
    await vi.waitFor(() => expect(signals).toHaveLength(2));

    await expect(first).resolves.toMatchObject({ name: "AbortError" });
    service.cancelJudgeExperiment(payload.experimentId);
    await expect(second).resolves.toMatchObject({ name: "AbortError" });
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
