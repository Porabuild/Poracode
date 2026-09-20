import { describe, expect, it } from "vitest";
import type { HttpClient, HttpRequest, HttpResponse } from "./host";
import {
  fetchOpenCodeGoApiUsage,
  OPENCODE_GO_USAGE_ENDPOINT,
  parseOpenCodeGoApiWindows,
} from "./openCodeGoApi";

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

const USAGE_BODY = JSON.stringify({
  usage: {
    rolling: { status: "ok", percent: 9, resetsAt: "2026-09-20T10:00:00.000Z" },
    weekly: { status: "ok", percent: 12, resetsAt: "2026-09-22T00:00:00.000Z" },
    monthly: { status: "ok", percent: 3, resetsAt: "2026-10-01T00:00:00.000Z" },
  },
});

describe("parseOpenCodeGoApiWindows", () => {
  it("maps rolling/weekly/monthly to the canonical window ids with resetsAt", () => {
    expect(parseOpenCodeGoApiWindows(USAGE_BODY)).toEqual([
      {
        id: "session-5h",
        label: "Rolling",
        usedPercent: 9,
        unit: "percent",
        resetsAt: Date.parse("2026-09-20T10:00:00.000Z"),
      },
      {
        id: "weekly",
        label: "Weekly",
        usedPercent: 12,
        unit: "percent",
        resetsAt: Date.parse("2026-09-22T00:00:00.000Z"),
      },
      {
        id: "monthly",
        label: "Monthly",
        usedPercent: 3,
        unit: "percent",
        resetsAt: Date.parse("2026-10-01T00:00:00.000Z"),
      },
    ]);
  });

  it("omits resetsAt when absent or unparseable and clamps percent to 0-100", () => {
    const body = JSON.stringify({
      usage: {
        rolling: { status: "ok", percent: 140, resetsAt: "not-a-date" },
        weekly: { status: "ok", percent: -5 },
      },
    });
    expect(parseOpenCodeGoApiWindows(body)).toEqual([
      { id: "session-5h", label: "Rolling", usedPercent: 100, unit: "percent" },
      { id: "weekly", label: "Weekly", usedPercent: 0, unit: "percent" },
    ]);
  });

  it("returns [] when a core window (rolling/weekly) is missing or non-numeric", () => {
    expect(
      parseOpenCodeGoApiWindows(JSON.stringify({ usage: { monthly: { percent: 3 } } })),
    ).toEqual([]);
    expect(
      parseOpenCodeGoApiWindows(
        JSON.stringify({ usage: { rolling: { percent: "9" }, weekly: { percent: 12 } } }),
      ),
    ).toEqual([]);
  });

  it("returns [] for non-JSON and missing usage envelopes", () => {
    expect(parseOpenCodeGoApiWindows("<html>login</html>")).toEqual([]);
    expect(parseOpenCodeGoApiWindows("{}")).toEqual([]);
    expect(
      parseOpenCodeGoApiWindows(JSON.stringify({ data: { rolling: { percent: 1 } } })),
    ).toEqual([]);
  });
});

describe("fetchOpenCodeGoApiUsage", () => {
  it("sends the key as a Bearer credential to the fixed usage endpoint", async () => {
    const { http, calls } = stubHttp(() => ok(USAGE_BODY));
    const windows = await fetchOpenCodeGoApiUsage(http, "  tok123  ");
    expect(windows).toHaveLength(3);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.url).toBe(OPENCODE_GO_USAGE_ENDPOINT);
    expect(calls[0]?.headers?.Authorization).toBe("Bearer tok123");
    expect(calls[0]?.headers?.Accept).toBe("application/json");
  });

  it("returns undefined for a blank key without making a request", async () => {
    const { http, calls } = stubHttp(() => ok(USAGE_BODY));
    expect(await fetchOpenCodeGoApiUsage(http, "   ")).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("returns undefined on 401/403 (stale key) and other non-200 statuses", async () => {
    const { http: unauth } = stubHttp(() => ({ status: 401, headers: {}, body: "" }));
    expect(await fetchOpenCodeGoApiUsage(unauth, "tok")).toBeUndefined();

    const { http: forbidden } = stubHttp(() => ({ status: 403, headers: {}, body: "" }));
    expect(await fetchOpenCodeGoApiUsage(forbidden, "tok")).toBeUndefined();

    const { http: throttled } = stubHttp(() => ({ status: 429, headers: {}, body: "" }));
    expect(await fetchOpenCodeGoApiUsage(throttled, "tok")).toBeUndefined();
  });

  it("returns undefined for an unparseable 200 body", async () => {
    const { http } = stubHttp(() => ok("{}"));
    expect(await fetchOpenCodeGoApiUsage(http, "tok")).toBeUndefined();
  });

  it("returns undefined on network errors", async () => {
    const http: HttpClient = { request: () => Promise.reject(new Error("offline")) };
    expect(await fetchOpenCodeGoApiUsage(http, "tok")).toBeUndefined();
  });
});
