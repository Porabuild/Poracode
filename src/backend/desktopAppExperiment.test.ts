import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDatabase, initDatabase } from "@/host/db/connection";
import { nativeBindingEnv } from "@/host/db/runtimeItems.testFixtures";
import type { BackendNativeRequest } from "@/shared/backendHostProtocol";
import { appExperimentWorkflowSchema } from "@/shared/contracts/appExperiment";
import { runDesktopAppExperiment } from "./desktopAppExperiment";

const plan = appExperimentWorkflowSchema.parse({
  action: "launch",
  operationKey: "experiment-request-1",
  projectId: "fixture",
  prompt: "Compare approaches",
  baseBranch: "main",
  candidates: [
    { agentKind: "claude", config: { model: "sonnet" }, presentationMode: "gui" },
    { agentKind: "codex", config: { model: "example" }, presentationMode: "terminal" },
  ],
});
const state = () => ({ revision: "current", experiments: {} });
type Request = (request: BackendNativeRequest) => Promise<unknown>;

beforeEach(() => {
  if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
  initDatabase(":memory:");
});

afterEach(() => {
  closeDatabase();
  delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
});

describe("desktop experiment workflow receipts", () => {
  it("reserves one identity, permits retry before admission, and replays the admitted result", async () => {
    const requestNative = vi
      .fn<Request>()
      .mockResolvedValueOnce({ type: "not-started", message: "Open the main window." })
      .mockImplementation(async ({ operation, payload }) => {
        if (operation !== "experiment-workflow") throw new Error("Unexpected request");
        return { ok: true, experimentId: payload.experimentId };
      });
    const run = () => runDesktopAppExperiment(plan, undefined, state, requestNative);
    await expect(run()).rejects.toThrow("Open the main window.");
    const response = await run();
    expect(response).toMatchObject({
      ok: true,
      experimentId: expect.stringMatching(/^[a-f\d]{32}$/u),
    });
    expect(requestNative.mock.calls[0]).toEqual(requestNative.mock.calls[1]);
    await expect(run()).resolves.toEqual(response);
    expect(requestNative).toHaveBeenCalledTimes(2);
  });

  it("blocks a second native launch when the original outcome is uncertain", async () => {
    const requestNative = vi.fn<Request>().mockRejectedValue(new Error("Desktop disconnected."));
    const run = () => runDesktopAppExperiment(plan, undefined, state, requestNative);
    await expect(run()).rejects.toThrow(/Inspect experiment [a-f\d]{32}/u);
    await expect(run()).rejects.toThrow(/uncertain/u);
    expect(requestNative).toHaveBeenCalledOnce();
  });
});
