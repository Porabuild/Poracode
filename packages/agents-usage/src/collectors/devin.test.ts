import type { HttpRequest } from "../host";
import { describe, expect, it, vi } from "vitest";
import { createFakeHost } from "../testHost";
import { collectDevin, parseDevinUsage } from "./devin";

const endpoint =
  "https://server.codeium.com/exa.seat_management_pb.SeatManagementService/GetUserStatus";
const quota = {
  planInfo: { planName: "Pro" },
  dailyQuotaRemainingPercent: 80,
  weeklyQuotaRemainingPercent: 50,
  dailyQuotaResetAtUnix: "1800000000",
};
const response = (planStatus: unknown) => ({ userStatus: { planStatus } });
const pro = response(quota);

describe("Devin quota collector", () => {
  it("maps daily and weekly remaining percentages and reset seconds", () => {
    expect(parseDevinUsage(pro, 1)).toMatchObject({
      status: "ok",
      plan: "Pro",
      windows: [
        { id: "daily", usedPercent: 20, resetsAt: 1800000000000 },
        { id: "weekly", usedPercent: 50 },
      ],
    });
  });
  it("hides the daily quota for weekly-only plans and keeps overage as balance", () => {
    const result = parseDevinUsage(
      response({ ...quota, planInfo: { hideDailyQuota: true }, overageBalanceMicros: "2000000" }),
      1,
    );
    expect(result.windows.map((w) => w.id)).toEqual(["weekly"]);
    expect(result.credits).toEqual({ balance: 2, currency: "USD" });
  });
  it.each([
    null,
    response({ ...quota, dailyQuotaRemainingPercent: 101 }),
    response({ ...quota, weeklyQuotaRemainingPercent: "50" }),
  ])("rejects invalid quota shapes", (body) => {
    expect(parseDevinUsage(body, 1).status).toBe("error");
  });
  it("reports unsupported when the account has no quota windows", () => {
    expect(parseDevinUsage(response({ planInfo: { planName: "Enterprise" } }), 1).status).toBe(
      "unsupported",
    );
    expect(parseDevinUsage({}, 1).status).toBe("error");
  });
  it("does not make requests without credentials", async () => {
    const onRequest = vi.fn<(request: HttpRequest) => void>();
    expect((await collectDevin(createFakeHost({ onRequest }))).status).toBe("auth-missing");
    expect(onRequest).not.toHaveBeenCalled();
  });
  it.each([
    [401, "auth-missing"],
    [403, "auth-missing"],
    [429, "rate-limited"],
    [500, "error"],
  ] as const)("handles HTTP %s", async (status, expected) => {
    const result = await collectDevin(
      createFakeHost({
        tokens: { devin: { accessToken: "example" } },
        routes: { [endpoint]: { status } },
      }),
    );
    expect(result.status).toBe(expected);
  });
  it("posts credentials only to the configured HTTPS origin and forbids redirects", async () => {
    const onRequest = vi.fn<(request: HttpRequest) => void>();
    await collectDevin(
      createFakeHost({
        tokens: {
          devin: { accessToken: "example", raw: { baseUrl: "https://enterprise.example" } },
        },
        onRequest,
      }),
    );
    expect(onRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: endpoint.replace("server.codeium.com", "enterprise.example"),
        redirect: "error",
        body: JSON.stringify({
          metadata: {
            apiKey: "example",
            ideName: "devin",
            ideVersion: "1.108.2",
            extensionName: "devin",
            extensionVersion: "1.108.2",
            locale: "en",
          },
        }),
      }),
    );
  });
  it.each(["http://insecure.example", "https://user:password@example.com", "not a URL"])(
    "does not send tokens to invalid endpoints",
    async (baseUrl) => {
      const onRequest = vi.fn<(request: HttpRequest) => void>();
      expect(
        (
          await collectDevin(
            createFakeHost({
              tokens: { devin: { accessToken: "example", raw: { baseUrl } } },
              onRequest,
            }),
          )
        ).status,
      ).toBe("error");
      expect(onRequest).not.toHaveBeenCalled();
    },
  );
  it("does not expose response bodies in errors", async () => {
    const result = await collectDevin(
      createFakeHost({
        tokens: { devin: { accessToken: "example" } },
        routes: { [endpoint]: { body: "private invalid body" } },
      }),
    );
    expect(result.status).toBe("error");
    expect(JSON.stringify(result)).not.toContain("private");
  });
});
