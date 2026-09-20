import { z } from "zod";
import { parseRetryAfter } from "../formatters";
import type { HostPort } from "../host";
import type { UsageSnapshot, UsageWindow } from "../types";

// The CLI's private Connect-RPC endpoint; reject schema drift and redirects
// without echoing responses, which can contain account data.
// Response structure: OpenUsage Tests/OpenUsageTests/DevinProviderTests.swift.
const percent = z.number().min(0).max(100);
const timestamp = z
  .union([z.number(), z.string().regex(/^\d+$/)])
  .transform(Number)
  .pipe(
    z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER / 1000),
  );
const planStatusSchema = z.object({
  planInfo: z
    .object({
      planName: z.string().optional(),
      hideDailyQuota: z.boolean().optional(),
    })
    .optional(),
  dailyQuotaRemainingPercent: percent.optional(),
  weeklyQuotaRemainingPercent: percent.optional(),
  dailyQuotaResetAtUnix: timestamp.optional(),
  weeklyQuotaResetAtUnix: timestamp.optional(),
  overageBalanceMicros: z
    .union([z.number(), z.string().regex(/^\d+$/)])
    .transform(Number)
    .pipe(z.number().nonnegative().finite())
    .optional(),
});
const statusSchema = z.object({ userStatus: z.object({ planStatus: planStatusSchema }) });

export function parseDevinUsage(data: unknown, now: number): UsageSnapshot {
  const parsed = statusSchema.safeParse(data);
  const base = { providerId: "devin", fetchedAt: now, windows: [] };
  if (!parsed.success) return { ...base, status: "error" };
  const value = parsed.data.userStatus.planStatus;
  const plan = value.planInfo;
  const windows: UsageWindow[] = [];
  const add = (
    id: "daily" | "weekly",
    remaining: number | undefined,
    reset: number | undefined,
  ) => {
    if (remaining === undefined) return;
    windows.push({
      id,
      label: id === "daily" ? "Daily" : "Weekly",
      usedPercent: 100 - remaining,
      ...(reset !== undefined ? { resetsAt: reset * 1000 } : {}),
    });
  };
  if (!plan?.hideDailyQuota)
    add("daily", value.dailyQuotaRemainingPercent, value.dailyQuotaResetAtUnix);
  add("weekly", value.weeklyQuotaRemainingPercent, value.weeklyQuotaResetAtUnix);
  if (!windows.length) return { ...base, status: plan?.planName ? "unsupported" : "error" };
  return {
    ...base,
    status: "ok",
    windows,
    ...(plan?.planName ? { plan: plan.planName } : {}),
    // This is a remaining balance, not spend; displaying it as used would
    // invert the meaning of the meter.
    ...(value.overageBalanceMicros
      ? { credits: { balance: value.overageBalanceMicros / 1_000_000, currency: "USD" } }
      : {}),
  };
}

export async function collectDevin(host: HostPort): Promise<UsageSnapshot> {
  const now = host.now();
  const base = { providerId: "devin", fetchedAt: now, windows: [] };
  const token = await host.credentials.getOAuthToken("devin");
  if (!token?.accessToken) return { ...base, status: "auth-missing" };
  try {
    const configured = token.raw?.baseUrl;
    const url = new URL(typeof configured === "string" ? configured : "https://server.codeium.com");
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
      return { ...base, status: "error" };
    url.pathname = "/exa.seat_management_pb.SeatManagementService/GetUserStatus";
    const response = await host.http.request({
      method: "POST",
      url: url.toString(),
      redirect: "error",
      headers: { "Content-Type": "application/json", "Connect-Protocol-Version": "1" },
      // The endpoint rejects key-only requests. This is the cloud protocol
      // compatibility version, not the independently versioned CLI build.
      body: JSON.stringify({
        metadata: {
          apiKey: token.accessToken,
          ideName: "devin",
          ideVersion: "1.108.2",
          extensionName: "devin",
          extensionVersion: "1.108.2",
          locale: "en",
        },
      }),
      timeoutMs: 15_000,
    });
    if (response.status === 401 || response.status === 403)
      return { ...base, status: "auth-missing" };
    if (response.status === 429) {
      const retry = parseRetryAfter(response.headers["retry-after"], now);
      return {
        ...base,
        status: "rate-limited",
        ...(retry !== undefined ? { rateLimitedUntil: retry } : {}),
      };
    }
    if (response.status < 200 || response.status >= 300) return { ...base, status: "error" };
    return parseDevinUsage(JSON.parse(response.body), now);
  } catch {
    return { ...base, status: "error" };
  }
}
