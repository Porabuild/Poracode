import { describe, expect, it } from "vitest";
import { getUtilityTaskCandidates, type UtilityTaskCandidateAgent } from "./utilityTask";

function candidate(overrides: Partial<UtilityTaskCandidateAgent> = {}): UtilityTaskCandidateAgent {
  return {
    kind: "kimi",
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: [{ id: "kimi-model" }],
    },
    ...overrides,
  };
}

const noDefaults = () => undefined;

describe("getUtilityTaskCandidates", () => {
  it("excludes an install whose probe reached no verdict and carries no models", () => {
    const unverified: UtilityTaskCandidateAgent = {
      kind: "cursor-sdk",
      installed: true,
      authState: "unknown",
      capabilities: { models: [] },
    };

    // Admitting it would resolve to an empty model and a failed run, so an
    // install detection could not verify must never be offered as a candidate.
    expect(getUtilityTaskCandidates([unverified], "auto", noDefaults)).toEqual([]);
    expect(getUtilityTaskCandidates([unverified], "cursor-sdk", noDefaults)).toEqual([]);
  });

  it("keeps excluding signed-out providers", () => {
    const signedOut = candidate({ authState: "missing" });

    expect(getUtilityTaskCandidates([signedOut], "auto", noDefaults)).toEqual([]);
  });

  it("keeps verified providers with models eligible", () => {
    const eligible = candidate();

    expect(getUtilityTaskCandidates([eligible], "auto", noDefaults)).toEqual([eligible]);
    expect(getUtilityTaskCandidates([eligible], "kimi", noDefaults)).toEqual([eligible]);
  });
});
