import { describe, expect, it } from "vitest";
import { redactPairingUrlForLog } from "./DesktopRemoteAccessController";

describe("redactPairingUrlForLog", () => {
  it("keeps the URL shape but elides the live pairing credential", () => {
    const url =
      "http://192.168.1.20:49152/#token=lc_pair_A-b_C.d_efghijklmnopqrstuvwxyz0123456789-A-b_C";
    const redacted = redactPairingUrlForLog(url);
    expect(redacted).toBe("http://192.168.1.20:49152/#token=lc_pair_[redacted]");
    expect(redacted).not.toContain("lc_pair_A");
  });

  it("redacts unrecognized credentials whole", () => {
    expect(redactPairingUrlForLog("http://host:1/#token=not-a-known-prefix")).toBe(
      "http://host:1/#token=[redacted]",
    );
  });

  it("redacts URLs that carry no parsable credential", () => {
    expect(redactPairingUrlForLog("http://host:1/#fragment")).toBe("<pairing URL redacted>");
    expect(redactPairingUrlForLog("not a url at all")).toBe("<pairing URL redacted>");
  });
});
