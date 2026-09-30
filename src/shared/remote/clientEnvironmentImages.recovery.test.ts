import { describe, expect, it, vi } from "vitest";
import {
  ENVIRONMENT_AUTH_AUTHORITY_HEADER,
  ENVIRONMENT_AUTHORIZATION_HEADER,
} from "@/shared/environments";
import {
  RemoteEnvironmentClient,
  REMOTE_ENVIRONMENT_CHILD_NEEDS_REPAIR,
  REMOTE_ENVIRONMENT_PARENT_NEEDS_REPAIR,
} from "./clientEnvironments";
import { RemoteClientError } from "./clientErrors";
import {
  TEST_ENVIRONMENT_ID,
  accessTokenResponse,
  bytesResponse,
  errorResponse,
  imageRef,
  scriptedFetch,
  testAuthority,
  testChildLifecycle,
  testEnvironmentEndpoint,
  type RequestHandler,
} from "./clientEnvironments.testSupport";
import type { RemoteEnvironmentClient as RemoteEnvironmentClientType } from "./clientEnvironments";

/** Reaches the private byte fetcher to assert the typed repair outcome. */
function fetchImageBytesForTest(
  client: RemoteEnvironmentClientType,
  requestPath: string,
  signal: AbortSignal,
): Promise<unknown> {
  const internals = client as unknown as {
    fetchImageBytes: (path: string, abort: AbortSignal) => Promise<unknown>;
  };
  return internals.fetchImageBytes(requestPath, signal);
}

function buildClient(
  handlers: readonly RequestHandler[],
  options: {
    readonly ensureLive?: () => Promise<void>;
    readonly imageFetchDeadlineMs?: number;
    readonly imageRetryWindowMs?: number;
  } = {},
) {
  const scripted = scriptedFetch(handlers);
  const created: string[] = [];
  const revoked: string[] = [];
  const authority = testAuthority(options.ensureLive ? { ensureLive: options.ensureLive } : {});
  const client = new RemoteEnvironmentClient(
    testEnvironmentEndpoint(),
    "child-access",
    scripted.fetchImpl,
    {
      environmentId: TEST_ENVIRONMENT_ID,
      parentAuthority: authority.authority,
      createObjectUrl: () => {
        const url = `blob:${created.length + 1}`;
        created.push(url);
        return url;
      },
      revokeObjectUrl: (url) => {
        revoked.push(url);
      },
      ...options,
    },
  );
  return { client, requests: scripted.requests, created, revoked, authority };
}

