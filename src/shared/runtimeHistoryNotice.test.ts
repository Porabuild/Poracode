import { describe, expect, it } from "vitest";
import {
  RUNTIME_HISTORY_NOTICE_TOKEN_PREFIX,
  isRuntimeHistoryEpisodeId,
  parseRuntimeHistoryNoticeToken,
  runtimeHistoryNoticeExactToken,
  runtimeHistoryNoticeSuspectToken,
  runtimeHistoryNoticeTokensEqual,
} from "./runtimeHistoryNotice";

describe("runtime history notice tokens", () => {
  const episodeId = "11111111-1111-4111-8111-111111111111";

  it("encodes opaque exact and suspect tokens under the versioned prefix", () => {
    expect(runtimeHistoryNoticeExactToken(episodeId)).toBe(`gap2:e${episodeId}`);
    expect(runtimeHistoryNoticeSuspectToken(0)).toBe("gap2:s0");
    expect(runtimeHistoryNoticeSuspectToken(41)).toBe("gap2:s41");
    expect(runtimeHistoryNoticeExactToken(episodeId)).toContain(
      RUNTIME_HISTORY_NOTICE_TOKEN_PREFIX,
    );
  });

  it("round-trips both token kinds", () => {
    expect(parseRuntimeHistoryNoticeToken(runtimeHistoryNoticeExactToken(episodeId))).toEqual({
      kind: "exact",
      episodeId,
    });
    expect(parseRuntimeHistoryNoticeToken("gap2:s7")).toEqual({ kind: "suspect", epoch: 7 });
    // Case-insensitive UUID input normalizes to the stored lowercase form.
    expect(runtimeHistoryNoticeExactToken(episodeId.toUpperCase())).toBe(`gap2:e${episodeId}`);
  });

  it("refuses malformed, unknown-version, and missing tokens", () => {
    for (const token of [
      undefined,
      null,
      42,
      "",
      "gap1:e" + episodeId,
      "gap3:e" + episodeId,
      "gap2:",
      "gap2:e",
      "gap2:ebanana",
      "gap2:s",
      "gap2:s01",
      "gap2:s-1",
      "gap2:s1.5",
      "gap2:x1",
    ]) {
      expect(parseRuntimeHistoryNoticeToken(token as unknown)).toBeNull();
    }
  });

  it("validates episode ids case-insensitively and rejects non-UUIDs", () => {
    expect(isRuntimeHistoryEpisodeId(episodeId)).toBe(true);
    expect(isRuntimeHistoryEpisodeId(episodeId.toUpperCase())).toBe(true);
    expect(isRuntimeHistoryEpisodeId("not-a-uuid")).toBe(false);
    expect(isRuntimeHistoryEpisodeId(null)).toBe(false);
    expect(() => runtimeHistoryNoticeExactToken("not-a-uuid")).toThrow(/not a UUID/);
    expect(() => runtimeHistoryNoticeSuspectToken(-1)).toThrow(/non-negative/);
  });

  it("compares tokens by normalized identity, never by raw bytes", () => {
    expect(
      runtimeHistoryNoticeTokensEqual(
        runtimeHistoryNoticeExactToken(episodeId),
        `gap2:e${episodeId.toUpperCase()}`,
      ),
    ).toBe(true);
    expect(runtimeHistoryNoticeTokensEqual("gap2:s7", "gap2:s7")).toBe(true);
    expect(runtimeHistoryNoticeTokensEqual("gap2:s7", "gap2:s8")).toBe(false);
    expect(runtimeHistoryNoticeTokensEqual("gap2:s7", "gap2:e" + episodeId)).toBe(false);
    expect(runtimeHistoryNoticeTokensEqual("gap2:s7", "malformed")).toBe(false);
    expect(runtimeHistoryNoticeTokensEqual(undefined, "gap2:s7")).toBe(false);
  });
});
