import { describe, expect, it } from "vitest";
import type { HttpClient, HttpRequest, HttpResponse } from "./host";
import {
  fetchOpenCodeSubscriptionText,
  isOpenCodeSessionLive,
  looksLikeOpenCodeSubscription,
  openCodeRequestCookie,
  workspaceIdsFromText,
} from "./openCodeWeb";

function stubHttp(responder: (req: HttpRequest) => HttpResponse): {
  http: HttpClient;
  calls: HttpRequest[];
} {
  const calls: HttpRequest[] = [];
  return {
    calls,
    http: {
      request(req: HttpRequest): Promise<HttpResponse> {
        calls.push(req);
        return Promise.resolve(responder(req));
      },
    },
  };
}

const ok = (body: string): HttpResponse => ({ status: 200, headers: {}, body });

describe("openCodeRequestCookie", () => {
  it("keeps only the opencode auth cookies", () => {
    expect(openCodeRequestCookie("auth=tok; theme=dark; __Host-auth=x")).toBe(
      "auth=tok; __Host-auth=x",
    );
  });

  it("returns undefined when no auth cookie is present", () => {
    expect(openCodeRequestCookie("theme=dark; ga=123")).toBeUndefined();
    expect(openCodeRequestCookie(undefined)).toBeUndefined();
  });
});

describe("workspaceIdsFromText", () => {
  it("extracts workspace ids from server-fn text", () => {
    expect(workspaceIdsFromText('foo id:"wrk_abc" bar id:"wrk_def"')).toEqual([
      "wrk_abc",
      "wrk_def",
    ]);
  });

  it("falls back to scanning parsed JSON", () => {
    expect(workspaceIdsFromText(JSON.stringify({ a: { b: ["wrk_json"] } }))).toEqual(["wrk_json"]);
  });
});

describe("isOpenCodeSessionLive", () => {
  it("is false without an auth cookie (no request made)", async () => {
    const { http, calls } = stubHttp(() => ok("ignored"));
    expect(await isOpenCodeSessionLive(http, "theme=dark")).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("is false for a signed-out response even when the cookie name matches", async () => {
    // The mid-`/authorize` and stale-cookie case: the cookie is named `auth` but
    // the server reports a public/sign-in page.
    const { http } = stubHttp(() => ok('please <a href="/auth/authorize">login</a>'));
    expect(await isOpenCodeSessionLive(http, "auth=stale")).toBe(false);
  });

  it("is true when the workspace probe resolves an id", async () => {
    const { http, calls } = stubHttp(() => ok('{"data": id:"wrk_live"}'));
    expect(await isOpenCodeSessionLive(http, "auth=real; other=1")).toBe(true);
    // Only the captured auth cookie is forwarded upstream.
    expect(calls[0]?.headers?.Cookie).toBe("auth=real");
  });

  it("propagates probe errors to the caller (treated as not-live upstream)", async () => {
    const http: HttpClient = { request: () => Promise.reject(new Error("network")) };
    await expect(isOpenCodeSessionLive(http, "auth=real")).rejects.toThrow("network");
  });
});

describe("looksLikeOpenCodeSubscription", () => {
  it("requires rollingUsage + usagePercent and rejects signed-out pages", () => {
    expect(
      looksLikeOpenCodeSubscription(
        `rollingUsage:$R[1]={status:"ok",usagePercent:42},weeklyUsage:{usagePercent:1}`,
      ),
    ).toBe(true);
    expect(looksLikeOpenCodeSubscription(`please <a href="/auth/authorize">login</a>`)).toBe(false);
    expect(looksLikeOpenCodeSubscription(`{monthlyUsage:{usagePercent:1}}`)).toBe(false);
  });
});

describe("fetchOpenCodeSubscriptionText", () => {
  it("returns the first successful subscription payload body", async () => {
    const payload =
      `rollingUsage:$R[28]={status:"ok",resetInSec:1,usagePercent:100},` +
      `weeklyUsage:$R[29]={status:"ok",resetInSec:2,usagePercent:79}`;
    const { http, calls } = stubHttp((req) => {
      // First POST encoding succeeds.
      if (req.method === "POST" && req.body?.includes("wrk_test")) return ok(payload);
      return ok("nope");
    });
    await expect(fetchOpenCodeSubscriptionText(http, "auth=tok", "wrk_test")).resolves.toBe(
      payload,
    );
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0]?.headers?.Cookie).toBe("auth=tok");
    expect(calls[0]?.headers?.["X-Server-Id"]).toMatch(/^[a-f0-9]{64}$/);
  });

  it("tries alternate encodings when the first body shape is rejected", async () => {
    let posts = 0;
    const payload = `rollingUsage:{usagePercent:1},weeklyUsage:{usagePercent:2}`;
    const { http } = stubHttp((req) => {
      if (req.method !== "POST") return ok("ignore");
      posts += 1;
      // First encoding fails (empty/error), second succeeds.
      if (posts === 1) return ok('{"error":"bad args"}');
      return ok(payload);
    });
    await expect(fetchOpenCodeSubscriptionText(http, "auth=tok", "wrk_x")).resolves.toBe(payload);
    expect(posts).toBe(2);
  });

  it("returns undefined when every attempt is signed-out or empty", async () => {
    const { http } = stubHttp(() => ok('actor of type "public"'));
    await expect(
      fetchOpenCodeSubscriptionText(http, "auth=stale", "wrk_x"),
    ).resolves.toBeUndefined();
  });
});
