import { describe, expect, it } from "vitest";
import { parseJudgeResponse } from "./experimentJudge";

describe("parseJudgeResponse", () => {
  it("parses a clean JSON object", () => {
    const result = parseJudgeResponse('{"winner": 2, "rationale": "Most complete fix."}', 3);
    expect(result).toEqual({ winnerIndex: 1, rationale: "Most complete fix." });
  });

  it("strips code fences and thinking tags", () => {
    const raw =
      '<think>comparing diffs…</think>\n```json\n{"winner": 1, "rationale": "Cleaner."}\n```';
    expect(parseJudgeResponse(raw, 2)).toEqual({ winnerIndex: 0, rationale: "Cleaner." });
  });

  it("extracts a JSON object embedded in prose", () => {
    const raw = 'Here is my pick: {"winner": 3, "rationale": "Best tests."} — done.';
    expect(parseJudgeResponse(raw, 3)).toEqual({ winnerIndex: 2, rationale: "Best tests." });
  });

  it("clamps an out-of-range winner to the first candidate", () => {
    const result = parseJudgeResponse('{"winner": 9, "rationale": "x"}', 2);
    expect(result.winnerIndex).toBe(0);
  });

  it("falls back to candidate 1 with a default rationale on garbage", () => {
    const result = parseJudgeResponse("the agents all did fine honestly", 3);
    expect(result.winnerIndex).toBe(0);
    expect(result.rationale.length).toBeGreaterThan(0);
  });

  it("recovers winner + rationale from loose key/value text", () => {
    const result = parseJudgeResponse("winner: 2\nrationale: solid approach", 3);
    expect(result.winnerIndex).toBe(1);
    expect(result.rationale).toContain("solid approach");
  });
});