describe("RemoteEnvironmentClient image auth recovery", () => {
  it("refreshes the parent once and replays on a marker-proven parent 401", async () => {
    const harness = buildClient([
      () =>
        errorResponse(401, "invalid_access_token", {
          [ENVIRONMENT_AUTH_AUTHORITY_HEADER]: "parent",
        }),
      () => bytesResponse(new Uint8Array([1, 2, 3])),
    ]);
    const ref = imageRef();

    expect(harness.client.imageRefUrl(ref)).toBe("");
    await vi.waitFor(() => expect(harness.created).toEqual(["blob:1"]));

    expect(harness.authority.calls.ensureLive).toBe(1);
    expect(harness.requests).toHaveLength(2);
    expect(harness.requests[0]?.headers[ENVIRONMENT_AUTHORIZATION_HEADER]).toBe(
      "Bearer parent-access",
    );
  });

  it("uses the single-flight child refresh for a markerless 401 and replays once", async () => {
    const harness = buildClient([
      () => errorResponse(401, "invalid_access_token"),
      () => accessTokenResponse("child-access-2", "child-refresh-2"),
      () => bytesResponse(new Uint8Array([4, 5, 6])),
    ]);
    const lifecycle = testChildLifecycle("child-refresh-1");
    harness.client.setTokenLifecycle(lifecycle.lifecycle);

    expect(harness.client.imageRefUrl(imageRef())).toBe("");
    await vi.waitFor(() => expect(harness.created).toEqual(["blob:1"]));

    expect(harness.requests).toHaveLength(3);
    expect(harness.requests[1]?.url.pathname).toBe(
      `/api/environments/${TEST_ENVIRONMENT_ID}/proxy/oauth/token`,
    );
    expect(lifecycle.refreshed).toHaveLength(1);
    expect(harness.authority.calls.ensureLive).toBe(0);
  });

  it("fails closed as child repair on a markerless 401 without a child grant", async () => {
    const harness = buildClient([() => errorResponse(401, "invalid_access_token")]);
    await expect(
      fetchImageBytesForTest(
        harness.client,
        "/api/files/image?path=%2Ftmp%2Fa.png",
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: REMOTE_ENVIRONMENT_CHILD_NEEDS_REPAIR });
    expect(harness.requests).toHaveLength(1);
    expect(harness.authority.calls.ensureLive).toBe(0);
  });

  it("fails closed as parent repair when the parent grant is definitely rejected", async () => {
    const rejection = new RemoteClientError("Invalid refresh token.", 401, "invalid_refresh_token");
    const harness = buildClient(
      [
        () =>
          errorResponse(401, "invalid_access_token", {
            [ENVIRONMENT_AUTH_AUTHORITY_HEADER]: "parent",
          }),
      ],
      { ensureLive: () => Promise.reject(rejection) },
    );
    await expect(
      fetchImageBytesForTest(
        harness.client,
        "/api/files/image?path=%2Ftmp%2Fa.png",
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: REMOTE_ENVIRONMENT_PARENT_NEEDS_REPAIR });
    expect(harness.requests).toHaveLength(1);
  });

  it("preserves a parent refresh transport failure instead of claiming revocation", async () => {
    const failure = new RemoteClientError("Connection reset", 0, "request_failed", {
      requestPhase: "dispatched",
      requestMayHaveCommitted: true,
    });
    const harness = buildClient(
      [
        () =>
          errorResponse(401, "invalid_access_token", {
            [ENVIRONMENT_AUTH_AUTHORITY_HEADER]: "parent",
          }),
      ],
      { ensureLive: () => Promise.reject(failure) },
    );
    await expect(
      fetchImageBytesForTest(
        harness.client,
        "/api/files/image?path=%2Ftmp%2Fa.png",
        new AbortController().signal,
      ),
    ).rejects.toBe(failure);
    // The transport failure never triggers a replay.
    expect(harness.requests).toHaveLength(1);
  });

  it("preserves a nested child-refresh transport failure instead of claiming revocation", async () => {
    const harness = buildClient([
      () => errorResponse(401, "invalid_access_token"),
      () => Promise.reject(new TypeError("Failed to fetch")),
    ]);
    harness.client.setTokenLifecycle(testChildLifecycle().lifecycle);

    await expect(
      fetchImageBytesForTest(
        harness.client,
        "/api/files/image?path=%2Ftmp%2Fa.png",
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 0, code: "network" });
    expect(harness.requests).toHaveLength(2);
    expect(harness.authority.calls.ensureLive).toBe(0);
  });

  it("attributes a definitively rejected nested child refresh to child repair", async () => {
    const harness = buildClient([
      () => errorResponse(401, "invalid_access_token"),
      () => errorResponse(401, "invalid_refresh_token"),
    ]);
    harness.client.setTokenLifecycle(testChildLifecycle().lifecycle);

    const error = await fetchImageBytesForTest(
      harness.client,
      "/api/files/image?path=%2Ftmp%2Fa.png",
      new AbortController().signal,
    ).catch((cause: unknown) => cause);
    expect(error).toMatchObject({ status: 401, code: REMOTE_ENVIRONMENT_CHILD_NEEDS_REPAIR });
    expect((error as Error).cause).toMatchObject({ code: "invalid_refresh_token" });
    expect(harness.requests).toHaveLength(2);
    expect(harness.authority.calls.ensureLive).toBe(0);
  });

  it("keeps a markerless image rejection unattributed after child refresh", async () => {
    const harness = buildClient([
      () => errorResponse(401, "invalid_access_token"),
      () => accessTokenResponse("child-access-2", "child-refresh-2"),
      () => errorResponse(401, "invalid_access_token"),
    ]);
    harness.client.setTokenLifecycle(testChildLifecycle().lifecycle);

    await expect(
      fetchImageBytesForTest(
        harness.client,
        "/api/files/image?path=%2Ftmp%2Fa.png",
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 401, code: "request_failed" });
    expect(harness.requests).toHaveLength(3);
    expect(harness.authority.calls.ensureLive).toBe(0);
  });

  it("keeps a markerless image rejection unattributed after parent refresh", async () => {
    const harness = buildClient([
      () =>
        errorResponse(401, "invalid_access_token", {
          [ENVIRONMENT_AUTH_AUTHORITY_HEADER]: "parent",
        }),
      () => errorResponse(401, "invalid_access_token"),
    ]);
    await expect(
      fetchImageBytesForTest(
        harness.client,
        "/api/files/image?path=%2Ftmp%2Fa.png",
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 401, code: "request_failed" });
    expect(harness.requests).toHaveLength(2);
    expect(harness.authority.calls.ensureLive).toBe(1);
  });

  it("attributes a second marker-proven parent 401 after recovery to parent repair", async () => {
    const harness = buildClient([
      () =>
        errorResponse(401, "invalid_access_token", {
          [ENVIRONMENT_AUTH_AUTHORITY_HEADER]: "parent",
        }),
      () =>
        errorResponse(401, "invalid_access_token", {
          [ENVIRONMENT_AUTH_AUTHORITY_HEADER]: "parent",
        }),
    ]);
    await expect(
      fetchImageBytesForTest(
        harness.client,
        "/api/files/image?path=%2Ftmp%2Fa.png",
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: REMOTE_ENVIRONMENT_PARENT_NEEDS_REPAIR });
    expect(harness.authority.calls.ensureLive).toBe(1);
    expect(harness.requests).toHaveLength(2);
  });

  it("aborts a fetch that exceeds its deadline and latches the key", async () => {
    const harness = buildClient(
      [
        (request) =>
          new Promise<Response>((_resolve, reject) => {
            request.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      ],
      { imageFetchDeadlineMs: 20, imageRetryWindowMs: 60_000 },
    );
    const ref = imageRef();
    const ticks: string[] = [];
    harness.client.subscribeImageKey(harness.client.imageKeyForRef(ref), () => ticks.push("tick"));

    expect(harness.client.imageRefUrl(ref)).toBe("");
    await vi.waitFor(() => expect(ticks).toEqual(["tick"]), { timeout: 2_000 });

    expect(harness.requests[0]?.signal?.aborted).toBe(true);
    expect(harness.created).toEqual([]);
    // The failure latch prevents a blind refetch inside the retry window.
    expect(harness.client.imageRefUrl(ref)).toBe("");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(harness.requests).toHaveLength(1);
  });
});
