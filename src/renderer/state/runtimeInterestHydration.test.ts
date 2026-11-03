import { beforeEach, expect, it, vi } from "vitest";
import {
  retainRuntimeThreadReader,
  adoptRuntimeThreadReader,
  prepareRuntimeThreadReader,
  installRuntimeHistoryRecovery,
  retryThreadRuntimeItems,
} from "./runtimeInterestHydration";
import { trackPendingRemoteThreadOpen } from "./remoteServers/pendingRemoteThreadOpens";

const mocks = vi.hoisted(() => ({
  hydrationStatus: {} as Record<string, "pending" | "failed">,
  threads: [] as { id: string; remoteServerId: string; remoteId: string }[],
  setHydrationStatus: vi.fn<(threadId: string, status: string) => void>(),
  openRemoteThread: vi.fn<() => Promise<boolean>>(async () => true),
  hydrated: vi.fn<(threadId: string) => boolean>(() => false),
  hydrate: vi.fn<(threadId: string) => Promise<void>>(async () => {}),
  retain: vi.fn<(threadId: string) => void>(),
  release: vi.fn<(threadId: string) => void>(),
  recoverRemote: vi.fn<(threadId: string) => void>(),
  retainInterest:
    vi.fn<
      (
        type: string,
        id: string,
      ) => { continuous: boolean; ready: Promise<void>; release: () => void }
    >(),
}));
vi.mock("./chatRuntimePersister", () => ({
  hasHydratedThreadRuntimeItems: mocks.hydrated,
  hydrateThreadRuntimeItems: mocks.hydrate,
  retainThreadRuntimeItems: mocks.retain,
  releaseThreadRuntimeItems: mocks.release,
}));
vi.mock("./rendererEventInterests", () => ({ retainRendererEventInterest: mocks.retainInterest }));
vi.mock("./remote/sync", () => ({ recoverRemoteRuntimeHistory: mocks.recoverRemote }));
vi.mock("./remoteServersStore", () => ({
  useRemoteServersStore: { getState: () => ({ openRemoteThread: mocks.openRemoteThread }) },
}));
vi.mock("./appStore", () => ({
  useAppStore: {
    getState: () => ({
      threads: mocks.threads,
      runtimeHydrationStatus: mocks.hydrationStatus,
      setRuntimeHydrationStatus: mocks.setHydrationStatus,
    }),
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.hydrated.mockReturnValue(false);
  mocks.hydrationStatus = {};
  mocks.threads = [];
  mocks.openRemoteThread.mockResolvedValue(true);
});

it.each([false, true])(
  "reopens failed history through its recovery owner with continuous coverage %s",
  async (continuous) => {
    mocks.hydrationStatus["thread-1"] = "failed";
    mocks.retainInterest.mockReturnValue({
      continuous,
      release: vi.fn<() => void>(),
      ready: Promise.resolve(),
    });
    const recover = vi.fn<(threadId: string) => void>();
    const uninstall = installRuntimeHistoryRecovery(recover);
    const reader = retainRuntimeThreadReader("thread-1");
    try {
      await reader.ready;
      expect(recover).toHaveBeenCalledExactlyOnceWith("thread-1");
      expect(mocks.hydrate).not.toHaveBeenCalled();
    } finally {
      reader.release();
      uninstall();
    }
  },
);

it("retries failed history through the reducer that owns queued deltas", () => {
  const recover = vi.fn<(threadId: string) => void>();
  const uninstall = installRuntimeHistoryRecovery(recover);
  try {
    void retryThreadRuntimeItems("thread-1");
    expect(recover).toHaveBeenCalledExactlyOnceWith("thread-1");
    expect(mocks.hydrate).not.toHaveBeenCalled();
  } finally {
    uninstall();
  }
});

it("retries a paired host's thread through the remote reducer that owns its queue", () => {
  const recover = vi.fn<(threadId: string) => void>();
  const uninstall = installRuntimeHistoryRecovery(recover);
  try {
    mocks.hydrated.mockReturnValue(true);
    void retryThreadRuntimeItems("remote:host-1:thread:thread-1");
    expect(mocks.recoverRemote).toHaveBeenCalledExactlyOnceWith("remote:host-1:thread:thread-1");
    expect(recover).not.toHaveBeenCalled();
    expect(mocks.hydrate).not.toHaveBeenCalled();
  } finally {
    uninstall();
  }
});

it("fetches one cold baseline after live coverage is established", async () => {
  let ready!: () => void;
  const releaseInterest = vi.fn<() => void>();
  mocks.retainInterest.mockReturnValue({
    continuous: false,
    release: releaseInterest,
    ready: new Promise<void>((resolve) => {
      ready = resolve;
    }),
  });
  const recover = vi.fn<(threadId: string) => void>();
  const uninstall = installRuntimeHistoryRecovery(recover);
  const reader = retainRuntimeThreadReader("thread-1");
  expect(mocks.hydrate).not.toHaveBeenCalled();
  ready();
  await reader.ready;
  await Promise.resolve();
  expect(mocks.hydrate).toHaveBeenCalledExactlyOnceWith("thread-1");
  expect(recover).not.toHaveBeenCalled();
  reader.release();
  reader.release();
  expect(releaseInterest).toHaveBeenCalledOnce();
  expect(mocks.release).toHaveBeenCalledExactlyOnceWith("thread-1");
  uninstall();
});

it("transfers a prepared reader to the pane without another baseline or an inactive-cache eviction", async () => {
  mocks.retainInterest.mockReturnValue({
    continuous: false,
    release: vi.fn<() => void>(),
    ready: Promise.resolve(),
  });
  const prepared = prepareRuntimeThreadReader("thread-1");
  await prepared.ready;
  const pane = adoptRuntimeThreadReader("thread-1");
  prepared.release();
  expect(mocks.retain).toHaveBeenCalledExactlyOnceWith("thread-1");
  expect(mocks.hydrate).toHaveBeenCalledExactlyOnceWith("thread-1");
  expect(mocks.release).not.toHaveBeenCalled();
  pane.release();
  expect(mocks.release).toHaveBeenCalledExactlyOnceWith("thread-1");
});

it("keeps the prepared baseline owned while a background reader starts and settles", async () => {
  let complete = () => {};
  const pending = new Promise<void>((resolve) => {
    complete = resolve;
  });
  mocks.hydrate.mockReturnValue(pending);
  mocks.retainInterest.mockReturnValue({
    continuous: false,
    release: vi.fn<() => void>(),
    ready: Promise.resolve(),
  });
  const prepared = prepareRuntimeThreadReader("thread-1");
  const background = retainRuntimeThreadReader("thread-1");
  await Promise.resolve();
  expect(mocks.retain).toHaveBeenCalledTimes(2);
  background.release();
  expect(mocks.release).toHaveBeenCalledTimes(1);
  complete();
  await prepared.ready;
  const readsBeforeMount = mocks.hydrate.mock.calls.length;
  const pane = adoptRuntimeThreadReader("thread-1");
  await pane.ready;
  prepared.release();
  expect(mocks.hydrate).toHaveBeenCalledTimes(readsBeforeMount);
  expect(mocks.release).toHaveBeenCalledTimes(1);
  pane.release();
  expect(mocks.release).toHaveBeenCalledTimes(2);
  mocks.hydrate.mockResolvedValue(undefined);
});

it("cancels an unadopted prepared reader while its live coverage is pending", async () => {
  let ready = () => {};
  mocks.retainInterest.mockReturnValue({
    continuous: false,
    release: vi.fn<() => void>(),
    ready: new Promise<void>((resolve) => {
      ready = resolve;
    }),
  });
  const prepared = prepareRuntimeThreadReader("thread-1");
  prepared.release();
  ready();
  await prepared.ready;
  expect(mocks.hydrate).not.toHaveBeenCalled();
  expect(mocks.release).toHaveBeenCalledExactlyOnceWith("thread-1");
});

it("does not fetch a pane that was released while its live interest was pending", async () => {
  let ready!: () => void;
  mocks.retainInterest.mockReturnValue({
    continuous: false,
    release: vi.fn<() => void>(),
    ready: new Promise<void>((resolve) => {
      ready = resolve;
    }),
  });
  const reader = retainRuntimeThreadReader("thread-1");
  reader.release();
  ready();
  await Promise.resolve();
  expect(mocks.hydrate).not.toHaveBeenCalled();
});

it("transfers a remote reader to its pane without a second host read or local interest", async () => {
  const id = "remote:host:thread:prepared";
  mocks.threads = [{ id, remoteServerId: "host", remoteId: "prepared" }];
  const adopted = vi.fn<() => void>();
  const prepared = prepareRuntimeThreadReader(id, adopted);
  await expect(prepared.ready).resolves.toBe(true);
  const pane = adoptRuntimeThreadReader(id);
  prepared.release();
  expect(adopted).toHaveBeenCalledOnce();
  expect(mocks.openRemoteThread).toHaveBeenCalledExactlyOnceWith("host", "prepared", {
    focus: false,
  });
  expect(mocks.retainInterest).not.toHaveBeenCalled();
  expect(mocks.hydrate).not.toHaveBeenCalled();
  expect(mocks.release).not.toHaveBeenCalled();
  pane.release();
  pane.release();
  expect(mocks.release).toHaveBeenCalledExactlyOnceWith(id);
});

it("shares the remote attach already in flight while preparing its reader", async () => {
  const id = "remote:host:thread:pending";
  mocks.threads = [{ id, remoteServerId: "host", remoteId: "pending" }];
  const history = Promise.withResolvers<boolean>();
  void trackPendingRemoteThreadOpen(id, history.promise);
  const reader = prepareRuntimeThreadReader(id);
  expect(mocks.openRemoteThread).not.toHaveBeenCalled();
  history.resolve(true);
  await expect(reader.ready).resolves.toBe(true);
  reader.release();
});

it("joins existing history ownership when a remote pane mounts without navigation", async () => {
  const id = "remote:host:thread:mounted";
  mocks.threads = [{ id, remoteServerId: "host", remoteId: "mounted" }];
  const hydration = Promise.withResolvers<void>();
  mocks.hydrate.mockReturnValueOnce(hydration.promise);
  const reader = adoptRuntimeThreadReader(id);
  expect(mocks.openRemoteThread).not.toHaveBeenCalled();
  expect(mocks.retainInterest).not.toHaveBeenCalled();
  expect(mocks.hydrate).toHaveBeenCalledExactlyOnceWith(id);
  expect(mocks.retain).toHaveBeenCalledExactlyOnceWith(id);
  hydration.resolve();
  await reader.ready;
  expect(mocks.setHydrationStatus).not.toHaveBeenCalled();
  reader.release();
  expect(mocks.release).toHaveBeenCalledExactlyOnceWith(id);
});

it("reports a failed remote baseline without treating cached history as missing", async () => {
  const id = "remote:host:thread:failed";
  mocks.threads = [{ id, remoteServerId: "host", remoteId: "failed" }];
  mocks.openRemoteThread.mockResolvedValue(false);
  const reader = prepareRuntimeThreadReader(id);
  await expect(reader.ready).resolves.toBe(false);
  expect(mocks.setHydrationStatus).toHaveBeenLastCalledWith(id, "failed");
  reader.release();

  mocks.setHydrationStatus.mockClear();
  mocks.hydrated.mockReturnValue(true);
  const cached = prepareRuntimeThreadReader(id);
  await expect(cached.ready).resolves.toBe(false);
  expect(mocks.setHydrationStatus).not.toHaveBeenCalled();
  cached.release();
});
