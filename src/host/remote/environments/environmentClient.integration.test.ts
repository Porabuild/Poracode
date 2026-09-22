import { afterEach, expect, it } from "vitest";
import { RemoteAuthStore, RemoteHttpError } from "@/host/remote/auth";
import {
  startParentHost,
  startUpstream,
} from "@/host/remote/environments/environmentProxyTestFixtures";
import type { CleanupRegistry } from "@/host/remote/portForward/testFixtures";
import { RemoteDesktopClient } from "@/shared/remote/client";
import { RemoteEnvironmentClient } from "@/shared/remote/clientEnvironments";
import { ENVIRONMENT_AUTHORIZATION_HEADER } from "@/shared/environments";

const cleanup: CleanupRegistry = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

it.each([
  {
    name: "expired parent / valid child",
    parentExpired: true,
    childExpired: false,
    parentRotations: 1,
    childRotations: 0,
  },
  {
    name: "valid parent / expired child",
    parentExpired: false,
    childExpired: true,
    parentRotations: 0,
    childRotations: 1,
  },
  {
    name: "both expired",
    parentExpired: true,
    childExpired: true,
    parentRotations: 1,
    childRotations: 1,
  },
])(
  "real proxy recovers only the rejected grants: $name",
  async ({ parentExpired, childExpired, parentRotations, childRotations }) => {
    const parent = await startParentHost(cleanup);
    const parentGrant = parent.authStore.exchangePairingCredential({
      credential: parent.authStore.issuePairingCredential().credential,
      ttlMs: parentExpired ? -1 : 60000,
    });
    const childAuth = new RemoteAuthStore();
    const childGrant = childAuth.exchangePairingCredential({
      credential: childAuth.issuePairingCredential().credential,
      ttlMs: childExpired ? -1 : 60000,
    });
    let childRefreshRequests = 0;
    let childReads = 0;
    let leakedParentHeader = false;
    const upstream = await startUpstream(cleanup, (req, res) => {
      leakedParentHeader ||= req.headers[ENVIRONMENT_AUTHORIZATION_HEADER] !== undefined;
      const reply = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      const fail = (error: unknown) => {
        if (error instanceof RemoteHttpError)
          reply(error.status, { error: { code: error.code, message: error.message } });
        else reply(500, { error: { code: "test_failure", message: String(error) } });
      };
      if (req.url === "/oauth/token") {
        childRefreshRequests += 1;
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const parsed = JSON.parse(body);
            reply(200, childAuth.refreshAccessToken({ refreshToken: parsed.refreshToken }));
          } catch (error) {
            fail(error);
          }
        });
        return;
      }
      try {
        childAuth.authenticateBearerToken(
          req.headers.authorization?.replace(/^Bearer /, "") ?? "",
          ["session:read"],
        );
        childReads += 1;
        reply(200, { environments: [] });
      } catch (error) {
        fail(error);
      }
    });
    parent.targets.connect("env-1", upstream.port);
    let parentToken = parentGrant.accessToken;
    let parentRefresh = parentGrant.refreshToken;
    let parentRotateCount = 0;
    const parentClient = new RemoteDesktopClient(parent.info.httpBaseUrl, parentToken, undefined, {
      tokenLifecycle: {
        refreshToken: () => parentRefresh,
        onTokensRefreshed: (tokens) => {
          parentToken = tokens.accessToken;
          parentRefresh = tokens.refreshToken;
          parentRotateCount += 1;
        },
      },
    });
    let childRefresh = childGrant.refreshToken;
    let childRotateCount = 0;
    const client = new RemoteEnvironmentClient(
      new URL("/api/environments/env-1/proxy/", parent.info.httpBaseUrl).toString(),
      childGrant.accessToken,
      undefined,
      {
        environmentId: "env-1",
        parentAuthority: {
          accessToken: () => parentToken,
          ensureLive: async () => {
            if (!(await parentClient.refreshTokens())) throw new Error("no parent refresh");
          },
          mintWebSocketTicket: async () => {
            throw new Error("unused");
          },
        },
        tokenLifecycle: {
          refreshToken: () => childRefresh,
          onTokensRefreshed: (tokens) => {
            childRefresh = tokens.refreshToken;
            childRotateCount += 1;
          },
        },
      },
    );
    cleanup.push(async () => client.dispose());
    expect(await client.listEnvironments()).toEqual([]);
    expect(parentRotateCount).toBe(parentRotations);
    expect(childRotateCount).toBe(childRotations);
    expect(childRefreshRequests).toBe(childRotations);
    expect(childReads).toBe(1);
    expect(leakedParentHeader).toBe(false);
  },
);
