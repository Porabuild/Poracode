import { beforeEach, expect, it, vi } from "vitest";
import {
  retainRuntimeThreadReader,
  adoptRuntimeThreadReader,
  prepareRuntimeThreadReader,
  installRuntimeHistoryRecovery,
  retryThreadRuntimeItems,
} from "./runtimeInterestHydration";

const mocks = vi.hoisted(() => ({
  hydrationStatus: {} as Record<string, "pending" | "failed">,
  hydrated: vi.fn<(threadId: string) => boolean>(() => false),
  hydrate: vi.fn<(threadId: string) => Promise<void>>(async () => {}),
  retain: vi.fn<(threadId: string) => void>(),
  release: vi.fn<(threadId: string) => void>(),
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
vi.mock("./appStore", () => ({
  useAppStore: { getState: () => ({ runtimeHydrationStatus: mocks.hydrationStatus }) },
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.hydrated.mockReturnValue(false);
  mocks.hydrationStatus = {};
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
