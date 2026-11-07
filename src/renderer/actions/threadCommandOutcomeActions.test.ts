import { beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteClientError } from "@/shared/remote/client";
import type { Thread } from "@/shared/contracts";

const mocks = vi.hoisted(() => ({
  appState: {
    threads: [] as Array<{ id: string }>,
    reconcileRuntimeSnapshots:
      vi.fn<(snapshots: unknown[], requested?: ReadonlySet<string>) => void>(),
  },
  reconcileHostThreadLaunch:
    vi.fn<(host: unknown, threadId: string) => Promise<"present" | "absent" | "unknown">>(),
  bridge: {
    getThreadSnapshots: vi.fn<() => Promise<unknown[]>>(),
  },
}));

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: { getState: () => mocks.appState },
}));
// A projected row has a host handle; a row no host owns does not.
vi.mock("@/renderer/state/entityHost", () => ({
  entityHost: (row: { remoteServerId?: string } | undefined) =>
    row?.remoteServerId ? { kind: "paired", hostId: "remote-thread" } : undefined,
}));
vi.mock("@/renderer/state/hostThreadLaunch", () => ({
  reconcileHostThreadLaunch: mocks.reconcileHostThreadLaunch,
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => mocks.bridge,
}));
vi.mock("@/renderer/i18n/i18n", () => ({
  i18n: { _: (value: unknown) => String(value) },
}));

import {
  isRemoteCommandOutcomeUncertainError,
  reconcileThreadCommandOutcome,
  REMOTE_COMMAND_RECONCILE_READ_TIMEOUT_MS,
} from "./threadCommandOutcomeActions";

function createThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Thread",
    agentKind: "codex",
    config: { model: "codex/model" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as Thread;
}

describe("isRemoteCommandOutcomeUncertainError", () => {
  it("classifies the host's explicit uncertain 409 as may-have-committed", () => {
    expect(
      isRemoteCommandOutcomeUncertainError(
        new RemoteClientError("uncertain", 409, "command_outcome_uncertain"),
      ),
    ).toBe(true);
  });

  it("keeps other 409 rejections definite", () => {
    for (const code of ["command_id_conflict", "command_in_progress", "command_failed"]) {
      expect(isRemoteCommandOutcomeUncertainError(new RemoteClientError("no", 409, code))).toBe(
        false,
      );
    }
  });

  it("keeps a dispatched timeout/network mutation failure ambiguous", () => {
    expect(
      isRemoteCommandOutcomeUncertainError(
        new RemoteClientError("timed out", 0, "timeout", {
          requestPhase: "dispatched",
          requestMayHaveCommitted: true,
        }),
      ),
    ).toBe(true);
  });

  it("keeps an HTTP 5xx mutation failure ambiguous", () => {
    expect(
      isRemoteCommandOutcomeUncertainError(new RemoteClientError("boom", 500, "internal_error")),
    ).toBe(true);
  });

  it("keeps a presend pinned-TLS refusal definite even at 5xx", () => {
    expect(
      isRemoteCommandOutcomeUncertainError(
        new RemoteClientError("mismatch", 502, "certificate_fingerprint_mismatch", {
          requestPhase: "presend",
          requestMayHaveCommitted: false,
        }),
      ),
    ).toBe(false);
  });

  it("keeps authorization rejections and unclassified errors definite", () => {
    expect(
      isRemoteCommandOutcomeUncertainError(new RemoteClientError("expired", 401, "unauthorized")),
    ).toBe(false);
    expect(isRemoteCommandOutcomeUncertainError(new Error("boom"))).toBe(false);
    expect(isRemoteCommandOutcomeUncertainError(undefined)).toBe(false);
    expect(
      isRemoteCommandOutcomeUncertainError({ status: 409, code: "command_outcome_uncertain" }),
    ).toBe(false);
  });

  it("follows a wrapper error's preserved transport cause", () => {
    const transport = new RemoteClientError("timed out", 0, "timeout", {
      requestPhase: "dispatched",
      requestMayHaveCommitted: true,
    });
    expect(
      isRemoteCommandOutcomeUncertainError(
        new Error("Remote server unreachable.", { cause: transport }),
      ),
    ).toBe(true);
    expect(
      isRemoteCommandOutcomeUncertainError(
        new Error("Remote server unreachable.", {
          cause: new RemoteClientError("expired", 401, "unauthorized"),
        }),
      ),
    ).toBe(false);
  });
});

describe("reconcileThreadCommandOutcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appState.threads = [{ id: "thread-1" }];
    mocks.reconcileHostThreadLaunch.mockResolvedValue("present");
    mocks.bridge.getThreadSnapshots.mockResolvedValue([]);
  });

  it("reads a host-owned thread back once from its host", async () => {
    const thread = createThread({ remoteServerId: "desktop-1", remoteId: "remote-thread" });

    await expect(reconcileThreadCommandOutcome(thread)).resolves.toBe(true);

    expect(mocks.reconcileHostThreadLaunch).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ hostId: "remote-thread" }),
      thread.id,
    );
    expect(mocks.bridge.getThreadSnapshots).not.toHaveBeenCalled();
  });

  it("bounds the host read with a deadline", async () => {
    vi.useFakeTimers();
    try {
      const thread = createThread({ remoteServerId: "desktop-1", remoteId: "remote-thread" });
      mocks.reconcileHostThreadLaunch.mockReturnValue(new Promise(() => {}));

      const pending = reconcileThreadCommandOutcome(thread);
      await vi.advanceTimersByTimeAsync(REMOTE_COMMAND_RECONCILE_READ_TIMEOUT_MS);

      await expect(pending).resolves.toBe(false);
      expect(mocks.reconcileHostThreadLaunch).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports an absent or unreadable host row as not applied, without a second attempt", async () => {
    const thread = createThread({ remoteServerId: "desktop-1", remoteId: "remote-thread" });
    for (const existence of ["absent", "unknown"] as const) {
      mocks.reconcileHostThreadLaunch.mockResolvedValueOnce(existence);
      await expect(reconcileThreadCommandOutcome(thread)).resolves.toBe(false);
    }
    mocks.reconcileHostThreadLaunch.mockRejectedValueOnce(new Error("offline"));
    await expect(reconcileThreadCommandOutcome(thread)).resolves.toBe(false);
    expect(mocks.reconcileHostThreadLaunch).toHaveBeenCalledTimes(3);
  });

  it("re-reads a local thread through the supervisor snapshots for that thread only", async () => {
    const snapshot = { threadId: "thread-1", status: "working" };
    const other = { threadId: "thread-2", status: "idle" };
    mocks.bridge.getThreadSnapshots.mockResolvedValue([snapshot, other]);

    await expect(reconcileThreadCommandOutcome(createThread())).resolves.toBe(true);

    expect(mocks.bridge.getThreadSnapshots).toHaveBeenCalledTimes(1);
    expect(mocks.appState.reconcileRuntimeSnapshots).toHaveBeenCalledExactlyOnceWith(
      [snapshot],
      new Set(["thread-1"]),
      { preserveHostOwnedRootRows: false },
    );
    expect(mocks.reconcileHostThreadLaunch).not.toHaveBeenCalled();
  });

  it("reports a failed local read without throwing", async () => {
    mocks.bridge.getThreadSnapshots.mockRejectedValue(new Error("supervisor down"));

    await expect(reconcileThreadCommandOutcome(createThread())).resolves.toBe(false);

    expect(mocks.appState.reconcileRuntimeSnapshots).not.toHaveBeenCalled();
  });

  it("bounds the local supervisor read with a deadline without a second attempt", async () => {
    vi.useFakeTimers();
    try {
      mocks.bridge.getThreadSnapshots.mockImplementation(() => new Promise(() => {}));

      const pending = reconcileThreadCommandOutcome(createThread());
      await vi.advanceTimersByTimeAsync(REMOTE_COMMAND_RECONCILE_READ_TIMEOUT_MS);

      await expect(pending).resolves.toBe(false);
      expect(mocks.bridge.getThreadSnapshots).toHaveBeenCalledTimes(1);
      expect(mocks.appState.reconcileRuntimeSnapshots).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips a local read whose thread disappeared while it was in flight", async () => {
    mocks.bridge.getThreadSnapshots.mockImplementation(async () => {
      mocks.appState.threads = [];
      return [{ threadId: "thread-1", status: "working" }];
    });

    await expect(reconcileThreadCommandOutcome(createThread())).resolves.toBe(false);

    expect(mocks.appState.reconcileRuntimeSnapshots).not.toHaveBeenCalled();
  });
});
