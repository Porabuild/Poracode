import { describe, expect, it } from "vitest";
import type { HttpRequest } from "../host";
import { createFakeHost, FAKE_NOW_MS } from "../testHost";
import {
  ALIBABA_CODING_PLAN_INTL_CONSOLE_RPC_URL,
  ALIBABA_TOKEN_PLAN_INTL_DASHBOARD_URL,
  ALIBABA_CODING_PLAN_CN_QUOTA_URL,
  ALIBABA_CODING_PLAN_INTL_QUOTA_URL,
  collectQwen,
  parseQwenCodingPlanUsage,
} from "./qwen";

const QUOTA_BODY = JSON.stringify({
  data: {
    codingPlanInstanceInfos: [{ planName: "Alibaba Coding Plan Pro", status: "VALID" }],
    codingPlanQuotaInfo: {
      per5HourUsedQuota: 250,
      per5HourTotalQuota: 1000,
      per5HourQuotaNextRefreshTime: FAKE_NOW_MS + 3_600_000,
      perWeekUsedQuota: 800,
      perWeekTotalQuota: 5000,
      perWeekQuotaNextRefreshTime: FAKE_NOW_MS + 86_400_000,
      perBillMonthUsedQuota: 1200,
      perBillMonthTotalQuota: 20_000,
      perBillMonthQuotaNextRefreshTime: FAKE_NOW_MS + 2_592_000_000,
    },
  },
  status_code: 0,
});

const TOKEN_PLAN_BODY = JSON.stringify({
  data: {
    DataV2: {
      data: JSON.stringify({
        code: 0,
        data: {
          per5HourPercentage: 0.03,
          per5HourResetTime: FAKE_NOW_MS + 3_600_000,
          per1WeekPercentage: 0.01,
          per1WeekResetTime: FAKE_NOW_MS + 86_400_000,
        },
        success: true,
      }),
    },
  },
  httpStatusCode: 200,
});

const TOKEN_PLAN_SUBSCRIPTION_BODY = JSON.stringify({
  data: {
    DataV2: {
      data: JSON.stringify({
        code: 0,
        data: {
          instanceCode: "token-plan-instance",
          specCode: "standard",
          status: "VALID",
        },
        success: true,
      }),
    },
  },
  httpStatusCode: 200,
});

