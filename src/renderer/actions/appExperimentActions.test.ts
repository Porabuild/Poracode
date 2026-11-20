import { expect, it, vi } from "vitest";
import type { AppExperimentRequest } from "@/shared/contracts/appExperiment";
import { appExperimentRequestSchema } from "@/shared/contracts/appExperiment";
import { runAppExperiment } from "./appExperimentActions";

const mocked = vi.hoisted(() => ({
  launch: vi.fn<(input: { experimentId: string }) => Promise<string | null>>(),
  judge: vi.fn<(id: string, selection?: unknown) => Promise<boolean>>(),
  refresh: vi.fn<() => Promise<{ experiments: Record<string, object>; revision: string }>>(),
}));
vi.mock("./experimentActions", () => ({ launchExperiment: mocked.launch }));
vi.mock("./experimentDecisionActions", () => ({
  crownExperiment: mocked.judge,
  createExperimentCandidatePr: vi.fn<(id: string) => Promise<boolean>>(),
  discardExperiment: vi.fn<(id: string) => Promise<boolean>>(),
  mergeExperimentWinner: vi.fn<(id: string) => Promise<boolean>>(),
  retryExperimentCleanup: vi.fn<(id: string) => Promise<boolean>>(),
}));
vi.mock("@/renderer/state/managedRootCatalog/rootExperimentAuthority", () => ({
  refreshAppExperimentSnapshot: mocked.refresh,
}));

it("launches the same composer workflow under the reserved identity after native admission", async () => {
  const request = appExperimentRequestSchema.parse({
    version: 1,
    experimentId: "mcp-fixture",
    input: {
      action: "launch",
      operationKey: "experiment-fixture",
      projectId: "fixture",
      prompt: "Compare approaches",
      baseBranch: "main",
      candidates: [
        { agentKind: "claude", config: { model: "sonnet" }, presentationMode: "gui" },
        { agentKind: "codex", config: { model: "example" }, presentationMode: "terminal" },
      ],
    },
  });
  mocked.refresh.mockResolvedValue({ experiments: {}, revision: "current" });
  mocked.launch.mockResolvedValue("mcp-fixture");
  const admitted = Promise.withResolvers<void>();
  const begin = vi.fn<() => Promise<void>>(() => admitted.promise);
  const result = runAppExperiment(request, begin);
  try {
    await vi.waitFor(() => expect(begin).toHaveBeenCalledOnce());
    expect(mocked.launch).not.toHaveBeenCalled();
  } finally {
    admitted.resolve();
  }
  await expect(result).resolves.toEqual({ ok: true, experimentId: "mcp-fixture" });
  expect(mocked.launch).toHaveBeenCalledWith(
    expect.objectContaining({
      experimentId: request.experimentId,
      prompt: "Compare approaches",
    }),
  );
});

it("uses the current revision and preserves explicit judge choices", async () => {
  mocked.refresh.mockResolvedValue({
    experiments: { comparison: {} },
    revision: "current",
  });
  mocked.judge.mockResolvedValue(true);
  const selection = {
    agentKind: "codex",
    model: "example",
    fast: false,
    mode: "responses",
  } as const;
  const request = {
    version: 1,
    experimentId: "comparison",
    input: {
      action: "judge",
      operationKey: "judge-example",
      experimentId: "comparison",
      selection,
      revision: "earlier",
    },
  } satisfies AppExperimentRequest;
  const begin = vi.fn<() => Promise<void>>(async () => undefined);
  await expect(runAppExperiment(request, begin)).rejects.toThrow(/revision/u);
  expect(begin).not.toHaveBeenCalled();
  expect(mocked.judge).not.toHaveBeenCalled();
  mocked.refresh
    .mockResolvedValueOnce({ experiments: { comparison: {} }, revision: "current" })
    .mockResolvedValueOnce({ experiments: { comparison: {} }, revision: "newer" });
  const currentRequest = { ...request, input: { ...request.input, revision: "current" } };
  await expect(runAppExperiment(currentRequest, begin)).rejects.toThrow(/during admission/u);
  expect(mocked.judge).not.toHaveBeenCalled();
  await expect(runAppExperiment(currentRequest, begin)).resolves.toEqual({
    ok: true,
    experimentId: "comparison",
  });
  expect(mocked.judge).toHaveBeenCalledExactlyOnceWith("comparison", selection);
});
