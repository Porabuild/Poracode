import { describe, expect, it } from "vitest";
import {
  PORACODE_ACP_USAGE_BREAKDOWN_META_KEY,
  acpUsageBreakdownForUsedTokens,
  readAcpUsageBreakdownMeta,
} from "./usageMeta";

describe("readAcpUsageBreakdownMeta", () => {
  it("reads a valid annotation", () => {
    expect(
      readAcpUsageBreakdownMeta({
        [PORACODE_ACP_USAGE_BREAKDOWN_META_KEY]: { inputTokens: 12_659, outputTokens: 74 },
      }),
    ).toEqual({ inputTokens: 12_659, outputTokens: 74 });
  });

  it("rejects missing, non-object, and array metadata", () => {
    expect(readAcpUsageBreakdownMeta(undefined)).toBeUndefined();
    expect(readAcpUsageBreakdownMeta(null)).toBeUndefined();
    expect(readAcpUsageBreakdownMeta("meta")).toBeUndefined();
    expect(readAcpUsageBreakdownMeta([])).toBeUndefined();
    expect(
      readAcpUsageBreakdownMeta({ [PORACODE_ACP_USAGE_BREAKDOWN_META_KEY]: [1, 2] }),
    ).toBeUndefined();
    expect(
      readAcpUsageBreakdownMeta({ other: { inputTokens: 1, outputTokens: 2 } }),
    ).toBeUndefined();
  });

  it("rejects malformed breakdown fields", () => {
    const annotated = (breakdown: unknown) => ({
      [PORACODE_ACP_USAGE_BREAKDOWN_META_KEY]: breakdown,
    });
    expect(readAcpUsageBreakdownMeta(annotated(undefined))).toBeUndefined();
    expect(readAcpUsageBreakdownMeta(annotated({ inputTokens: 1 }))).toBeUndefined();
    expect(readAcpUsageBreakdownMeta(annotated({ outputTokens: 1 }))).toBeUndefined();
    expect(
      readAcpUsageBreakdownMeta(annotated({ inputTokens: "1", outputTokens: 2 })),
    ).toBeUndefined();
    // Floats, negatives, and unsafe magnitudes must never become occupancy data.
    expect(
      readAcpUsageBreakdownMeta(annotated({ inputTokens: 1.5, outputTokens: 2 })),
    ).toBeUndefined();
    expect(
      readAcpUsageBreakdownMeta(annotated({ inputTokens: -1, outputTokens: 2 })),
    ).toBeUndefined();
    expect(
      readAcpUsageBreakdownMeta(
        annotated({ inputTokens: Number.MAX_SAFE_INTEGER + 1, outputTokens: 0 }),
      ),
    ).toBeUndefined();
    expect(
      readAcpUsageBreakdownMeta(annotated({ inputTokens: NaN, outputTokens: 0 })),
    ).toBeUndefined();
  });
});

describe("acpUsageBreakdownForUsedTokens", () => {
  const meta = {
    [PORACODE_ACP_USAGE_BREAKDOWN_META_KEY]: { inputTokens: 12_659, outputTokens: 74 },
  };

  it("accepts an annotation that sums exactly to the authoritative used count", () => {
    expect(acpUsageBreakdownForUsedTokens(meta, 12_733)).toEqual({
      inputTokens: 12_659,
      outputTokens: 74,
    });
  });

  it("accepts an all-zero annotation against a zero used count", () => {
    expect(
      acpUsageBreakdownForUsedTokens(
        { [PORACODE_ACP_USAGE_BREAKDOWN_META_KEY]: { inputTokens: 0, outputTokens: 0 } },
        0,
      ),
    ).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it("drops annotations that mismatch the authoritative used count", () => {
    expect(acpUsageBreakdownForUsedTokens(meta, 12_734)).toBeUndefined();
    expect(
      acpUsageBreakdownForUsedTokens(
        { [PORACODE_ACP_USAGE_BREAKDOWN_META_KEY]: { inputTokens: 5, outputTokens: 5 } },
        11,
      ),
    ).toBeUndefined();
  });

  it("drops annotations when there is no authoritative used count", () => {
    // Without `used` the breakdown must never backfill occupancy via the sum.
    expect(acpUsageBreakdownForUsedTokens(meta, undefined)).toBeUndefined();
  });

  it("drops malformed metadata", () => {
    expect(acpUsageBreakdownForUsedTokens(undefined, 12_733)).toBeUndefined();
    expect(acpUsageBreakdownForUsedTokens({ other: 1 }, 12_733)).toBeUndefined();
  });
});