describe("parseQwenCodingPlanUsage", () => {
  it("normalizes the current Token Plan percentage windows", () => {
    const snapshot = parseQwenCodingPlanUsage(JSON.parse(TOKEN_PLAN_BODY), FAKE_NOW_MS);
    expect(snapshot).toMatchObject({
      status: "ok",
      windows: [
        {
          id: "session-5h",
          usedPercent: 3,
          resetsAt: FAKE_NOW_MS + 3_600_000,
        },
        { id: "weekly", usedPercent: 1, resetsAt: FAKE_NOW_MS + 86_400_000 },
      ],
    });
  });

  it("normalizes the Coding Plan 5-hour, weekly, and monthly quotas", () => {
    const snapshot = parseQwenCodingPlanUsage(JSON.parse(QUOTA_BODY), FAKE_NOW_MS);
    expect(snapshot.status).toBe("ok");
    expect(snapshot.plan).toBe("Alibaba Coding Plan Pro");
    expect(snapshot.windows.map((window) => window.id)).toEqual([
      "session-5h",
      "weekly",
      "monthly",
    ]);
    expect(snapshot.windows[0]).toMatchObject({
      usedPercent: 25,
      used: 250,
      limit: 1000,
      unit: "requests",
    });
    expect(snapshot.windows[1]?.usedPercent).toBe(16);
    expect(snapshot.windows[2]?.usedPercent).toBe(6);
  });

  it("selects the active plan instance and its nested quota", () => {
    const snapshot = parseQwenCodingPlanUsage(
      {
        data: {
          codingPlanInstanceInfos: [
            {
              planName: "Expired",
              status: "EXPIRED",
              codingPlanQuotaInfo: { per5HourUsedQuota: 99, per5HourTotalQuota: 100 },
            },
            {
              planName: "Active Pro",
              status: "VALID",
              codingPlanQuotaInfo: { per5HourUsedQuota: 52, per5HourTotalQuota: 1000 },
            },
          ],
        },
        statusCode: 200,
      },
      FAKE_NOW_MS,
    );
    expect(snapshot.plan).toBe("Active Pro");
    expect(snapshot.windows[0]?.usedPercent).toBeCloseTo(5.2);
  });

  it("parses a JSON body wrapped inside a console response string", () => {
    const snapshot = parseQwenCodingPlanUsage(
      { successResponse: { body: QUOTA_BODY } },
      FAKE_NOW_MS,
    );
    expect(snapshot.status).toBe("ok");
    expect(snapshot.windows).toHaveLength(3);
  });

  it("keeps an active plan visible without manufacturing quota values", () => {
    const snapshot = parseQwenCodingPlanUsage(
      { data: { codingPlanInstanceInfos: [{ planName: "Pro", status: "VALID" }] } },
      FAKE_NOW_MS,
    );
    expect(snapshot).toMatchObject({ status: "ok", plan: "Pro", windows: [] });
  });

  it("maps API rejection and console-login responses without leaking payloads", () => {
    expect(
      parseQwenCodingPlanUsage({ code: 401, message: "invalid api key: secret" }, FAKE_NOW_MS),
    ).toMatchObject({ status: "auth-missing", error: "API key rejected" });
    expect(
      parseQwenCodingPlanUsage({ code: "ConsoleNeedLogin", message: "Please login" }, FAKE_NOW_MS),
    ).toMatchObject({
      status: "auth-missing",
      error: "Token Plan quota requires an Alibaba console session",
    });
  });
});

