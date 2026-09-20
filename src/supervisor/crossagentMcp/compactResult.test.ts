import { describe, expect, it } from "vitest";
import {
  compactResultCanContinue,
  compactResultPrompt,
  parseCompactResult,
  type CompactResult,
} from "./compactResult";

function result(overrides: Partial<CompactResult> = {}): CompactResult {
  return {
    version: 1,
    outcome: "completed",
    summary: "Updated the parser and verified malformed input handling.",
    changes: ["Reject malformed records."],
    checks: [{ command: "pnpm exec vitest run parser.test.ts", result: "passed" }],
    findings: [],
    risks: [],
    evidence: ["tmp/check-output.txt"],
    ...overrides,
  };
}

function envelope(value: unknown): string {
  return `\`\`\`crossagents-result\n${JSON.stringify(value)}\n\`\`\``;
}

describe("compactResultPrompt", () => {
  it("preserves the task and requests worker-authored evidence without critical-data truncation", () => {
    const prompt = compactResultPrompt("Review src/parser.ts.");
    expect(prompt.startsWith("Review src/parser.ts.\n")).toBe(true);
    expect(prompt).toContain("Author your own compact result");
    expect(prompt).toContain("at most 500 words");
    expect(prompt).toContain("retain every critical finding and its reference");
    expect(prompt).toContain("16000 characters");
    expect(prompt).toContain("not_run check blocks automatic continuation");
  });
});

