import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import type { AcquiredOpenCodeServer } from "./sdkClient";

const acquireOpenCodeServer = vi.hoisted(() =>
  vi.fn<(input: { projectLocation: ProjectLocation }) => Promise<AcquiredOpenCodeServer>>(),
);

vi.mock("./sdkClient", () => ({ acquireOpenCodeServer }));

import { probeOpenCodeInventoryViaSdk } from "./sdkProbe";

const location: ProjectLocation = { kind: "posix", path: "/repo" };

function pendingAcquisition(): {
  acquired: AcquiredOpenCodeServer;
  dispose: ReturnType<typeof vi.fn<AcquiredOpenCodeServer["dispose"]>>;
  providerList: ReturnType<typeof vi.fn<() => Promise<never>>>;
} {
  const providerList = vi.fn<() => Promise<never>>(() => new Promise(() => undefined));
  const dispose = vi.fn<AcquiredOpenCodeServer["dispose"]>().mockResolvedValue(undefined);
  const acquired = {
    client: {
      provider: { list: providerList },
      app: { agents: vi.fn<() => Promise<never>>(() => new Promise(() => undefined)) },
    },
    dispose,
  } as unknown as AcquiredOpenCodeServer;
  return { acquired, dispose, providerList };
}

describe("probeOpenCodeInventoryViaSdk cancellation", () => {
  beforeEach(() => {
    acquireOpenCodeServer.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("settles and releases the probe lease when the caller aborts", async () => {
    const { acquired, dispose, providerList } = pendingAcquisition();
    acquireOpenCodeServer.mockResolvedValue(acquired);
    const abort = new AbortController();

    const probe = probeOpenCodeInventoryViaSdk(location, abort.signal);
    await vi.waitFor(() => expect(providerList).toHaveBeenCalledOnce());
    abort.abort(new Error("detection cancelled"));

    await expect(probe).rejects.toThrow("detection cancelled");
    expect(dispose).toHaveBeenCalledExactlyOnceWith({ closeServerIfIdle: true });
  });

  it("settles and releases the probe lease when inventory times out", async () => {
    vi.useFakeTimers();
    const { acquired, dispose } = pendingAcquisition();
    acquireOpenCodeServer.mockResolvedValue(acquired);

    const probe = probeOpenCodeInventoryViaSdk(location);
    await Promise.resolve();
    await Promise.resolve();
    const rejection = probe.then(
      () => undefined,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(rejection).resolves.toEqual(
      expect.objectContaining({ message: "OpenCode inventory probe timed out" }),
    );
    expect(dispose).toHaveBeenCalledExactlyOnceWith({ closeServerIfIdle: true });
  });
});
