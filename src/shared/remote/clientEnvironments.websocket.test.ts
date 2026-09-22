import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteClientError } from "./clientErrors";
import {
  ENVIRONMENT_PARENT_TICKET_CACHE_MAX_ENTRIES,
  REMOTE_ENVIRONMENT_PARENT_NEEDS_REPAIR,
  RemoteEnvironmentClient,
  isRemoteEnvironmentNeedsRepairError,
} from "./clientEnvironments";
import {
  TEST_ENVIRONMENT_ID,
  deferred,
  jsonResponse,
  scriptedFetch,
  testAuthority,
  testEnvironmentEndpoint,
  type RequestHandler,
} from "./clientEnvironments.testSupport";

const endpoint = testEnvironmentEndpoint();
const ticketPath =
  "/api/environments/11111111-1111-4111-8111-111111111111/proxy/api/auth/websocket-ticket";
const FUTURE = "2099-01-01T00:00:00.000Z";

function buildClient(
  handlers: readonly RequestHandler[],
  authority = testAuthority(),
): { client: RemoteEnvironmentClient; requests: ReturnType<typeof scriptedFetch>["requests"] } {
  const scripted = scriptedFetch(handlers);
  const client = new RemoteEnvironmentClient(endpoint, "child-access", scripted.fetchImpl, {
    environmentId: TEST_ENVIRONMENT_ID,
    parentAuthority: authority.authority,
  });
  return { client, requests: scripted.requests };
}

function ticketResponse(ticket: string): Response {
  return jsonResponse({ ticket, expiresAt: FUTURE });
}

