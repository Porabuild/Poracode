import { describe, expect, it } from "vitest";
import { createFakeHost } from "../testHost";
import { collectGrok, isGrokSessionLive, parseGrokUsage } from "./grok";
import { GROK_GRPC_ENDPOINT } from "./grokGrpc";

const NOW = 1_717_000_000_000;
const LIVE_GRPC_MESSAGE_B64 =
  "CkoKBAignAESAwjFJhoAIgYIgNrPzwYqBgiAl/PQBjINCgUI6g8QBBIAGgAiADINCgUI6g8QAxIAGgAiADINCgUI6g8QAhIAGgAiAA==";

function frameToBase64(messageB64: string): string {
  const message = Buffer.from(messageB64, "base64");
  const header = Buffer.alloc(5);
  header.writeUInt32BE(message.length, 1);
  return Buffer.concat([header, message]).toString("base64");
}

const LIVE_GRPC_BODY = frameToBase64(LIVE_GRPC_MESSAGE_B64);

describe("parseGrokUsage", () => {
  it("maps the /billing config block to a monthly credits window", () => {
    const billing = {
      config: {
        monthlyLimit: { val: 60_000 },
        used: { val: 4277 },
        onDemandCap: { val: 0 },
        billingPeriodStart: "2026-05-01T00:00:00+00:00",
        billingPeriodEnd: "2026-06-01T00:00:00+00:00",
      },
    };
    const settings = { tier: { displayName: "SuperGrok" } };
    const snap = parseGrokUsage(billing, settings, NOW);

    expect(snap.providerId).toBe("grok");
    expect(snap.status).toBe("ok");
    expect(snap.plan).toBe("SuperGrok");

    const w = snap.windows[0]!;
    expect(w.id).toBe("monthly");
    expect(w.unit).toBe("credits");
    expect(w.used).toBe(4277);
    expect(w.limit).toBe(60_000);
    expect(w.usedPercent).toBeCloseTo((4277 / 60_000) * 100);
    expect(w.resetsAt).toBe(Date.parse("2026-06-01T00:00:00+00:00"));
  });

  it("handles a missing config without throwing", () => {
    const snap = parseGrokUsage({}, undefined, NOW);
    expect(snap.status).toBe("ok");
    expect(snap.windows[0]!.usedPercent).toBe(0);
    expect(snap.plan).toBeUndefined();
  });
});

describe("collectGrok cookie session", () => {
  it("checks whether a browser cookie authenticates to grok.com", async () => {
    const host = createFakeHost({
      routes: { [GROK_GRPC_ENDPOINT]: { body: LIVE_GRPC_BODY } },
    });
    await expect(isGrokSessionLive(host.http, "sso=abc")).resolves.toBe(true);
  });

  it("keeps the stored session on a transient failure (no token to fall back to)", async () => {
    // A stored grok.com cookie whose check 5xx's, with no CLI token. This must
    // not read as signed out: report a preserved `error`, not auth-missing, so a
    // blip (e.g. a not-yet-ready network at startup) never forces a re-login.
    const host = createFakeHost({
      secrets: { grok: { cookie: "sso=abc" } },
      routes: { [GROK_GRPC_ENDPOINT]: { status: 500 } },
    });
    const snap = await collectGrok(host);
    expect(snap.status).toBe("error");
    expect(snap.windows).toEqual([]);
  });

  it("reports auth-missing when the cookie is hard-rejected and there is no token", async () => {
    const host = createFakeHost({
      secrets: { grok: { cookie: "sso=expired" } },
      routes: { [GROK_GRPC_ENDPOINT]: { status: 401 } },
    });
    const snap = await collectGrok(host);
    expect(snap.status).toBe("auth-missing");
  });
});
