import { beforeEach, expect, it, vi } from "vitest";
import {
  retainRuntimeThreadReader,
  installRuntimeHistoryRecovery,
} from "./runtimeInterestHydration";

const mocks = vi.hoisted(() => ({
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
beforeEach(() => {
  vi.clearAllMocks();
  mocks.hydrated.mockReturnValue(false);
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
  await Promise.resolve();
  expect(mocks.hydrate).toHaveBeenCalledExactlyOnceWith("thread-1");
  expect(recover).not.toHaveBeenCalled();
  reader.release();
  reader.release();
  expect(releaseInterest).toHaveBeenCalledOnce();
  expect(mocks.release).toHaveBeenCalledExactlyOnceWith("thread-1");
  uninstall();
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
