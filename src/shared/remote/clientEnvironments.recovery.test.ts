import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ENVIRONMENT_AUTH_AUTHORITY_HEADER,
  ENVIRONMENT_AUTHORIZATION_HEADER,
} from "@/shared/environments";
import { remoteMutationMayHaveCommitted, RemoteClientError } from "./clientErrors";
import {
  REMOTE_ENVIRONMENT_PARENT_NEEDS_REPAIR,
  RemoteEnvironmentClient,
  isRemoteEnvironmentNeedsRepairError,
} from "./clientEnvironments";
import {
  TEST_ENVIRONMENT_ID,
  accessTokenResponse,
  environmentProjection,
  errorResponse,
  jsonResponse,
  scriptedFetch,
  testAuthority,
  testChildLifecycle,
  testEnvironmentEndpoint,
  type CapturedRequest,
  type RequestHandler,
  type TestAuthority,
  type TestChildLifecycle,
} from "./clientEnvironments.testSupport";

const proxyPrefix = "/api/environments/11111111-1111-4111-8111-111111111111/proxy";
const listPath = `${proxyPrefix}/api/environments`;
const tokenPath = `${proxyPrefix}/oauth/token`;

interface Harness {
  readonly client: RemoteEnvironmentClient;
  readonly requests: CapturedRequest[];
  readonly authority: TestAuthority;
  readonly lifecycle: TestChildLifecycle;
}

function build(
  handlers: readonly RequestHandler[],
  overrides: {
    readonly authority?: TestAuthority;
    readonly lifecycle?: TestChildLifecycle;
    readonly accessToken?: string;
    readonly requestTimeoutMs?: number;
    readonly certFingerprint?: string;
  } = {},
): Harness {
  const scripted = scriptedFetch(handlers);
  const authority = overrides.authority ?? testAuthority();
  const lifecycle = overrides.lifecycle ?? testChildLifecycle();
  const client = new RemoteEnvironmentClient(
    testEnvironmentEndpoint(),
    overrides.accessToken ?? "child-access",
    scripted.fetchImpl,
    {
      environmentId: TEST_ENVIRONMENT_ID,
      parentAuthority: authority.authority,
      tokenLifecycle: lifecycle.lifecycle,
      ...(overrides.requestTimeoutMs !== undefined
        ? { requestTimeoutMs: overrides.requestTimeoutMs }
        : {}),
      ...(overrides.certFingerprint !== undefined
        ? { certFingerprint: overrides.certFingerprint }
        : {}),
    },
  );
  return { client, requests: scripted.requests, authority, lifecycle };
}

function parentMarker(status = 401, code = "missing_environment_authorization"): Response {
  return errorResponse(status, code, { [ENVIRONMENT_AUTH_AUTHORITY_HEADER]: "parent" });
}

function logged(events: string[], response: () => Response): RequestHandler {
  return (request) => {
    events.push(`request:${request.method} ${request.url.pathname}`);
    return response();
  };
}