describe("RemoteEnvironmentClient websocket ticket pairing", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("associates each parent ticket with the exact child ticket that minted it", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const authority = testAuthority();
    const { client, requests } = buildClient(
      [() => first.promise, () => second.promise],
      authority,
    );

    const firstTicket = client.websocketTicket();
    const secondTicket = client.websocketTicket();
    // Resolve the second child mint first: a "last ticket wins" cache would
    // pair parent-ws-1 with the wrong child here.
    second.resolve(ticketResponse("child-b"));
    const childB = await secondTicket;
    first.resolve(ticketResponse("child-a"));
    const childA = await firstTicket;

    expect(requests.map((request) => request.url.pathname)).toEqual([ticketPath, ticketPath]);
    const urlB = new URL(client.websocketUrl(childB, 3));
    const urlA = new URL(client.websocketUrl(childA, 0));
    expect(urlB.searchParams.get("parentTicket")).toBe("parent-ws-1");
    expect(urlA.searchParams.get("parentTicket")).toBe("parent-ws-2");
    expect(urlA.searchParams.get("ticket")).toBe("child-a");
    expect(urlA.searchParams.get("lastSeenSeq")).toBe("0");
  });

  it("keeps the rest of the websocket URL contract intact", async () => {
    const { client } = buildClient([() => ticketResponse("child-a")]);
    const ticket = await client.websocketTicket();
    const url = new URL(client.websocketUrl(ticket, 12, { threadItemInterests: ["item-1"] }));
    expect(url.protocol).toBe("ws:");
    expect(url.pathname.endsWith(`${endpointPath()}/ws`)).toBe(true);
    expect(url.searchParams.get("ticket")).toBe("child-a");
    expect(url.searchParams.get("lastSeenSeq")).toBe("12");
    expect([...url.searchParams.getAll("threadItemInterests")].join("")).toContain("item-1");
    expect(url.searchParams.get("parentTicket")).toBe("parent-ws-1");
  });

  it("omits parentTicket when the pair was never minted", () => {
    const { client } = buildClient([() => ticketResponse("child-a")]);
    const url = new URL(client.websocketUrl("some-other-ticket", 0));
    expect(url.searchParams.get("parentTicket")).toBeNull();
    expect(url.searchParams.get("ticket")).toBe("some-other-ticket");
  });

  it("omits an expired parent ticket", async () => {
    vi.useFakeTimers();
    const authority = testAuthority({
      mintWebSocketTicket: async () => ({
        ticket: "parent-ws-expiring",
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
      }),
    });
    const { client } = buildClient([() => ticketResponse("child-a")], authority);
    const ticket = await client.websocketTicket();
    expect(new URL(client.websocketUrl(ticket, 0)).searchParams.get("parentTicket")).toBe(
      "parent-ws-expiring",
    );
    await vi.advanceTimersByTimeAsync(30_001);
    expect(new URL(client.websocketUrl(ticket, 0)).searchParams.get("parentTicket")).toBeNull();
  });

  it("preserves a parent ticket transport failure instead of claiming revocation", async () => {
    const failure = new RemoteClientError("Connection reset", 0, "request_failed", {
      requestPhase: "dispatched",
      requestMayHaveCommitted: true,
    });
    const authority = testAuthority({
      mintWebSocketTicket: async () => {
        throw failure;
      },
    });
    const { client, requests } = buildClient([() => ticketResponse("child-a")], authority);

    await expect(client.websocketTicket()).rejects.toBe(failure);
    expect(isRemoteEnvironmentNeedsRepairError(failure)).toBe(false);
    expect(requests).toHaveLength(1);
    expect(new URL(client.websocketUrl("child-a", 0)).searchParams.get("parentTicket")).toBeNull();
  });

  it("maps a definite parent ticket rejection to needs-repair(parent)", async () => {
    const rejection = new RemoteClientError("Invalid access token.", 401, "invalid_access_token");
    const authority = testAuthority({
      mintWebSocketTicket: async () => {
        throw rejection;
      },
    });
    const { client, requests } = buildClient([() => ticketResponse("child-a")], authority);

    const error = await client.websocketTicket().catch((cause: unknown) => cause);
    expect(error).toMatchObject({ status: 401, code: REMOTE_ENVIRONMENT_PARENT_NEEDS_REPAIR });
    expect(isRemoteEnvironmentNeedsRepairError(error)).toBe(true);
    expect((error as Error).cause).toBe(rejection);
    expect(requests).toHaveLength(1);
    expect(new URL(client.websocketUrl("child-a", 0)).searchParams.get("parentTicket")).toBeNull();
  });

  it("preserves a parent ticket scope rejection without claiming revocation", async () => {
    const rejection = new RemoteClientError(
      "Access token does not grant this operation.",
      403,
      "missing_scope",
    );
    const authority = testAuthority({
      mintWebSocketTicket: async () => {
        throw rejection;
      },
    });
    const { client } = buildClient([() => ticketResponse("child-a")], authority);

    await expect(client.websocketTicket()).rejects.toBe(rejection);
    expect(isRemoteEnvironmentNeedsRepairError(rejection)).toBe(false);
  });

  it("bounds the ticket pairing cache with TTL eviction", async () => {
    const authority = testAuthority();
    let child = 0;
    const handlers = Array.from(
      { length: ENVIRONMENT_PARENT_TICKET_CACHE_MAX_ENTRIES + 1 },
      () => () => ticketResponse(`child-${(child += 1)}`),
    );
    const { client } = buildClient(handlers, authority);

    const minted: string[] = [];
    for (let index = 0; index < ENVIRONMENT_PARENT_TICKET_CACHE_MAX_ENTRIES + 1; index += 1) {
      minted.push(await client.websocketTicket());
    }

    const oldest = minted[0];
    const newest = minted[minted.length - 1];
    expect(oldest).toBeDefined();
    expect(newest).toBeDefined();
    expect(
      new URL(client.websocketUrl(newest!, 0)).searchParams.get("parentTicket"),
    ).not.toBeNull();
    expect(new URL(client.websocketUrl(oldest!, 0)).searchParams.get("parentTicket")).toBeNull();
  });

  it("does not delete a minted pairing when the same client disposes", async () => {
    const { client } = buildClient([() => ticketResponse("child-a")]);
    const ticket = await client.websocketTicket();
    expect(new URL(client.websocketUrl(ticket, 0)).searchParams.get("parentTicket")).toBe(
      "parent-ws-1",
    );
    client.dispose();
    expect(new URL(client.websocketUrl(ticket, 0)).searchParams.get("parentTicket")).toBeNull();
  });
});

function endpointPath(): string {
  return `/api/environments/${TEST_ENVIRONMENT_ID}/proxy`;
}
