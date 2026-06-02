import { describe, expect, it } from "vitest";
import type { HttpClient, HttpRequest, HttpResponse } from "./host";
import { isOpenCodeSessionLive, openCodeRequestCookie, workspaceIdsFromText } from "./openCodeWeb";

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
