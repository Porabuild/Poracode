import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScheduleCompletionEvaluationInput } from "@/shared/contracts";
import type { AgentAdapter } from "./agents/base";
import {
  evaluateScheduleCompletion,
  parseScheduleCompletionEvaluation,
} from "./scheduleCompletionEvaluator";

const input: ScheduleCompletionEvaluationInput = {
  projectLocation: { kind: "windows", path: "C:\\repo" },
  agentKind: "codex",
  config: { model: "gpt-5.5", effort: "low", fast: true },
  condition: "Stop when the migration is complete.",
  summary: "The migration completed and all verification passed.",
  changedFiles: ["src/migrate.ts", "src/migrate.test.ts"],
};

function createAdapter(runOneShot: NonNullable<AgentAdapter["runTextOnlyOneShot"]>): AgentAdapter {
  return {
    label: "Codex",
    defaultOneShotModel: "gpt-5.5",
    runTextOnlyOneShot: runOneShot,
  } as AgentAdapter;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("parseScheduleCompletionEvaluation", () => {
  it("parses the exact result shape", () => {
    expect(
      parseScheduleCompletionEvaluation(
        '{"stopMatched":true,"confidence":0.95,"reason":"Migration verified."}',
      ),
    ).toEqual({
      stopMatched: true,
      confidence: 0.95,
      reason: "Migration verified.",
    });
  });

  it("requires adapters to normalize provider transport envelopes", () => {
    expect(() =>
      parseScheduleCompletionEvaluation(
        JSON.stringify({
          type: "result",
          result: '{"stopMatched":false,"confidence":0.4,"reason":"Incomplete."}',
        }),
      ),
    ).toThrow("invalid result");
  });

  it.each([
    '```json\n{"stopMatched":true,"confidence":1,"reason":"Done."}\n```',
    '{"stopMatched":true,"confidence":1,"reason":"Done.","extra":true}',
    '{"stopMatched":true,"confidence":2,"reason":"Done."}',
  ])("rejects non-strict output", (raw) => {
    expect(() => parseScheduleCompletionEvaluation(raw)).toThrow(
      /Schedule completion evaluation returned (?:invalid JSON|an invalid result)/,
    );
  });
});

describe("evaluateScheduleCompletion", () => {
  it("passes the scheduled model configuration and returns the validated result", async () => {
    const runOneShot = vi
      .fn<NonNullable<AgentAdapter["runTextOnlyOneShot"]>>()
      .mockResolvedValue(
        '{"stopMatched":true,"confidence":0.9,"reason":"The migration completed."}',
      );

    await expect(evaluateScheduleCompletion(input, createAdapter(runOneShot))).resolves.toEqual({
      stopMatched: true,
      confidence: 0.9,
      reason: "The migration completed.",
    });

    expect(runOneShot).toHaveBeenCalledWith(
      expect.objectContaining({
        location: input.projectLocation,
        selection: input.config,
        prompt: expect.stringContaining('"condition":"Stop when the migration is complete."'),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("aborts a structured one-shot after 45 seconds", async () => {
    vi.useFakeTimers();
    const runOneShot = vi.fn<NonNullable<AgentAdapter["runTextOnlyOneShot"]>>(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            },
            { once: true },
          );
        }),
    );

    const pending = evaluateScheduleCompletion(input, createAdapter(runOneShot));
    const rejection = pending.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(44_999);
    expect(runOneShot.mock.calls[0]?.[0].signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await rejection).toMatchObject({ name: "AbortError", message: "aborted" });
    expect(runOneShot.mock.calls[0]?.[0].signal?.aborted).toBe(true);
  });
});
