import { describe, expect, it } from "vitest";
import { RemoteDesktopClient } from "./client";
import { RemoteClientError } from "./clientErrors";
import {
  environmentProjection,
  errorResponse,
  jsonResponse,
  scriptedFetch,
  type CapturedRequest,
} from "./clientEnvironments.testSupport";

const endpoint = "http://127.0.0.1:38987/";
const environmentId = "11111111-1111-4111-8111-111111111111";
const environmentPath = `/api/environments/${environmentId}`;

function client(handlers: readonly ((request: CapturedRequest) => Response | Promise<Response>)[]) {
  const scripted = scriptedFetch(handlers);
  return {
    requests: scripted.requests,
    client: new RemoteDesktopClient(endpoint, "child-access", scripted.fetchImpl),
  };
}

const projection = environmentProjection();

describe("RemoteClientEnvironmentsApi", () => {
  it("lists and gets environments on the bound host authority", async () => {
    const script = client([
      () => jsonResponse({ environments: [projection] }),
      () => jsonResponse({ environment: projection }),
    ]);

    await expect(script.client.listEnvironments()).resolves.toEqual([projection]);
    await expect(script.client.getEnvironment(environmentId)).resolves.toEqual(projection);

    expect(script.requests[0]?.method).toBe("GET");
    expect(script.requests[0]?.url.pathname).toBe("/api/environments");
    expect(script.requests[0]?.headers.authorization).toBe("Bearer child-access");
    expect(script.requests[1]?.method).toBe("GET");
    expect(script.requests[1]?.url.pathname).toBe(environmentPath);
  });

  it("creates, updates, connects, disconnects, upgrades, and deletes with the route contract", async () => {
    const createBody = { label: "Build box", target: "user@example-host" };
    const script = client([
      () => jsonResponse({ environment: projection }),
      () => jsonResponse({ environment: projection }),
      () => jsonResponse({ environment: projection }),
      () => jsonResponse({ environment: projection }),
      () => jsonResponse({ environment: projection }),
      () => jsonResponse({ ok: true }),
    ]);

    await script.client.createEnvironment(createBody);
    await script.client.updateEnvironment(environmentId, {
      expectedRevision: 1,
      patch: { label: "Renamed" },
    });
    await script.client.connectEnvironment(environmentId);
    await script.client.disconnectEnvironment(environmentId);
    await script.client.upgradeEnvironment(environmentId, { expectedRevision: 1 });
    await expect(
      script.client.deleteEnvironment(environmentId, { expectedRevision: 1 }),
    ).resolves.toBeUndefined();

    expect(script.requests.map((request) => [request.method, request.url.pathname])).toEqual([
      ["POST", "/api/environments"],
      ["POST", environmentPath],
      ["POST", `${environmentPath}/connect`],
      ["POST", `${environmentPath}/disconnect`],
      ["POST", `${environmentPath}/upgrade`],
      ["POST", `${environmentPath}/delete`],
    ]);
    expect(script.requests[0]?.body).toEqual(createBody);
    expect(script.requests[1]?.body).toEqual({ expectedRevision: 1, patch: { label: "Renamed" } });
    expect(script.requests[4]?.body).toEqual({ expectedRevision: 1 });
  });

  it("pairs, mints tickets, probes trust, accepts trust, and adopts legacy connections", async () => {
    const pairing = {
      environmentId,
      endpoint: `/api/environments/${environmentId}/proxy/`,
      pairingCredential: "lc_pair_child",
      childDesktopId: "child-desktop-1",
    };
    const script = client([
      () => jsonResponse({ pairing }),
      () => jsonResponse({ ticket: "lc_ws_parent", expiresAt: "2099-01-01T00:00:00.000Z" }),
      () => jsonResponse({ fingerprint: `SHA256:${"b".repeat(43)}`, keyType: "ssh-ed25519" }),
      () => jsonResponse({ environment: projection }),
      () => jsonResponse({ environment: projection }),
    ]);

    await expect(script.client.pairEnvironment(environmentId)).resolves.toEqual(pairing);
    await expect(script.client.environmentWebSocketTicket(environmentId)).resolves.toEqual({
      ticket: "lc_ws_parent",
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    await expect(script.client.probeEnvironmentTrust(environmentId)).resolves.toEqual({
      fingerprint: `SHA256:${"b".repeat(43)}`,
      keyType: "ssh-ed25519",
    });
    await script.client.acceptEnvironmentTrust(environmentId, {
      expectedRevision: 1,
      fingerprint: `SHA256:${"a".repeat(43)}`,
    });
    await script.client.adoptLegacyEnvironment(environmentId, {
      expectedRevision: 1,
      legacyConnectionId: "22222222-2222-4222-8222-222222222222",
    });

    expect(script.requests.map((request) => request.url.pathname)).toEqual([
      `${environmentPath}/pairing`,
      `${environmentPath}/websocket-ticket`,
      `${environmentPath}/trust-probe`,
      `${environmentPath}/trust-accept`,
      `${environmentPath}/adopt-legacy`,
    ]);
  });

  it("rejects malformed management bodies before dispatch and surfaces server errors verbatim", async () => {
    const invalid = client([() => jsonResponse({ environment: projection })]);
    // A device-local identity path is not part of the strict wire body; the
    // client refuses it before dispatch, so it can never reach a host.
    const withIdentityFile = {
      label: "Box",
      target: "user@example-host",
      identityFile: "/home/me/.ssh/id_ed25519",
    };
    await expect(invalid.client.createEnvironment(withIdentityFile)).rejects.toMatchObject({
      code: "invalid_response",
    });
    expect(invalid.requests).toHaveLength(0);

    const denied = client([() => errorResponse(403, "missing_scope")]);
    await expect(denied.client.listEnvironments()).rejects.toMatchObject({
      status: 403,
      code: "missing_scope",
    });
    expect(denied.requests).toHaveLength(1);
  });

  it("annotates malformed response bodies as an incompatible host, not a crash", async () => {
    const script = client([() => jsonResponse({ environments: [{ nope: true }] })]);
    const error = await script.client.listEnvironments().catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(RemoteClientError);
    expect(error).toMatchObject({ status: 500, code: "invalid_response" });
  });
});
