import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { RemoteRuntimeGapDescriptor, RemoteRuntimeHistoryNotice } from "@/shared/remote";
import { RemoteClientError } from "@/shared/remote/client";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { remoteThreadId } from "@/renderer/state/remoteProjection";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import {
  __resetRuntimeHistoryNoticeCapabilityForTest,
  hostSupportsRuntimeHistoryNotices,
  noteRuntimeHistoryNoticesCapability,
  withRuntimeHistoryNoticesDeclaration,
} from "./historyNoticeCapability";
import {
  __resetThreadHistoryNoticeStoreForTest,
  clearThreadHistoryNoticesForAuthority,
  readThreadHistoryNotice,
  recordThreadHistoryGapRead,
  recordThreadHistoryNoticeRead,
} from "./historyNoticeStore";
import { acknowledgeThreadHistoryNotice, requestThreadHistoryGap } from "./historyNoticeActions";

const CONNECTION = "connection-1";
const REMOTE_ID = "rt-1";
const VIEW_ID = remoteThreadId(CONNECTION, REMOTE_ID);

function notice(overrides: Partial<RemoteRuntimeHistoryNotice> = {}): RemoteRuntimeHistoryNotice {
  return {
    kind: "history-incomplete",
    source: "exact",
    reason: "thread-events",
    refusedEvents: 7,
    refusedBytes: 1024,
    acknowledgedCount: 1,
    firstAcknowledgedAt: 1,
    lastAcknowledgedAt: 2,
    ...overrides,
  };
}

function gap(overrides: Partial<RemoteRuntimeGapDescriptor> = {}): RemoteRuntimeGapDescriptor {
  return {
    token: "gap2:e11111111-1111-1111-1111-111111111111",
    source: "exact",
    reason: "thread-events",
    refusedEvents: 7,
    refusedBytes: 1024,
    createdAt: 3,
    ...overrides,
  };
}

function serverRecord(): RemoteServerRecord {
  return {
    connectionId: CONNECTION,
    desktopId: "desktop-1",
    label: "Host",
    endpoint: "http://127.0.0.1:39001/",
    accessToken: "token",
    scopes: [],
  };
}

interface GapReadResult {
  readonly gap: RemoteRuntimeGapDescriptor | null;
  readonly notice: RemoteRuntimeHistoryNotice | null;
}
type GapReadFn = (threadId: string) => Promise<GapReadResult>;
type AckFn = (
  threadId: string,
  input: { readonly episodeToken: string; readonly commandId: string },
) => Promise<unknown>;
type VoidFn = () => void;

interface ClientStub {
  readonly runtimeHistoryGap: Mock<GapReadFn>;
  readonly acknowledgeRuntimeHistoryGap: Mock<AckFn>;
  readonly setTokenLifecycle: Mock<VoidFn>;
  readonly setCertFingerprintPin: Mock<VoidFn>;
}

function installClient(stub: Partial<ClientStub> = {}): ClientStub {
  const client: ClientStub = {
    runtimeHistoryGap:
      stub.runtimeHistoryGap ?? vi.fn<GapReadFn>(async () => ({ gap: null, notice: null })),
    acknowledgeRuntimeHistoryGap:
      stub.acknowledgeRuntimeHistoryGap ??
      vi.fn<AckFn>(async () => ({ outcome: "already", notice: notice() })),
    setTokenLifecycle: stub.setTokenLifecycle ?? vi.fn<VoidFn>(),
    setCertFingerprintPin: stub.setCertFingerprintPin ?? vi.fn<VoidFn>(),
  };
  useRemoteServersStore.setState({
    servers: [serverRecord()],
    clientFactory: () => client as never,
    openRemoteThread: vi.fn<() => Promise<boolean>>(async () => true) as never,
  });
  return client;
}

