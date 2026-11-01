import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteImageRefValue } from "@/shared/remote";
import { RemoteEnvironmentImageCache } from "@/shared/remote/clientEnvironmentImages";
import { createCacheImageReadiness } from "@/renderer/state/cacheImageReadiness";
import type { RemoteImageReadiness } from "./environmentSessions";
import { useRemoteImagePathUrl, useRemoteImageRefUrl } from "./useRemoteImageReadiness";

const RETRY_WINDOW_MS = 1_000;
const REF: RemoteImageRefValue = {
  threadId: "thread-1",
  itemId: "item-1",
  path: ["images", 0],
  mime: "image/png",
  bytes: 64 * 1024,
};
const PATH = "C:\\shots\\after.png";

function flakyCache() {
  let calls = 0;
  const fetchBytes = vi.fn<() => Promise<{ bytes: Uint8Array; contentType: string }>>(async () => {
    calls += 1;
    if (calls === 1) throw new Error("transient");
    return { bytes: new Uint8Array([1, 2, 3]), contentType: "image/png" };
  });
  const cache = new RemoteEnvironmentImageCache({
    fetchBytes,
    createObjectUrl: () => `blob:image-${calls}`,
    revokeObjectUrl: () => undefined,
    retryWindowMs: RETRY_WINDOW_MS,
  });
  return { cache, fetchBytes, readiness: createCacheImageReadiness(cache) };
}

function RefProbe({ readiness }: { readiness: RemoteImageReadiness }) {
  return <span data-testid="url">{useRemoteImageRefUrl(REF, readiness)}</span>;
}

function PathProbe({ readiness }: { readiness: RemoteImageReadiness }) {
  return <span data-testid="url">{useRemoteImagePathUrl(PATH, readiness)}</span>;
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("remote image readiness hooks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["reference", RefProbe],
    ["path", PathProbe],
  ] as const)(
    "retries a failed %s image when its retry window lapses without another render",
    async (_kind, Probe) => {
      const { cache, fetchBytes, readiness } = flakyCache();
      const view = render(<Probe readiness={readiness} />);
      await flush();
      expect(fetchBytes).toHaveBeenCalledTimes(1);
      expect(view.getByTestId("url").textContent).toBe("");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(RETRY_WINDOW_MS);
      });
      await flush();

      expect(fetchBytes).toHaveBeenCalledTimes(2);
      expect(view.getByTestId("url").textContent).toBe("blob:image-2");
      view.unmount();
      cache.dispose();
    },
  );
});
