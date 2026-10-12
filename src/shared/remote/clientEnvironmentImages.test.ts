import { describe, expect, it, vi } from "vitest";
import { ENVIRONMENT_AUTHORIZATION_HEADER } from "@/shared/environments";
import { RemoteEnvironmentClient } from "./clientEnvironments";
import {
  TEST_ENVIRONMENT_ID,
  bytesResponse,
  deferred,
  errorResponse,
  imageRef,
  scriptedFetch,
  testAuthority,
  testEnvironmentEndpoint,
  type RequestHandler,
} from "./clientEnvironments.testSupport";

const proxyPrefix = `/api/environments/${TEST_ENVIRONMENT_ID}/proxy`;

interface ImageHarness {
  readonly client: RemoteEnvironmentClient;
  readonly requests: ReturnType<typeof scriptedFetch>["requests"];
  readonly created: string[];
  readonly revoked: string[];
}

function buildImages(
  handlers: readonly RequestHandler[],
  options: {
    readonly maxImageCacheEntries?: number;
    readonly maxImageCacheBytes?: number;
    readonly maxImageFetchBytes?: number;
    readonly imageRetryWindowMs?: number;
  } = {},
): ImageHarness {
  const scripted = scriptedFetch(handlers);
  const created: string[] = [];
  const revoked: string[] = [];
  const client = new RemoteEnvironmentClient(
    testEnvironmentEndpoint(),
    "child-access",
    scripted.fetchImpl,
    {
      environmentId: TEST_ENVIRONMENT_ID,
      parentAuthority: testAuthority().authority,
      createObjectUrl: () => {
        const url = `blob:fake-${created.length + 1}`;
        created.push(url);
        return url;
      },
      revokeObjectUrl: (url) => {
        revoked.push(url);
      },
      ...options,
    },
  );
  return { client, requests: scripted.requests, created, revoked };
}

