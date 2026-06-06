import { describe, expect, it } from "vitest";
import { createFakeHost } from "../testHost";
import { collectGrok, parseGrokUsage } from "./grok";
import { GROK_GRPC_EMPTY_FRAME_BYTES, GROK_GRPC_ENDPOINT } from "./grokGrpc";

const NOW = 1_717_000_000_000;

function varint(value: number): number[] {
  const out: number[] = [];
  let next = value >>> 0;
  while (next >= 0x80) {
    out.push((next & 0x7f) | 0x80);
    next >>>= 7;
  }
  out.push(next);
  return out;
}

function frame(message: Uint8Array, flags = 0): Uint8Array {
  const header = Buffer.alloc(5);
  header[0] = flags;
  header.writeUInt32BE(message.length, 1);
  return Uint8Array.from(Buffer.concat([header, message]));
}

function creditsPayload(usedPercent: number, resetEpoch: number): Uint8Array {
  const percent = Buffer.alloc(4);
  percent.writeFloatLE(usedPercent, 0);
  return Uint8Array.from([0x0d, ...percent, 0x10, ...varint(resetEpoch)]);
}

const LIVE_GRPC_BODY = frame(creditsPayload(42.5, 1_800_000_000));

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
  it("collects credits usage from a captured browser cookie", async () => {
    const seen: Array<{ bodyBytes?: Uint8Array; headers?: Record<string, string> }> = [];
    const host = createFakeHost({
      secrets: { grok: { cookie: "sso=abc" } },
      routes: { [GROK_GRPC_ENDPOINT]: { bodyBytes: LIVE_GRPC_BODY } },
      onRequest: (req) => {
        seen.push({
          ...(req.bodyBytes ? { bodyBytes: req.bodyBytes } : {}),
          ...(req.headers ? { headers: req.headers } : {}),
        });
      },
    });

    const snap = await collectGrok(host);

    expect(snap.status).toBe("ok");
    expect(snap.windows[0]).toMatchObject({
      id: "monthly",
      unit: "credits",
      usedPercent: 42.5,
      resetsAt: 1_800_000_000_000,
    });
    expect(seen[0]?.bodyBytes).toEqual(GROK_GRPC_EMPTY_FRAME_BYTES);
    expect(seen[0]?.headers).toMatchObject({
      Cookie: "sso=abc",
      Origin: "https://grok.com",
      Referer: "https://grok.com/?_s=usage",
      Accept: "*/*",
      "Content-Type": "application/grpc-web+proto",
      "x-grpc-web": "1",
      "x-user-agent": "connect-es/2.1.1",
    });
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