describe("RemoteEnvironmentClient parent recovery (R1)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("recovers a dead parent exactly once: nested refresh is header-only, then one refresh and one replay", async () => {
    const events: string[] = [];
    const authority = testAuthority({
      ensureLive: async () => {
        authority.calls.ensureLive += 1;
        events.push("ensureLive");
      },
    });
    const lifecycle = testChildLifecycle();
    const harness = build(
      [
        logged(events, () => parentMarker()),
        logged(events, () => parentMarker()),
        logged(events, () => jsonResponse({ environments: [] })),
      ],
      { authority, lifecycle },
    );

    await expect(harness.client.listEnvironments()).resolves.toEqual([]);

    // The nested child refresh never opens its own recovery; the parent is
    // refreshed once after the top-level 401 and the original dispatch replays.
    expect(events).toEqual([
      `request:GET ${listPath}`,
      `request:POST ${tokenPath}`,
      "ensureLive",
      `request:GET ${listPath}`,
    ]);
    expect(harness.requests).toHaveLength(3);
    const nested = harness.requests[1];
    expect(nested?.body).toEqual({ grantType: "refresh_token", refreshToken: "child-refresh-1" });
    expect(nested?.headers[ENVIRONMENT_AUTHORIZATION_HEADER]).toBe("Bearer parent-access");
    expect(nested?.headers.authorization).toBe("Bearer child-access");
    // The dead parent rejected the child refresh pre-dial; the child grant was
    // never consumed or rotated.
    expect(lifecycle.refreshed).toHaveLength(0);
    expect(lifecycle.currentRefreshToken()).toBe("child-refresh-1");
  });

  it("fails closed with needs-repair(parent) when the parent grant is definitely rejected", async () => {
    const rejection = new RemoteClientError("Invalid refresh token.", 401, "invalid_refresh_token");
    const authority = testAuthority({
      ensureLive: async () => {
        authority.calls.ensureLive += 1;
        throw rejection;
      },
    });
    const lifecycle = testChildLifecycle();
    const harness = build([() => parentMarker(), () => parentMarker()], { authority, lifecycle });

    const error = await harness.client.listEnvironments().catch((cause: unknown) => cause);
    expect(error).toMatchObject({
      status: 401,
      code: REMOTE_ENVIRONMENT_PARENT_NEEDS_REPAIR,
      requestMayHaveCommitted: false,
    });
    expect(isRemoteEnvironmentNeedsRepairError(error)).toBe(true);
    expect((error as Error).cause).toBe(rejection);
    expect(harness.requests).toHaveLength(2);
    expect(authority.calls.ensureLive).toBe(1);
    expect(lifecycle.refreshed).toHaveLength(0);
    expect(lifecycle.currentRefreshToken()).toBe("child-refresh-1");
  });

  it.each([
    [
      "network drop",
      new RemoteClientError("Connection reset", 0, "request_failed", {
        requestPhase: "dispatched",
        requestMayHaveCommitted: true,
      }),
    ],
    [
      "deadline",
      new RemoteClientError("Remote request timed out after 30000ms.", 0, "timeout", {
        requestPhase: "dispatched",
      }),
    ],
    [
      "caller cancellation",
      new RemoteClientError("Remote request was cancelled.", 499, "cancelled", {
        requestPhase: "dispatched",
      }),
    ],
    [
      "server failure",
      new RemoteClientError("Remote request failed.", 503, "unavailable", {
        requestPhase: "dispatched",
      }),
    ],
    [
      "scope rejection",
      new RemoteClientError("Access token does not grant this operation.", 403, "missing_scope"),
    ],
    [
      "ambiguous outcome",
      new RemoteClientError("Outcome uncertain.", 409, "command_outcome_uncertain"),
    ],
  ])(
    "preserves a parent refresh %s instead of claiming the grant was revoked",
    async (_name, failure) => {
      const authority = testAuthority({
        ensureLive: async () => {
          authority.calls.ensureLive += 1;
          throw failure;
        },
      });
      const harness = build([() => parentMarker(), () => parentMarker()], { authority });

      await expect(harness.client.listEnvironments()).rejects.toBe(failure);
      expect(isRemoteEnvironmentNeedsRepairError(failure)).toBe(false);
      expect(harness.authority.calls.ensureLive).toBe(1);
      // The nested child refresh is the only other dial; the refresh failure
      // never triggers a replay.
      expect(harness.requests).toHaveLength(2);
    },
  );

  it("lets the inherited child single-flight refresh handle a child expiry when the parent is live", async () => {
    const harness = build([
      () => errorResponse(401, "invalid_access_token"),
      () => accessTokenResponse("child-access-2", "child-refresh-2"),
      () => jsonResponse({ environments: [] }),
    ]);

    await expect(harness.client.listEnvironments()).resolves.toEqual([]);

    expect(harness.requests).toHaveLength(3);
    expect(harness.requests[1]?.headers[ENVIRONMENT_AUTHORIZATION_HEADER]).toBe(
      "Bearer parent-access",
    );
    expect(harness.requests[2]?.headers.authorization).toBe("Bearer child-access-2");
    expect(harness.lifecycle.refreshed).toEqual([
      expect.objectContaining({ accessToken: "child-access-2", refreshToken: "child-refresh-2" }),
    ]);
    expect(harness.authority.calls.ensureLive).toBe(0);
  });

  it("preserves a markerless 401 without asserting that the child was its source", async () => {
    const lifecycle = testChildLifecycle();
    const harness = build(
      [
        () => errorResponse(401, "invalid_access_token"),
        () => errorResponse(401, "invalid_refresh_token"),
      ],
      { lifecycle },
    );

    const error = await harness.client.listEnvironments().catch((cause: unknown) => cause);
    // The inherited child refresh ran and was rejected, but without a marker
    // the authority stays unknown: the ORIGINAL rejection surfaces unclaimed.
    expect(error).toMatchObject({ status: 401, code: "invalid_access_token" });
    expect(isRemoteEnvironmentNeedsRepairError(error)).toBe(false);
    expect(harness.authority.calls.ensureLive).toBe(0);
    expect(harness.requests).toHaveLength(2);
    expect(lifecycle.refreshed).toHaveLength(0);
    expect(lifecycle.currentRefreshToken()).toBe("child-refresh-1");
  });

  it("allows only one recovery per top-level call: a replay marker 401 surfaces unchanged", async () => {
    const harness = build([
      () => parentMarker(),
      () => parentMarker(),
      () => parentMarker(),
      () => parentMarker(),
    ]);

    const error = await harness.client.listEnvironments().catch((cause: unknown) => cause);
    expect(error).toMatchObject({ status: 401, code: "missing_environment_authorization" });
    expect(harness.authority.calls.ensureLive).toBe(1);
    // The replay itself may still attempt one inherited child refresh (its 401
    // is a parent marker again, so that nested attempt dies pre-dial too), but
    // it can never trigger a second parent recovery.
    expect(harness.requests).toHaveLength(4);
    expect(harness.requests[2]?.headers[ENVIRONMENT_AUTHORIZATION_HEADER]).toBe(
      "Bearer parent-access",
    );
  });

  it("ignores a marker that is not the exact trusted parent value", async () => {
    for (const marker of ["child", "PARENT", "parentx", "parent."]) {
      // Note: the Fetch Headers API strips outer whitespace, so a `"parent "`
      // value can never arrive on the wire; only an exact `parent` recovers.
      const harness = build([
        () =>
          errorResponse(401, "invalid_access_token", {
            [ENVIRONMENT_AUTH_AUTHORITY_HEADER]: marker,
          }),
      ]);
      const error = await harness.client.listEnvironments().catch((cause: unknown) => cause);
      expect(error).toMatchObject({ status: 401, code: "invalid_access_token" });
      expect(isRemoteEnvironmentNeedsRepairError(error)).toBe(false);
      expect(harness.authority.calls.ensureLive).toBe(0);
    }
  });

  it("never recovers a non-401 response even when the marker is present", async () => {
    const forbidden = build([() => parentMarker(403, "missing_scope")]);
    const forbiddenError = await forbidden.client
      .listEnvironments()
      .catch((cause: unknown) => cause);
    expect(forbiddenError).toMatchObject({ status: 403, code: "missing_scope" });
    expect(forbidden.authority.calls.ensureLive).toBe(0);

    const failing = build([() => parentMarker(500, "internal_error")]);
    const failingError = await failing.client.listEnvironments().catch((cause: unknown) => cause);
    expect(failingError).toMatchObject({ status: 500, code: "internal_error" });
    expect(failing.authority.calls.ensureLive).toBe(0);
  });

  it("fails closed without a parent token instead of dialing the proxy", async () => {
    const authority = testAuthority({ accessToken: () => undefined });
    const harness = build([() => jsonResponse({ environments: [] })], { authority });

    const error = await harness.client.listEnvironments().catch((cause: unknown) => cause);
    expect(error).toMatchObject({ code: REMOTE_ENVIRONMENT_PARENT_NEEDS_REPAIR });
    expect(harness.requests).toHaveLength(0);
    expect(authority.calls.ensureLive).toBe(0);
  });

  it("attaches the parent header to the child bearer on every proxied dispatch", async () => {
    const harness = build([() => jsonResponse({ environments: [environmentProjection()] })], {
      certFingerprint: "aa".repeat(32),
    });

    await harness.client.listEnvironments();

    const request = harness.requests[0];
    expect(request?.url.pathname).toBe(listPath);
    expect(request?.headers.authorization).toBe("Bearer child-access");
    expect(request?.headers[ENVIRONMENT_AUTHORIZATION_HEADER]).toBe("Bearer parent-access");
    expect(request?.certFingerprint).toBe("aa".repeat(32));
  });
});