describe("RemoteEnvironmentClient authenticated image blobs (R3)", () => {
  it("authenticates every equal reference and path before sharing one resource", async () => {
    const pending = deferred<Response>();
    const payload = new Uint8Array([1, 2, 3]);
    const harness = buildImages([
      () => bytesResponse(payload, "IMAGE/PNG"),
      () => pending.promise,
      () => bytesResponse(payload),
    ]);
    const refA = imageRef({ itemId: "item-a", mime: "image/jpeg", bytes: 999_999 });
    const refB = imageRef({ itemId: "item-b", path: ["other", 1], bytes: 0 });
    const path = "/tmp/equal.png";
    try {
      harness.client.imageRefResolution(refA);
      await vi.waitFor(() => expect(harness.client.imageRefUrl(refA)).toBe("blob:fake-1"));
      expect(harness.client.imageRefResolution(refB)).toMatchObject({ url: "", pending: true });
      harness.client.localImageResolution(path);
      await vi.waitFor(() => expect(harness.client.localImageUrl(path)).toBe("blob:fake-1"));
      expect(harness.client.imageResolutionFor(harness.client.imageKeyForRef(refB))).toMatchObject({
        url: "",
        pending: true,
      });
      pending.resolve(bytesResponse(payload));
      await vi.waitFor(() => expect(harness.client.imageRefUrl(refB)).toBe("blob:fake-1"));

      expect(harness.requests).toHaveLength(3);
      expect(harness.requests.map((request) => request.url.pathname)).toEqual([
        `${proxyPrefix}/api/threads/thread-1/items/item-a/image`,
        `${proxyPrefix}/api/threads/thread-1/items/item-b/image`,
        `${proxyPrefix}/api/files/image`,
      ]);
      for (const request of harness.requests) {
        expect(request.headers.authorization).toBe("Bearer child-access");
        expect(request.headers[ENVIRONMENT_AUTHORIZATION_HEADER]).toBe("Bearer parent-access");
        expect(request.url.searchParams.get("ticket")).toBeNull();
      }
      expect(harness.created).toEqual(["blob:fake-1"]);
    } finally {
      harness.client.dispose();
    }
    expect(harness.revoked).toEqual(["blob:fake-1"]);
  });

  it.each([401, 403])(
    "never lends an available URL to a coordinate rejected with %s",
    async (status) => {
      const pending = deferred<Response>();
      const harness = buildImages([
        () => bytesResponse(new Uint8Array([1, 2, 3])),
        () => pending.promise,
      ]);
      const refA = imageRef({ itemId: "item-a" });
      // All presentation metadata agrees with A; it conveys no authority.
      const refB = imageRef({ itemId: "item-b" });
      try {
        harness.client.imageRefResolution(refA);
        await vi.waitFor(() => expect(harness.client.imageRefUrl(refA)).toBe("blob:fake-1"));
        expect(harness.client.imageRefResolution(refB)).toMatchObject({ url: "", pending: true });
        pending.resolve(errorResponse(status, "forbidden"));
        await vi.waitFor(() =>
          expect(
            harness.client.imageResolutionFor(harness.client.imageKeyForRef(refB)),
          ).toMatchObject({
            url: "",
            pending: false,
          }),
        );
        expect(harness.client.imageRefUrl(refB)).toBe("");
        expect(harness.client.imageRefUrl(refA)).toBe("blob:fake-1");
        expect(harness.requests).toHaveLength(2);
        expect(harness.requests[1]?.headers.authorization).toBe("Bearer child-access");
        expect(harness.requests[1]?.headers[ENVIRONMENT_AUTHORIZATION_HEADER]).toBe(
          "Bearer parent-access",
        );
        expect(harness.created).toEqual(["blob:fake-1"]);
      } finally {
        harness.client.dispose();
      }
    },
  );

  it("resolves pending to one keyed notification, then a cached blob URL", async () => {
    const pending = deferred<Response>();
    const harness = buildImages([() => pending.promise]);
    const ref = imageRef();
    const key = harness.client.imageKeyForRef(ref);
    const ticks: string[] = [];
    const unsubscribe = harness.client.subscribeImageKey(key, () => ticks.push("tick"));

    expect(harness.client.imageRefUrl(ref)).toBe("");
    expect(harness.client.imageRefResolution(ref)).toMatchObject({ key, url: "", pending: true });

    const request = harness.requests[0];
    expect(request?.url.pathname).toBe(`${proxyPrefix}/api/threads/thread-1/items/item-1/image`);
    expect(request?.url.searchParams.get("ticket")).toBeNull();
    expect(request?.headers.authorization).toBe("Bearer child-access");
    expect(request?.headers[ENVIRONMENT_AUTHORIZATION_HEADER]).toBe("Bearer parent-access");

    pending.resolve(bytesResponse(new Uint8Array([1, 2, 3]), "image/png"));
    await vi.waitFor(() => expect(ticks).toEqual(["tick"]));

    expect(harness.client.imageRefUrl(ref)).toBe("blob:fake-1");
    expect(harness.client.imageRefResolution(ref).pending).toBe(false);
    // A repeated resolution of unchanged state never re-notifies.
    expect(ticks).toEqual(["tick"]);
    unsubscribe();
  });

  it("uses the local image path for absolute paths and still carries both headers", async () => {
    const pending = deferred<Response>();
    const harness = buildImages([() => pending.promise]);
    const path = "/home/me/shot.png";
    const key = harness.client.imageKeyForLocalPath(path);

    expect(harness.client.localImageUrl(path)).toBe("");
    pending.resolve(bytesResponse(new Uint8Array([1])));
    await vi.waitFor(() => expect(harness.client.localImageUrl(path)).toBe("blob:fake-1"));

    const request = harness.requests[0];
    expect(request?.url.pathname).toBe(`${proxyPrefix}/api/files/image`);
    expect(request?.url.searchParams.get("path")).toBe(path);
    expect(request?.url.searchParams.get("ticket")).toBeNull();
    expect(harness.client.imageResolutionFor(key)).toMatchObject({ url: "blob:fake-1" });
  });

  it("drops a stale generation's completion after eviction and aborts it", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const harness = buildImages([() => first.promise, () => second.promise], {
      maxImageCacheEntries: 1,
    });
    const refA = imageRef({ itemId: "item-a" });
    const refB = imageRef({ itemId: "item-b" });
    const keyA = harness.client.imageKeyForRef(refA);
    const ticks: string[] = [];
    harness.client.subscribeImageKey(keyA, () => ticks.push("tick"));

    expect(harness.client.imageRefUrl(refA)).toBe("");
    expect(harness.client.imageRefUrl(refB)).toBe("");
    await vi.waitFor(() => expect(ticks).toEqual(["tick"]));
    expect(harness.requests[0]?.signal?.aborted).toBe(true);

    first.resolve(bytesResponse(new Uint8Array([1, 2, 3])));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(harness.created).toHaveLength(0);
    expect(ticks).toEqual(["tick"]);
    expect(harness.client.imageResolutionFor(keyA).url).toBe("");
  });

  it("revokes cached URLs and aborts in-flight fetches on dispose", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const harness = buildImages([() => first.promise, () => second.promise]);
    const refA = imageRef({ itemId: "item-a" });
    const refB = imageRef({ itemId: "item-b" });

    expect(harness.client.imageRefUrl(refA)).toBe("");
    first.resolve(bytesResponse(new Uint8Array([1])));
    await vi.waitFor(() => expect(harness.client.imageRefUrl(refA)).toBe("blob:fake-1"));

    expect(harness.client.imageRefUrl(refB)).toBe("");
    harness.client.dispose();
    expect(harness.revoked).toEqual(["blob:fake-1"]);
    expect(harness.requests[1]?.signal?.aborted).toBe(true);

    second.resolve(bytesResponse(new Uint8Array([2])));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(harness.created).toEqual(["blob:fake-1"]);
    expect(harness.client.imageRefUrl(refA)).toBe("");
    expect(harness.requests).toHaveLength(2);
  });

  it("evicts by entry bound, revokes the oldest URL, and returns to placeholder", async () => {
    const responses = [deferred<Response>(), deferred<Response>(), deferred<Response>()];
    const harness = buildImages(
      responses.map((response) => () => response.promise),
      { maxImageCacheEntries: 2 },
    );
    const refA = imageRef({ itemId: "item-a" });
    const refB = imageRef({ itemId: "item-b" });
    const refC = imageRef({ itemId: "item-c" });
    const keyA = harness.client.imageKeyForRef(refA);

    for (const [index, ref] of [refA, refB].entries()) {
      expect(harness.client.imageRefUrl(ref)).toBe("");
      responses[index]?.resolve(bytesResponse(new Uint8Array([index + 1])));
    }
    await vi.waitFor(() => expect(harness.client.imageRefUrl(refB)).toBe("blob:fake-2"));

    expect(harness.client.imageRefUrl(refC)).toBe("");
    expect(harness.revoked).toEqual(["blob:fake-1"]);
    expect(harness.client.imageResolutionFor(keyA)).toMatchObject({ url: "", pending: false });

    responses[2]?.resolve(bytesResponse(new Uint8Array([3])));
    await vi.waitFor(() => expect(harness.client.imageRefUrl(refC)).toBe("blob:fake-3"));
  });

  it("evicts by byte bound and revokes the evicted object URL", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const harness = buildImages([() => first.promise, () => second.promise], {
      maxImageCacheBytes: 10,
    });
    const refA = imageRef({ itemId: "item-a" });
    const refB = imageRef({ itemId: "item-b" });

    expect(harness.client.imageRefUrl(refA)).toBe("");
    first.resolve(bytesResponse(new Uint8Array(6).fill(1)));
    await vi.waitFor(() => expect(harness.client.imageRefUrl(refA)).toBe("blob:fake-1"));

    expect(harness.client.imageRefUrl(refB)).toBe("");
    second.resolve(bytesResponse(new Uint8Array(6).fill(2)));
    await vi.waitFor(() => expect(harness.client.imageRefUrl(refB)).toBe("blob:fake-2"));

    expect(harness.revoked).toEqual(["blob:fake-1"]);
    expect(harness.client.imageRefUrl(refA)).not.toBe("blob:fake-1");
  });

  it("latches a failure with a bounded retry window that notifies again", async () => {
    vi.useFakeTimers();
    try {
      const harness = buildImages(
        [() => Promise.reject(new Error("offline")), () => bytesResponse(new Uint8Array([9]))],
        { imageRetryWindowMs: 1_000 },
      );
      const ref = imageRef();
      const key = harness.client.imageKeyForRef(ref);
      const ticks: string[] = [];
      harness.client.subscribeImageKey(key, () => ticks.push("tick"));

      expect(harness.client.imageRefUrl(ref)).toBe("");
      await vi.advanceTimersByTimeAsync(0);
      expect(ticks).toEqual(["tick"]);

      // Inside the window the failure is latched: no new dispatch.
      expect(harness.client.imageRefUrl(ref)).toBe("");
      expect(harness.requests).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(ticks).toEqual(["tick", "tick"]);

      expect(harness.client.imageRefUrl(ref)).toBe("");
      expect(harness.requests).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(0);
      expect(harness.client.imageRefUrl(ref)).toBe("blob:fake-1");
      expect(ticks).toEqual(["tick", "tick", "tick"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("enforces the streaming byte cap and never publishes oversized bytes", async () => {
    const harness = buildImages([() => bytesResponse(new Uint8Array(10))], {
      maxImageFetchBytes: 4,
    });
    const ref = imageRef();
    const key = harness.client.imageKeyForRef(ref);
    const ticks: string[] = [];
    harness.client.subscribeImageKey(key, () => ticks.push("tick"));

    expect(harness.client.imageRefUrl(ref)).toBe("");
    await vi.waitFor(() => expect(ticks).toEqual(["tick"]));

    expect(harness.created).toHaveLength(0);
    expect(harness.client.imageRefUrl(ref)).toBe("");
    expect(harness.requests).toHaveLength(1);
  });

  it("caps a duplicate-looking response independently despite a misleading Content-Length", async () => {
    const payload = new Uint8Array([1, 2, 3]);
    const harness = buildImages(
      [
        () => bytesResponse(payload),
        () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(payload);
                controller.enqueue(new Uint8Array([4]));
                controller.close();
              },
            }),
            { headers: { "content-type": "image/png", "content-length": "3" } },
          ),
      ],
      { maxImageFetchBytes: 3 },
    );
    const refA = imageRef({ itemId: "item-a" });
    const refB = imageRef({ itemId: "item-b" });
    try {
      harness.client.imageRefResolution(refA);
      await vi.waitFor(() => expect(harness.client.imageRefUrl(refA)).toBe("blob:fake-1"));
      harness.client.imageRefResolution(refB);
      await vi.waitFor(() =>
        expect(
          harness.client.imageResolutionFor(harness.client.imageKeyForRef(refB)),
        ).toMatchObject({ url: "", pending: false }),
      );
      expect(harness.client.imageRefUrl(refA)).toBe("blob:fake-1");
      expect(harness.client.imageRefUrl(refB)).toBe("");
      expect(harness.requests).toHaveLength(2);
      expect(harness.created).toEqual(["blob:fake-1"]);
    } finally {
      harness.client.dispose();
    }
  });

  it("stops notifying after unsubscribe and starts nothing for unknown keys", () => {
    const harness = buildImages([]);
    const key = harness.client.imageKeyForLocalPath("/tmp/a.png");
    const unsubscribe = harness.client.subscribeImageKey(key, () => {
      throw new Error("must not notify after unsubscribe");
    });
    unsubscribe();

    expect(harness.client.imageResolutionFor("unknown-key")).toEqual({
      key: "unknown-key",
      url: "",
      pending: false,
    });
    expect(harness.requests).toHaveLength(0);
  });
});
