import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { launchPrAskThread, type PrAskLaunchInput } from "./launchPrAskThread";
import { PrAskLaunchError } from "./prAskLaunchError";

const mocks = vi.hoisted(() => ({
  startThread:
    vi.fn<
      (input: { userMessageItemId?: string; prompt: string }) => Promise<{ threadId: string }>
    >(),
}));

vi.mock("@/renderer/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/bridge")>()),
  readBridge: () => ({ startThread: mocks.startThread }),
}));
vi.mock("@/renderer/state/fileCheckpointActions", () => ({
  captureFileCheckpoint: () => Promise.resolve(),
}));

const project = {
  id: "project-1",
  name: "Repo",
  location: { kind: "posix", path: "/repo" },
} as Project;

function input(overrides: Partial<PrAskLaunchInput> = {}): PrAskLaunchInput {
  return {
    project,
    selection: { agentKind: "agent-one", config: { model: "m" } },
    title: "PR #42: Improve the overlay",
    prompt: "Why was the cache removed?",
    reserve: () => {},
    ...overrides,
  } as PrAskLaunchInput;
}

function userMessageIds(threadId: string): string[] {
  return Object.values(useAppStore.getState().runtimeItemsByIdByThread[threadId] ?? {})
    .filter((item) => item.type === "user_message")
    .map((item) => item.id);
}

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ projects: [project], threads: [], runtimeItemsByIdByThread: {} });
});

describe("launchPrAskThread", () => {
  it("shows exactly one user message after a definite launch failure and a retry", async () => {
    mocks.startThread.mockRejectedValueOnce(new Error("agent failed to start"));
    mocks.startThread.mockResolvedValueOnce({ threadId: "ignored" });

    const error = await launchPrAskThread(input()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PrAskLaunchError);
    const threadId = (error as PrAskLaunchError).threadId;
    if (!threadId) throw new Error("the failed launch should keep its row");
    const [painted] = userMessageIds(threadId);
    expect(painted).toBeDefined();
    expect(userMessageIds(threadId)).toHaveLength(1);

    await launchPrAskThread(input({ existingThreadId: threadId }));

    expect(userMessageIds(threadId)).toEqual([painted]);
    expect(mocks.startThread).toHaveBeenCalledTimes(2);
    // Both attempts carry the same id, so the host's own user message dedupes against it.
    expect(mocks.startThread.mock.calls[0]![0].userMessageItemId).toBe(painted);
    expect(mocks.startThread.mock.calls[1]![0].userMessageItemId).toBe(painted);
    expect(useAppStore.getState().threads).toHaveLength(1);
  });

  it("paints the first message once on a clean launch", async () => {
    mocks.startThread.mockResolvedValue({ threadId: "ignored" });
    const threadId = await launchPrAskThread(input());
    expect(userMessageIds(threadId)).toHaveLength(1);
    expect(mocks.startThread.mock.calls[0]![0].userMessageItemId).toBe(userMessageIds(threadId)[0]);
  });
});
