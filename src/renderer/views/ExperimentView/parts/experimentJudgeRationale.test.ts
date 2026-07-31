import { describe, expect, it } from "vitest";
import { replaceExperimentSolutionReferences } from "./experimentJudgeRationale";

const candidates = [
  "Claude Code · Opus 4.8 · Low (Solution 1)",
  "Codex · GPT-5.6 · High (Solution 2)",
  "Grok Build · Grok 4.5 · High (Solution 3)",
];

describe("replaceExperimentSolutionReferences", () => {
  it("names singular and repeated candidate references", () => {
    expect(
      replaceExperimentSolutionReferences(
        "Solution 3 is safer than Solution 1, while solution 2 adds more scope.",
        candidates,
      ),
    ).toBe(
      "Grok Build · Grok 4.5 · High (Solution 3) is safer than Claude Code · Opus 4.8 · Low (Solution 1), while Codex · GPT-5.6 · High (Solution 2) adds more scope.",
    );
  });

  it("names plural candidate references without losing their conjunctions", () => {
    expect(
      replaceExperimentSolutionReferences(
        "Solutions 1, 2, and 3 all cover the core behavior.",
        candidates,
      ),
    ).toBe(
      "Claude Code · Opus 4.8 · Low (Solution 1), Codex · GPT-5.6 · High (Solution 2), and Grok Build · Grok 4.5 · High (Solution 3) all cover the core behavior.",
    );
  });

  it("leaves unknown solution references unchanged", () => {
    expect(replaceExperimentSolutionReferences("Solutions 2 and 4 differ.", candidates)).toBe(
      "Solutions 2 and 4 differ.",
    );
  });
});
