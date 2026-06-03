import { describe, expect, it } from "vitest";
import { decodeProto, extractGrokBilling, unframeGrpcWebText } from "./grokGrpc";

// Real `GetGrokBuildBillingConfig` message captured live from a SuperGrok
// account showing "25% used · Resets May 31" (base64 of the unframed protobuf):
// config.monthlyLimit=20000, used=4933, periodStart=2026-05-01, periodEnd=2026-05-31.
const REAL_MESSAGE_B64 =
  "CkoKBAignAESAwjFJhoAIgYIgNrPzwYqBgiAl/PQBjINCgUI6g8QBBIAGgAiADINCgUI6g8QAxIAGgAiADINCgUI6g8QAhIAGgAiAA==";
const REAL_MESSAGE = Uint8Array.from(Buffer.from(REAL_MESSAGE_B64, "base64"));

/** Wrap a message in a gRPC-web data frame and base64-encode it (grpc-web-text). */
function frameToBase64(message: Uint8Array): string {
  const len = message.length;
  const header = [0x00, (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff];
  return Buffer.from(Uint8Array.from([...header, ...message])).toString("base64");
}

describe("grok gRPC-web parsing", () => {
  it("decodes the top-level config message", () => {
    const fields = decodeProto(REAL_MESSAGE);
    expect(fields[0]!.field).toBe(1);
    expect(fields[0]!.type).toBe("len");
  });

  it("unframes a grpc-web-text body back to the message", () => {
    const recovered = unframeGrpcWebText(frameToBase64(REAL_MESSAGE));
    expect(recovered).toEqual(REAL_MESSAGE);
  });

  it("extracts used/limit credits and the period reset from the live fixture", () => {
    const billing = extractGrokBilling(REAL_MESSAGE, 1_780_186_184_382);
    expect(billing.limit).toBe(20000);
    expect(billing.used).toBe(4933);
    // periodEnd 1780272000s → ms; periodStart 1777593600s → ms (31-day cycle).
    expect(billing.resetsAt).toBe(1_780_272_000_000);
    expect(billing.periodStartMs).toBe(1_777_593_600_000);
    // 4933 / 20000 ≈ 24.7% used.
    expect(Math.round((billing.used! / billing.limit!) * 100)).toBe(25);
  });

  it("returns undefined when there is no complete data frame", () => {
    expect(unframeGrpcWebText(Buffer.from([0, 0, 0]).toString("base64"))).toBeUndefined();
    expect(
      unframeGrpcWebText(Buffer.from([0, 0, 0, 0, 9, 1, 2]).toString("base64")),
    ).toBeUndefined();
  });
});