describe("parseCompactResult", () => {
  it("preserves all critical findings, checks, references, and whitespace in accepted fields", () => {
    const value = result({
      outcome: "blocked",
      findings: [
        { severity: "important", message: "Records can be lost.", reference: "src/parser.ts:42" },
      ],
      checks: [
        {
          command: "pnpm exec vitest run parser.test.ts",
          result: "failed",
          details: "tmp/check-output.txt:19",
        },
      ],
      risks: ["Pending writes have not been verified."],
      evidence: [" tmp/report.md ", "https://example.com/report"],
    });
    expect(parseCompactResult(`Long execution transcript\n${envelope(value)}\n`)).toEqual({
      result: value,
    });
    expect(parseCompactResult(envelope(value).replaceAll("\n", "\r\n"))).toEqual({ result: value });
  });

  it("reads only the final envelope, even after a large transcript and earlier success sample", () => {
    const final = result({ outcome: "blocked" });
    expect(
      parseCompactResult(`${envelope(result())}\n${"progress\n".repeat(20_000)}${envelope(final)}`),
    ).toEqual({ result: final });
  });

  it.each([
    "No structured result was written.",
    `${envelope(result())}\nAn important failure was found afterward.`,
    `${envelope(result())}\n\`\`\`crossagents-result\n{broken}\n\`\`\``,
    `${envelope(result())}\n\`\`\`crossagents-result\n{`,
    `> ${envelope(result()).replaceAll("\n", "\n> ")}`,
    `\`\`\`markdown\n${envelope(result())}\n\`\`\``,
    envelope(result()).replace("crossagents-result", "json"),
  ])(
    "rejects missing, embedded, or malformed final results without falling back (%#)",
    (output) => {
      expect(parseCompactResult(output)).toHaveProperty("error");
    },
  );

  it.each([
    null,
    [],
    "success",
    {},
    result({ version: 0 as 1 }),
    result({ version: 2 as 1 }),
    { ...result(), version: "1" },
    { ...result(), outcome: "success" },
    { ...result(), summary: " " },
    { ...result(), changes: [null] },
    { ...result(), checks: [{ command: "test", result: "skipped" }] },
    { ...result(), checks: [{ command: "test", result: "passed", details: null }] },
    { ...result(), findings: [{ severity: "warning", message: "Failure" }] },
    { ...result(), findings: [{ severity: "important", message: "" }] },
    { ...result(), risks: "No risks" },
    { ...result(), evidence: [""] },
  ])("rejects incompatible or invalid schema values (%#)", (value) => {
    expect(parseCompactResult(envelope(value))).toHaveProperty("error");
  });

  it.each(Object.keys(result()))("requires field %s", (field) => {
    const value = { ...result() } as Record<string, unknown>;
    delete value[field];
    expect(parseCompactResult(envelope(value))).toHaveProperty("error");
  });

  it.each([
    { ...result(), important_findings: ["Lost writes"] },
    { ...result(), checks: [{ command: "test", result: "passed", failures: ["Lost writes"] }] },
    { ...result(), findings: [{ severity: "nit", message: "Cleanup", critical: "Lost writes" }] },
    JSON.parse(`{"__proto__":{"hidden":"evidence"},${JSON.stringify(result()).slice(1)}`),
  ])("rejects unknown fields instead of stripping evidence (%#)", (value) => {
    expect(parseCompactResult(envelope(value))).toHaveProperty("error");
  });

  it.each([
    `{"findings":[{"severity":"important","message":"Lost writes"}],${JSON.stringify(result()).slice(1)}`,
    JSON.stringify(result()).replace(
      '"outcome":"completed"',
      '"outcome":"blocked","outcome":"completed"',
    ),
    JSON.stringify(result()).replace(
      '"result":"passed"',
      '"result":"failed","resu\\u006ct":"passed"',
    ),
    JSON.stringify(result({ findings: [{ severity: "nit", message: "Cleanup" }] })).replace(
      '"severity":"nit"',
      '"severity":"important","severity":"nit"',
    ),
  ])("rejects duplicate keys that could overwrite critical evidence (%#)", (json) => {
    expect(parseCompactResult(`\`\`\`crossagents-result\n${json}\n\`\`\``)).toEqual({
      error: "Compact result JSON contains duplicate object keys.",
    });
  });

  it("permits repeated keys in distinct objects and punctuation inside text", () => {
    const value = result({
      checks: [
        { command: 'test "{a:[b]}"', result: "passed", details: 'value "result":"failed"' },
        { command: "test-b", result: "passed" },
      ],
    });
    expect(parseCompactResult(envelope(value))).toEqual({ result: value });
  });

  it("rejects oversized results and retains no partial success", () => {
    const output = envelope(
      result({ evidence: Array.from({ length: 10 }, () => "x".repeat(2_000)) }),
    );
    expect(parseCompactResult(output)).toHaveProperty(
      "error",
      expect.stringContaining("exceeds 16000"),
    );
    const padded = envelope(result()).replace("\n{", `\n${" ".repeat(16_000)}{`);
    expect(parseCompactResult(padded)).toHaveProperty(
      "error",
      expect.stringContaining("exceeds 16000"),
    );
  });

  it("accepts the exact envelope limit and rejects the next character", () => {
    const value = result();
    const original = envelope(value);
    const exact = original.replace("\n{", `\n${" ".repeat(16_000 - original.length)}{`);
    expect(parseCompactResult(exact)).toEqual({ result: value });
    expect(parseCompactResult(`${exact} `)).toHaveProperty(
      "error",
      expect.stringContaining("exceeds 16000"),
    );
  });

  it.each([
    result({ summary: "x".repeat(4_001) }),
    result({ changes: ["x".repeat(2_001)] }),
    result({ evidence: Array.from({ length: 65 }, () => "tmp/check.txt") }),
    result({
      findings: Array.from({ length: 65 }, (_, index) => ({
        severity: "important",
        message: `Failure ${index}`,
        reference: `src/parser.ts:${index + 1}`,
      })),
    }),
  ])("fails bounds rather than silently truncating any field (%#)", (value) => {
    expect(parseCompactResult(envelope(value))).toHaveProperty("error");
  });
});

describe("compactResultCanContinue", () => {
  it("permits completed results with passed checks and only nits", () => {
    expect(compactResultCanContinue(result())).toBe(true);
    expect(
      compactResultCanContinue(
        result({ checks: [], findings: [{ severity: "nit", message: "Naming cleanup." }] }),
      ),
    ).toBe(true);
  });

  it.each([
    result({ outcome: "blocked" }),
    result({ findings: [{ severity: "important", message: "Unresolved write loss." }] }),
    result({ checks: [{ command: "test", result: "failed" }] }),
    result({
      checks: [{ command: "test", result: "not_run", details: "Unavailable environment." }],
    }),
  ])("requires parent review for blocked, important, failed, or unverified work (%#)", (value) => {
    expect(compactResultCanContinue(value)).toBe(false);
  });
});
