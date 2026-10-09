import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JudgeExperimentPayload } from "@/shared/contracts";
import type { AgentAdapter } from "../agents/base";

const mocks = vi.hoisted(() => ({
  judgeExperiment: vi.fn<(...args: unknown[]) => Promise<never>>(),
  generateCommitMessage: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  generateTitle: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  generatePrSummary: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  extractContext: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  extractContextFromScrollback: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock("../experimentJudge", () => ({
  judgeExperiment: mocks.judgeExperiment,
}));
vi.mock("../commitMessageGenerator", () => ({
  generateCommitMessage: mocks.generateCommitMessage,
}));
vi.mock("../titleGenerator", () => ({
  generateTitle: mocks.generateTitle,
}));
vi.mock("../prSummaryGenerator", () => ({
  generatePrSummary: mocks.generatePrSummary,
}));
vi.mock("../contextExtractor", () => ({
  extractContext: mocks.extractContext,
  extractContextFromScrollback: mocks.extractContextFromScrollback,
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
          const options = args[5] as { signal: AbortSignal };
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

describe("GenerationService selection wiring", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it("forwards the payload selection into every generator unchanged", async () => {
    const adapter = { kind: "claude", label: "Claude" } as AgentAdapter;
    const service = new GenerationService({
      adapters: new Map([["claude", adapter]]),
      readTerminalScrollback: () => "",
      wslBridgeClient: undefined,
    });
    mocks.generateCommitMessage.mockResolvedValue("message");
    mocks.generateTitle.mockResolvedValue("title");
    mocks.generatePrSummary.mockResolvedValue({ title: "t", description: "d" });
    mocks.extractContext.mockResolvedValue({
      summary: "s",
      sourceProvider: "claude",
      sourceSessionId: "session",
      extractedAt: new Date().toISOString(),
    });
    mocks.judgeExperiment.mockResolvedValue({
      winnerThreadId: "thread-1",
      rationale: "r",
      assessments: [],
    } as never);

    // Empty effort / false Fast are present carriers and must survive the
    // service boundary verbatim; an omitted selection stays omitted.
    const tuple = { model: "picked", effort: "", fast: false, thinking: false };
    await service.generateCommitMessage({
      projectLocation: { kind: "windows", path: "C:\\repo" },
      agentKind: "claude",
      selection: tuple,
    });
    await service.generateTitle({
      projectLocation: { kind: "windows", path: "C:\\repo" },
      agentKind: "claude",
      prompt: "p",
      selection: tuple,
    });
    await service.generatePrSummary({
      projectLocation: { kind: "windows", path: "C:\\repo" },
      agentKind: "claude",
      branch: "feature",
      baseBranch: "main",
      selection: tuple,
    });
    await service.extractContext({
      threadId: "thread-1",
      agentKind: "claude",
      sessionRef: { providerSessionId: "session", discoveredAt: new Date().toISOString() },
      projectLocation: { kind: "windows", path: "C:\\repo" },
      selection: tuple,
    });
    await service.judgeExperiment({ ...payload, selection: tuple });
    // Omitted selection: generators receive exactly undefined, not {}.
    await service.generateCommitMessage({
      projectLocation: { kind: "windows", path: "C:\\repo" },
      agentKind: "claude",
    });

    expect(mocks.generateCommitMessage.mock.calls[0]?.[2]).toBe(tuple);
    expect(mocks.generateTitle.mock.calls[0]?.[3]).toBe(tuple);
    expect(mocks.generatePrSummary.mock.calls[0]?.[4]).toBe(tuple);
    expect(mocks.extractContext.mock.calls[0]?.[4]).toBe(tuple);
    expect(mocks.judgeExperiment.mock.calls[0]?.[4]).toBe(tuple);
    expect(mocks.generateCommitMessage.mock.calls[1]?.[2]).toBeUndefined();
  });
});
