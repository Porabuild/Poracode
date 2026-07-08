import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatusResult, ProjectLocation } from "@/shared/contracts";
import { useGitStore } from "@/renderer/state/gitStore";
import { reconcileStagingStatus } from "./reconcileStagingStatus";

const bridgeMock = vi.hoisted(() => ({
  getGitStatus: vi.fn<() => Promise<GitStatusResult>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridgeMock,
}));

const baseStatus: GitStatusResult = {
  isRepo: true,
  branch: "main",
  tracking: "origin/main",
  hasRemote: true,
  remoteInfo: null,
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  totalInsertions: 0,
  totalDeletions: 0,
};

const projectLocation: ProjectLocation = { kind: "posix", path: "/repo" };

/** A promise whose resolution we control, to hold a fetch "in flight". */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let queued microtasks (awaits, `.then`) flush. */
function flush(): Promise<void> {
  return Promise.resolve().then(() => Promise.resolve());
}

const statusWithAhead = (ahead: number): GitStatusResult => ({ ...baseStatus, ahead });

describe("reconcileStagingStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGitStore.setState({ statuses: {}, worktreeStatuses: {} });
  });

  it("fetches once and applies the status for a single call", async () => {
    bridgeMock.getGitStatus.mockResolvedValueOnce(statusWithAhead(3));

    await reconcileStagingStatus({ projectLocation, storeKey: "p1", isWorktree: false });

    expect(bridgeMock.getGitStatus).toHaveBeenCalledTimes(1);
    expect(useGitStore.getState().statuses["p1"]?.ahead).toBe(3);
  });

  it("coalesces rapid calls into an initial plus one trailing fetch", async () => {
    const first = deferred<GitStatusResult>();
    const second = deferred<GitStatusResult>();
    bridgeMock.getGitStatus.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    // First call starts fetch #1 (kept pending); the next two only mark dirty.
    const c1 = reconcileStagingStatus({ projectLocation, storeKey: "p1", isWorktree: false });
    const c2 = reconcileStagingStatus({ projectLocation, storeKey: "p1", isWorktree: false });
    const c3 = reconcileStagingStatus({ projectLocation, storeKey: "p1", isWorktree: false });
    await flush();

    // Only the initial fetch has been issued so far.
    expect(bridgeMock.getGitStatus).toHaveBeenCalledTimes(1);

    // Resolve fetch #1 → its result applies, then exactly one trailing fetch runs.
    first.resolve(statusWithAhead(1));
    await flush();
    expect(bridgeMock.getGitStatus).toHaveBeenCalledTimes(2);

    // Resolve the trailing fetch → its result is the final applied status.
    second.resolve(statusWithAhead(2));
    await Promise.all([c1, c2, c3]);

    expect(bridgeMock.getGitStatus).toHaveBeenCalledTimes(2);
    expect(useGitStore.getState().statuses["p1"]?.ahead).toBe(2);
  });

  it("swallows fetch errors, leaves the store untouched, and recovers on a later call", async () => {
    useGitStore.getState().setStatus("p1", statusWithAhead(9));
    bridgeMock.getGitStatus.mockRejectedValueOnce(new Error("bridge down"));

    await reconcileStagingStatus({ projectLocation, storeKey: "p1", isWorktree: false });

    // Errored fetch must not overwrite the existing store entry.
    expect(useGitStore.getState().statuses["p1"]?.ahead).toBe(9);

    // In-flight state was cleared, so a subsequent call fetches and applies again.
    bridgeMock.getGitStatus.mockResolvedValueOnce(statusWithAhead(5));
    await reconcileStagingStatus({ projectLocation, storeKey: "p1", isWorktree: false });

    expect(bridgeMock.getGitStatus).toHaveBeenCalledTimes(2);
    expect(useGitStore.getState().statuses["p1"]?.ahead).toBe(5);
  });
});