function installThread(): void {
  useAppStore.setState({
    threads: [
      {
        id: VIEW_ID,
        remoteServerId: CONNECTION,
        remoteId: REMOTE_ID,
        projectId: remoteThreadId(CONNECTION, "project-1"),
        title: "Remote",
        agentKind: "claude",
        config: { model: "sonnet" },
        status: "idle",
        attention: "none",
        canResumeWithConfig: false,
        archived: false,
        done: false,
        starred: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  });
}

beforeEach(() => {
  __resetThreadHistoryNoticeStoreForTest();
  __resetRuntimeHistoryNoticeCapabilityForTest();
  installThread();
  installClient();
});

describe("history notice store", () => {
  it("retains a durable notice when a later read omits the field", () => {
    recordThreadHistoryNoticeRead(VIEW_ID, CONNECTION, notice());
    recordThreadHistoryNoticeRead(VIEW_ID, CONNECTION, undefined);
    expect(readThreadHistoryNotice(VIEW_ID)?.notice?.refusedEvents).toBe(7);
  });

  it("clears on authority replacement instead of showing another server's notice", () => {
    recordThreadHistoryNoticeRead(VIEW_ID, CONNECTION, notice());
    recordThreadHistoryNoticeRead(VIEW_ID, "connection-2", undefined);
    expect(readThreadHistoryNotice(VIEW_ID)?.authority).toBe("connection-2");
    expect(readThreadHistoryNotice(VIEW_ID)?.notice).toBeNull();
  });

  it("records a gap descriptor and clears the review flag", () => {
    recordThreadHistoryGapRead(VIEW_ID, CONNECTION, gap());
    const entry = readThreadHistoryNotice(VIEW_ID);
    expect(entry?.gap?.token).toBe(gap().token);
    expect(entry?.needsReview).toBe(false);
  });

  it("evicts every notice entry authored by a removed authority", () => {
    recordThreadHistoryNoticeRead(VIEW_ID, CONNECTION, notice());
    recordThreadHistoryNoticeRead("other-view", "connection-2", notice());
    clearThreadHistoryNoticesForAuthority(CONNECTION);
    expect(readThreadHistoryNotice(VIEW_ID)).toBeUndefined();
    expect(readThreadHistoryNotice("other-view")?.notice).not.toBeNull();
  });
});

describe("history notice capability and declarations", () => {
  it("gates recovery on the negotiated capability, never optimism", () => {
    const server = serverRecord();
    expect(hostSupportsRuntimeHistoryNotices(server)).toBe(false);
    noteRuntimeHistoryNoticesCapability(CONNECTION, true);
    expect(hostSupportsRuntimeHistoryNotices(server)).toBe(true);
    noteRuntimeHistoryNoticesCapability(CONNECTION, false);
    expect(hostSupportsRuntimeHistoryNotices(server)).toBe(false);
  });

  it("adds the notices=v1 declaration to a WS upgrade URL", () => {
    expect(withRuntimeHistoryNoticesDeclaration("wss://host/ws?ticket=t")).toBe(
      "wss://host/ws?ticket=t&notices=v1",
    );
  });
});

describe("history notice recovery", () => {
  it("reads the current gap and acknowledges it with an explicit command id", async () => {
    noteRuntimeHistoryNoticesCapability(CONNECTION, true);
    const applied = notice({ acknowledgedCount: 1 });
    const client = installClient({
      runtimeHistoryGap: vi.fn<GapReadFn>(async () => ({ gap: gap(), notice: null })),
      acknowledgeRuntimeHistoryGap: vi.fn<AckFn>(async () => ({
        outcome: "applied",
        notice: applied,
        descriptor: gap(),
        supersededAcceptedEvents: 0,
      })),
    });

    expect(await requestThreadHistoryGap(VIEW_ID)).toBe("ok");
    expect(readThreadHistoryNotice(VIEW_ID)?.gap?.token).toBe(gap().token);

    expect(await acknowledgeThreadHistoryNotice(VIEW_ID)).toBe("applied");
    expect(client.acknowledgeRuntimeHistoryGap).toHaveBeenCalledTimes(1);
    const [threadId, input] = client.acknowledgeRuntimeHistoryGap.mock.calls[0]!;
    expect(threadId).toBe(REMOTE_ID);
    expect(input.episodeToken).toBe(gap().token);
    expect(typeof input.commandId).toBe("string");
    const entry = readThreadHistoryNotice(VIEW_ID);
    expect(entry?.gap).toBeNull();
    expect(entry?.notice).toEqual(applied);
    // The acknowledged prefix is re-read once; no mutation is resent.
    expect(useRemoteServersStore.getState().openRemoteThread).toHaveBeenCalledTimes(1);
  });

  it("updates the descriptor on a stale outcome and never auto-acknowledges the replacement", async () => {
    noteRuntimeHistoryNoticesCapability(CONNECTION, true);
    const replacement = gap({
      token: "gap2:e22222222-2222-2222-2222-222222222222",
      refusedEvents: 9,
    });
    const client = installClient({
      runtimeHistoryGap: vi.fn<GapReadFn>(async () => ({ gap: gap(), notice: null })),
      acknowledgeRuntimeHistoryGap: vi.fn<AckFn>(async () => ({
        outcome: "stale",
        current: replacement,
      })),
    });

    expect(await acknowledgeThreadHistoryNotice(VIEW_ID)).toBe("stale");
    expect(client.acknowledgeRuntimeHistoryGap).toHaveBeenCalledTimes(1);
    expect(readThreadHistoryNotice(VIEW_ID)?.gap?.token).toBe(replacement.token);
  });

  it("treats already as zero-effect", async () => {
    noteRuntimeHistoryNoticesCapability(CONNECTION, true);
    const stored = notice({ acknowledgedCount: 2 });
    installClient({
      runtimeHistoryGap: vi.fn<GapReadFn>(async () => ({ gap: null, notice: stored })),
      acknowledgeRuntimeHistoryGap: vi.fn<AckFn>(async () => ({
        outcome: "already",
        notice: stored,
      })),
    });
    expect(await acknowledgeThreadHistoryNotice(VIEW_ID)).toBe("already");
    expect(readThreadHistoryNotice(VIEW_ID)?.notice).toEqual(stored);
  });

  it("reuses the same command id when an uncertain acknowledgement is retried", async () => {
    noteRuntimeHistoryNoticesCapability(CONNECTION, true);
    const uncertain = new RemoteClientError("outcome uncertain", 0, "command_outcome_uncertain", {
      requestMayHaveCommitted: true,
    });
    const acknowledge = vi
      .fn<AckFn>()
      .mockRejectedValueOnce(uncertain)
      .mockResolvedValueOnce({ outcome: "already", notice: notice() });
    const client = installClient({
      runtimeHistoryGap: vi.fn<GapReadFn>(async () => ({ gap: gap(), notice: null })),
      acknowledgeRuntimeHistoryGap: acknowledge,
    });

    expect(await acknowledgeThreadHistoryNotice(VIEW_ID)).toBe("uncertain");
    expect(await acknowledgeThreadHistoryNotice(VIEW_ID)).toBe("already");
    const first = acknowledge.mock.calls[0]![1] as { commandId: string };
    const second = acknowledge.mock.calls[1]![1] as { commandId: string };
    expect(second.commandId).toBe(first.commandId);
    expect(client.runtimeHistoryGap).toHaveBeenCalledTimes(2);
  });

  it("refuses recovery on a host that does not advertise the capability", async () => {
    const client = installClient({
      runtimeHistoryGap: vi.fn<GapReadFn>(async () => ({ gap: gap(), notice: null })),
    });
    expect(await acknowledgeThreadHistoryNotice(VIEW_ID)).toBe("failed");
    expect(client.runtimeHistoryGap).not.toHaveBeenCalled();
    expect(client.acknowledgeRuntimeHistoryGap).not.toHaveBeenCalled();
  });

  it("returns unsupported for a gap read when the capability is absent, never asking the host", async () => {
    const client = installClient();
    expect(await requestThreadHistoryGap(VIEW_ID)).toBe("unsupported");
    expect(client.runtimeHistoryGap).not.toHaveBeenCalled();
  });

  it("ignores a plain provider error (no fabricated notice)", async () => {
    noteRuntimeHistoryNoticesCapability(CONNECTION, true);
    const client = installClient({
      runtimeHistoryGap: vi.fn<GapReadFn>(async () => {
        throw new RemoteClientError("provider exploded", 500, "internal_error");
      }),
    });
    expect(await requestThreadHistoryGap(VIEW_ID)).toBe("failed");
    expect(readThreadHistoryNotice(VIEW_ID)).toBeUndefined();
    expect(client.acknowledgeRuntimeHistoryGap).not.toHaveBeenCalled();
  });
});