describe("RemoteEnvironmentClient mutation evidence (R1 item 6)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const createBody = { label: "Build box", target: "user@example-host" };

  async function expectNoReplay(
    handlers: readonly RequestHandler[],
    expected: Record<string, unknown>,
  ): Promise<unknown> {
    const harness = build(handlers);
    const error = await harness.client
      .createEnvironment(createBody)
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject(expected);
    expect(harness.requests).toHaveLength(1);
    expect(harness.authority.calls.ensureLive).toBe(0);
    return error;
  }

  it("keeps a 5xx mutation ambiguous and never replays it", async () => {
    const error = await expectNoReplay([() => errorResponse(500, "internal_error")], {
      status: 500,
      code: "internal_error",
    });
    expect(remoteMutationMayHaveCommitted(error)).toBe(true);
  });

  it("keeps a network drop ambiguous and never replays it", async () => {
    const error = await expectNoReplay([() => Promise.reject(new TypeError("Failed to fetch"))], {
      status: 0,
      code: "network",
    });
    expect(remoteMutationMayHaveCommitted(error)).toBe(true);
  });

  it("keeps a dispatched timeout ambiguous and never replays it", async () => {
    vi.useFakeTimers();
    const harness = build([() => new Promise<Response>(() => undefined)], { requestTimeoutMs: 5 });
    const pending = harness.client.createEnvironment(createBody).catch((cause: unknown) => cause);
    await vi.advanceTimersByTimeAsync(5);
    const error = await pending;
    expect(error).toMatchObject({ status: 0, code: "timeout" });
    expect(remoteMutationMayHaveCommitted(error)).toBe(true);
    expect(harness.requests).toHaveLength(1);
    expect(harness.authority.calls.ensureLive).toBe(0);
  });

  it("keeps command_outcome_uncertain ambiguous and never replays it", async () => {
    const error = await expectNoReplay([() => errorResponse(409, "command_outcome_uncertain")], {
      status: 409,
      code: "command_outcome_uncertain",
    });
    expect(remoteMutationMayHaveCommitted(error)).toBe(true);
  });

  it("keeps a definite 4xx rejection definite", async () => {
    const error = await expectNoReplay([() => errorResponse(400, "environment_invalid_input")], {
      status: 400,
      code: "environment_invalid_input",
    });
    expect(remoteMutationMayHaveCommitted(error)).toBe(false);
  });

  it("keeps a caller cancellation after dispatch ambiguous and never replays it", async () => {
    class SignalEnvironmentClient extends RemoteEnvironmentClient {
      callMutation(signal: AbortSignal): Promise<unknown> {
        return this.requestJson("/api/environments", {
          method: "POST",
          body: createBody,
          mutation: true,
          signal,
        });
      }
    }
    const scripted = scriptedFetch([
      (request) =>
        new Promise<Response>((_resolve, reject) => {
          request.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("The operation was aborted.", "AbortError")),
            { once: true },
          );
        }),
    ]);
    const authority = testAuthority();
    const client = new SignalEnvironmentClient(
      testEnvironmentEndpoint(),
      "child-access",
      scripted.fetchImpl,
      { environmentId: TEST_ENVIRONMENT_ID, parentAuthority: authority.authority },
    );
    const controller = new AbortController();
    const pending = client.callMutation(controller.signal).catch((cause: unknown) => cause);
    controller.abort();
    const error = await pending;
    expect(error).toMatchObject({ status: 499, code: "cancelled" });
    expect(remoteMutationMayHaveCommitted(error)).toBe(true);
    expect(scripted.requests).toHaveLength(1);
    expect(authority.calls.ensureLive).toBe(0);
  });
});

describe("RemoteEnvironmentClient child management pass-through (R4)", () => {
  it("manages the bound child registry through the one-hop proxy under the child grant", async () => {
    const projection = environmentProjection();
    const harness = build([() => jsonResponse({ environments: [projection] })]);

    await expect(harness.client.listEnvironments()).resolves.toEqual([projection]);

    const request = harness.requests[0];
    expect(request?.url.pathname).toBe(listPath);
    expect(request?.headers.authorization).toBe("Bearer child-access");
    expect(request?.headers[ENVIRONMENT_AUTHORIZATION_HEADER]).toBe("Bearer parent-access");
  });

  it("surfaces the child's own scope rejection without touching the parent grant", async () => {
    const harness = build([() => errorResponse(403, "missing_scope")]);

    const error = await harness.client
      .createEnvironment({ label: "Build box", target: "user@example-host" })
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject({ status: 403, code: "missing_scope" });
    expect(harness.requests).toHaveLength(1);
    expect(harness.authority.calls.ensureLive).toBe(0);
  });
});
