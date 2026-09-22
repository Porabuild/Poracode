import { afterEach, expect, it } from "vitest";
import {
  ENVIRONMENT_AUTH_AUTHORITY_HEADER,
  ENVIRONMENT_AUTHORIZATION_HEADER,
} from "@/shared/environments";
import {
  startParentHost,
  startUpstream,
  type ParentHostHandle,
} from "@/host/remote/environments/environmentProxyTestFixtures";
import type { CleanupRegistry } from "@/host/remote/portForward/testFixtures";
import { startRelayHost, type RelayHostHandle } from "./relayHost";
import { RelayServer } from "./relayServer";
import { isRelayBoundCredential } from "./relayChannelBinding";

/**
 * Relay traversal for the C1 parent proxy (ADR §5): the parent environment
 * credential is relay-bound at issuance like every other relay access token,
 * so the host-side adapter must unwrap it on the loopback hop — but ONLY for
 * environment proxy traffic. The child bearer is never relay-bound and passes
 * through untouched.
 */

const cleanup: CleanupRegistry = [];

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function startRelayStack(): Promise<{
  readonly relayBase: string;
  readonly host: ParentHostHandle;
  readonly boundParentToken: string;
}> {
  const host = await startParentHost(cleanup);
  const relay = new RelayServer({ host: "127.0.0.1", port: 0 });
  const relayInfo = await relay.start();
  cleanup.push(async () => {
    await relay.dispose();
  });

  const pairing = host.authStore.issuePairingCredential({});
  let relayHost: RelayHostHandle | null = null;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("relay registration timed out")), 5_000);
    relayHost = startRelayHost({
      relayUrl: `ws://127.0.0.1:${relayInfo.port}/host`,
      serverId: "env-proxy-relay",
      secret: "env-proxy-relay-secret",
      localHttpUrl: host.info.httpBaseUrl,
      onRegistered: () => {
        clearTimeout(timer);
        resolve();
      },
    });
  });
  cleanup.push(async () => {
    relayHost?.dispose();
  });

  const relayBase = `http://127.0.0.1:${relayInfo.port}/s/${encodeURIComponent("env-proxy-relay")}`;
  const exchanged = await fetch(`${relayBase}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grantType: "pairing-token", credential: pairing.credential }),
  });
  expect(exchanged.status).toBe(200);
  const boundParentToken = ((await exchanged.json()) as { accessToken: string }).accessToken;
  expect(isRelayBoundCredential(boundParentToken)).toBe(true);
  return { relayBase, host, boundParentToken };
}

it("unwraps the relay-bound parent credential only on the environment proxy path", async () => {
  const { relayBase, host, boundParentToken } = await startRelayStack();
  const upstream = await startUpstream(cleanup);
  host.targets.connect("env-1", upstream.port);

  const childToken = "lc_access_child_raw";
  const proxied = await fetch(`${relayBase}/api/environments/env-1/proxy/api/snapshot`, {
    headers: {
      authorization: `Bearer ${childToken}`,
      [ENVIRONMENT_AUTHORIZATION_HEADER]: `Bearer ${boundParentToken}`,
    },
  });
  expect(proxied.status).toBe(200);
  // The child bearer crossed the relay untouched; the parent credential was
  // unwrapped, authenticated, and consumed — it never reached the child.
  expect(upstream.lastHeaders().authorization).toBe(`Bearer ${childToken}`);
  expect(upstream.lastHeaders()[ENVIRONMENT_AUTHORIZATION_HEADER]).toBeUndefined();

  // Off the proxy path the reserved header is NOT unwrapped: the parent's
  // fail-closed reserved-header rejection owns it instead of ordinary auth.
  const offPath = await fetch(`${relayBase}/api/snapshot`, {
    headers: { [ENVIRONMENT_AUTHORIZATION_HEADER]: `Bearer ${boundParentToken}` },
  });
  expect(offPath.status).toBe(403);
  expect(((await offPath.json()) as { error: { code: string } }).error.code).toBe(
    "environment_header_rejected",
  );
});

it("preserves the parent auth-authority response marker across the relay hop", async () => {
  const { relayBase, host } = await startRelayStack();
  const upstream = await startUpstream(cleanup);
  host.targets.connect("env-1", upstream.port);

  // No parent credential: the parent's own authentication step rejects
  // pre-dial and marks the response; the relay must not drop that response
  // header on the loopback hop (R1).
  const rejected = await fetch(`${relayBase}/api/environments/env-1/proxy/api/snapshot`, {
    headers: { authorization: "Bearer child-token" },
  });
  expect(rejected.status).toBe(401);
  expect(((await rejected.json()) as { error: { code: string } }).error.code).toBe(
    "missing_environment_authorization",
  );
  expect(rejected.headers.get(ENVIRONMENT_AUTH_AUTHORITY_HEADER)).toBe("parent");
  expect(upstream.requestCount()).toBe(0);
});

it("rejects a still-bound parent credential on the direct (non-relay) listener", async () => {
  const { host, boundParentToken } = await startRelayStack();
  const upstream = await startUpstream(cleanup);
  host.targets.connect("env-1", upstream.port);

  const direct = await fetch(
    `${host.info.httpBaseUrl.replace(/\/$/, "")}/api/environments/env-1/proxy/api/snapshot`,
    {
      headers: {
        authorization: "Bearer lc_access_child_raw",
        [ENVIRONMENT_AUTHORIZATION_HEADER]: `Bearer ${boundParentToken}`,
      },
    },
  );
  expect(direct.status).toBe(401);
  expect(upstream.requestCount()).toBe(0);
});
