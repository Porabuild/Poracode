import type { HostPort, HttpRequest, HttpResponse } from "@poracode/agents-usage";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ANTIGRAVITY_GOOGLE_TOKEN_URI,
  type AntigravityAcpCredentials,
} from "./antigravityAcpCredentials";
import {
  collectAntigravityCloudUsage,
  resetAntigravityCloudUsageCacheForTests,
} from "./antigravityCloudUsage";

const NOW = 1_717_000_000_000;
const CREDENTIALS: AntigravityAcpCredentials = {
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
};
const SUMMARY = JSON.stringify({
  groups: [
    {
      displayName: "Gemini Models",
      buckets: [
        { window: "5h", remainingFraction: 0.4, resetTime: "2026-06-25T03:51:42Z" },
        { window: "weekly", remainingFraction: 0.8 },
      ],
    },
    {
      displayName: "Claude and GPT models",
      buckets: [
        { window: "5h", remainingFraction: 0.7 },
        { window: "weekly", remainingFraction: 0.9 },
      ],
    },
  ],
});

function response(status: number, body = ""): HttpResponse {
  return { status, headers: {}, body };
}

function hostWith(handler: (request: HttpRequest) => Promise<HttpResponse>): HostPort {
  return {
    http: { request: handler },
    credentials: {
      getOAuthToken: async () => undefined,
      getSecret: async () => undefined,
    },
    now: () => NOW,
  };
}

beforeEach(() => resetAntigravityCloudUsageCacheForTests());

describe("collectAntigravityCloudUsage", () => {
  it("refreshes the ACP credential and returns the four remote quota windows", async () => {
    const requests: HttpRequest[] = [];
    const host = hostWith(async (request) => {
      requests.push(request);
      if (request.url === ANTIGRAVITY_GOOGLE_TOKEN_URI) {
        return response(200, JSON.stringify({ access_token: "access-token", expires_in: 3600 }));
      }
      if (request.url.endsWith(":retrieveUserQuotaSummary")) return response(200, SUMMARY);
      if (request.url.endsWith(":loadCodeAssist")) {
        return response(200, JSON.stringify({ paidTier: { name: "Ultra" } }));
      }
      return response(404);
    });

    const snapshot = await collectAntigravityCloudUsage(NOW, host, CREDENTIALS);

    expect(snapshot).toMatchObject({
      providerId: "antigravity",
      status: "ok",
      plan: "Ultra",
      fetchedAt: NOW,
    });
    expect(snapshot.windows.map((window) => [window.id, window.usedPercent])).toEqual([
      ["antigravity:gemini:session-5h", 60],
      ["antigravity:gemini:weekly", 20],
      ["antigravity:claude:session-5h", 30],
      ["antigravity:claude:weekly", 10],
    ]);
    expect(requests[0]?.body).toContain("refresh_token=refresh-token");
    expect(requests[0]?.redirect).toBe("error");
    expect(requests[1]?.headers?.Authorization).toBe("Bearer access-token");
  });

  it("tries the secondary Cloud Code host after a primary outage", async () => {
    const host = hostWith(async (request) => {
      if (request.url === ANTIGRAVITY_GOOGLE_TOKEN_URI) {
        return response(200, JSON.stringify({ access_token: "access-token" }));
      }
      if (request.url.startsWith("https://daily-cloudcode-pa.googleapis.com")) {
        return response(503);
      }
      if (request.url.endsWith(":retrieveUserQuotaSummary")) return response(200, SUMMARY);
      return response(404);
    });

    expect((await collectAntigravityCloudUsage(NOW, host, CREDENTIALS)).status).toBe("ok");
  });

  it("reports a rejected refresh token as missing authentication", async () => {
    const host = hostWith(async () => response(400));
    await expect(collectAntigravityCloudUsage(NOW, host, CREDENTIALS)).resolves.toMatchObject({
      status: "auth-missing",
      error: "OAuth token rejected (400)",
    });
  });

  it("reports an authenticated summary without quota windows clearly", async () => {
    const host = hostWith(async (request) => {
      if (request.url === ANTIGRAVITY_GOOGLE_TOKEN_URI) {
        return response(200, JSON.stringify({ access_token: "access-token" }));
      }
      return response(200, JSON.stringify({ groups: [] }));
    });
    await expect(collectAntigravityCloudUsage(NOW, host, CREDENTIALS)).resolves.toMatchObject({
      status: "error",
      error: "Cloud Code quota summary returned no windows",
    });
  });

  it("reuses an unexpired access token for subsequent collections", async () => {
    let refreshes = 0;
    const host = hostWith(async (request) => {
      if (request.url === ANTIGRAVITY_GOOGLE_TOKEN_URI) {
        refreshes += 1;
        return response(200, JSON.stringify({ access_token: "access-token", expires_in: 3600 }));
      }
      if (request.url.endsWith(":retrieveUserQuotaSummary")) return response(200, SUMMARY);
      return response(404);
    });

    await collectAntigravityCloudUsage(NOW, host, CREDENTIALS);
    await collectAntigravityCloudUsage(NOW + 1_000, host, CREDENTIALS);
    expect(refreshes).toBe(1);
  });
});