describe("collectQwen", () => {
  it("prefers a captured Alibaba console session and sends the console RPC form", async () => {
    const requests: HttpRequest[] = [];
    const rpcRoute = { body: TOKEN_PLAN_BODY };
    const host = createFakeHost({
      secrets: {
        qwen: {
          cookie:
            "login_aliyunid_ticket=ticket; login_aliyunid_pk=account; login_aliyunid_csrf=csrf; cna=anon",
          apiKey: "fallback-key",
        },
      },
      routes: {
        [ALIBABA_TOKEN_PLAN_INTL_DASHBOARD_URL]: {
          body: '<html><script>window.config={SEC_TOKEN:"sec-from-page"}</script></html>',
        },
        [ALIBABA_CODING_PLAN_INTL_CONSOLE_RPC_URL]: rpcRoute,
      },
      onRequest: (request) => {
        requests.push(request);
        if (request.url !== ALIBABA_CODING_PLAN_INTL_CONSOLE_RPC_URL) return;
        const form = new URLSearchParams(request.body);
        const api = JSON.parse(form.get("params") ?? "{}").Api;
        rpcRoute.body =
          api === "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/subscription"
            ? TOKEN_PLAN_SUBSCRIPTION_BODY
            : TOKEN_PLAN_BODY;
      },
    });

    expect(await collectQwen(host)).toMatchObject({ status: "ok", plan: "Standard" });
    expect(requests.map((request) => request.url)).toEqual([
      ALIBABA_TOKEN_PLAN_INTL_DASHBOARD_URL,
      ALIBABA_CODING_PLAN_INTL_CONSOLE_RPC_URL,
      ALIBABA_CODING_PLAN_INTL_CONSOLE_RPC_URL,
    ]);
    const rpc = requests[1];
    expect(rpc?.headers?.Cookie).toContain("login_aliyunid_ticket=ticket");
    expect(rpc?.headers?.Authorization).toBeUndefined();
    expect(rpc?.headers?.["x-xsrf-token"]).toBe("csrf");
    const form = new URLSearchParams(rpc?.body);
    expect(form.get("region")).toBe("ap-southeast-1");
    expect(form.get("sec_token")).toBe("sec-from-page");
    expect(JSON.parse(form.get("params") ?? "{}")).toMatchObject({
      Api: "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage",
      Data: {
        cornerstoneParam: { "X-Anonymous-Id": "anon" },
      },
    });
    const subscriptionForm = new URLSearchParams(requests[2]?.body);
    expect(JSON.parse(subscriptionForm.get("params") ?? "{}")).toMatchObject({
      Api: "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/subscription",
      Data: {
        queryInstanceInfoRequest: { commodityCode: "sfm_tokenplansolo_public_intl" },
      },
    });
  });

  it("persists the console's rotated session ticket and replays it on later requests", async () => {
    // Alibaba issues its `login_*` cookies as session cookies, so the browser jar
    // loses them on quit and this sealed copy is all that survives a restart. If
    // the rotation is dropped, the next launch replays a ticket the console has
    // already retired and the provider reads as signed out.
    const requests: HttpRequest[] = [];
    const writes: { key: string; value: string }[] = [];
    const rpcRoute = { body: TOKEN_PLAN_BODY, setCookies: ["login_aliyunid_ticket=rotated-2"] };
    const host = createFakeHost({
      secrets: {
        qwen: { cookie: "login_aliyunid_ticket=captured; cna=anon" },
      },
      routes: {
        [ALIBABA_TOKEN_PLAN_INTL_DASHBOARD_URL]: {
          body: '<html><script>window.config={SEC_TOKEN:"sec"}</script></html>',
          setCookies: ["login_aliyunid_ticket=rotated-1; Path=/; HttpOnly"],
        },
        [ALIBABA_CODING_PLAN_INTL_CONSOLE_RPC_URL]: rpcRoute,
      },
      onRequest: (request) => {
        requests.push(request);
        if (request.url !== ALIBABA_CODING_PLAN_INTL_CONSOLE_RPC_URL) return;
        const api = JSON.parse(new URLSearchParams(request.body).get("params") ?? "{}").Api;
        rpcRoute.body =
          api === "zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/subscription"
            ? TOKEN_PLAN_SUBSCRIPTION_BODY
            : TOKEN_PLAN_BODY;
      },
      onSetSecret: (providerId, key, value) => {
        expect(providerId).toBe("qwen");
        writes.push({ key, value });
      },
    });

    expect(await collectQwen(host)).toMatchObject({ status: "ok" });
    // The dashboard's rotation is replayed on the RPC call, as a browser would.
    expect(requests[1]?.headers?.Cookie).toBe("login_aliyunid_ticket=rotated-1; cna=anon");
    expect(writes).toEqual([{ key: "cookie", value: "login_aliyunid_ticket=rotated-2; cna=anon" }]);
  });

  it("does not persist cookies when the console rejects the captured session", async () => {
    // A rejected session's `Set-Cookie` lines are logout instructions, and a
    // transient failure must not clobber a still-usable ticket.
    const writes: string[] = [];
    const host = createFakeHost({
      secrets: { qwen: { cookie: "login_aliyunid_ticket=captured" } },
      routes: {
        [ALIBABA_TOKEN_PLAN_INTL_DASHBOARD_URL]: {
          status: 403,
          setCookies: ["login_aliyunid_ticket=; Max-Age=0"],
        },
        "https://modelstudio.console.alibabacloud.com/tool/user/info.json": { status: 403 },
      },
      onSetSecret: (_providerId, key) => writes.push(key),
    });

    expect((await collectQwen(host)).status).toBe("auth-missing");
    expect(writes).toEqual([]);
  });

  it("leaves the stored cookie untouched when the console rotates nothing", async () => {
    const writes: string[] = [];
    const host = createFakeHost({
      secrets: { qwen: { cookie: "login_aliyunid_ticket=captured" } },
      routes: {
        [ALIBABA_TOKEN_PLAN_INTL_DASHBOARD_URL]: {
          body: '<html><script>window.config={SEC_TOKEN:"sec"}</script></html>',
        },
        [ALIBABA_CODING_PLAN_INTL_CONSOLE_RPC_URL]: { body: TOKEN_PLAN_BODY },
      },
      onSetSecret: (_providerId, key) => writes.push(key),
    });

    expect((await collectQwen(host)).status).toBe("ok");
    expect(writes).toEqual([]);
  });

  it("falls back to the API key when a captured console session is stale", async () => {
    const requests: string[] = [];
    const host = createFakeHost({
      secrets: {
        qwen: { cookie: "login_aliyunid_ticket=stale; login_aliyunid_pk=account" },
      },
      tokens: { qwen: { accessToken: "qwen-key", raw: { region: "intl" } } },
      routes: {
        [ALIBABA_TOKEN_PLAN_INTL_DASHBOARD_URL]: { status: 403 },
        "https://modelstudio.console.alibabacloud.com/tool/user/info.json": { status: 403 },
        [ALIBABA_CODING_PLAN_INTL_QUOTA_URL]: { body: QUOTA_BODY },
      },
      onRequest: (request) => requests.push(request.url),
    });

    expect((await collectQwen(host)).status).toBe("ok");
    expect(requests.at(-1)).toBe(ALIBABA_CODING_PLAN_INTL_QUOTA_URL);
  });

  it("uses a Qwen-discovered key and its explicit region", async () => {
    let request: HttpRequest | undefined;
    const host = createFakeHost({
      tokens: { qwen: { accessToken: "qwen-key", raw: { region: "cn" } } },
      routes: { [ALIBABA_CODING_PLAN_CN_QUOTA_URL]: { body: QUOTA_BODY } },
      onRequest: (seen) => {
        request = seen;
      },
    });
    const snapshot = await collectQwen(host);
    expect(snapshot.status).toBe("ok");
    expect(request?.url).toBe(ALIBABA_CODING_PLAN_CN_QUOTA_URL);
    expect(request?.headers?.Authorization).toBe("Bearer qwen-key");
    expect(request?.headers?.["x-api-key"]).toBe("qwen-key");
    expect(JSON.parse(request?.body ?? "{}")).toEqual({
      queryCodingPlanInstanceInfoRequest: { commodityCode: "sfm_codingplan_public_cn" },
    });
  });

  it("prefers a securely pasted usage key", async () => {
    const requests: HttpRequest[] = [];
    const host = createFakeHost({
      secrets: { qwen: { apiKey: "pasted" } },
      tokens: { qwen: { accessToken: "native", raw: { region: "intl" } } },
      routes: { [ALIBABA_CODING_PLAN_INTL_QUOTA_URL]: { body: QUOTA_BODY } },
      onRequest: (request) => requests.push(request),
    });
    expect((await collectQwen(host)).status).toBe("ok");
    expect(requests[0]?.headers?.Authorization).toBe("Bearer pasted");
  });

  it("tries both official regions when a pasted key has no region metadata", async () => {
    const requests: string[] = [];
    const host = createFakeHost({
      secrets: { qwen: { apiKey: "pasted" } },
      routes: {
        [ALIBABA_CODING_PLAN_INTL_QUOTA_URL]: { status: 401 },
        [ALIBABA_CODING_PLAN_CN_QUOTA_URL]: { body: QUOTA_BODY },
      },
      onRequest: (request) => requests.push(request.url),
    });
    expect((await collectQwen(host)).status).toBe("ok");
    expect(requests).toEqual([
      ALIBABA_CODING_PLAN_INTL_QUOTA_URL,
      ALIBABA_CODING_PLAN_CN_QUOTA_URL,
    ]);
  });

  it("returns auth-missing without a Qwen or pasted credential", async () => {
    expect((await collectQwen(createFakeHost())).status).toBe("auth-missing");
  });
});
