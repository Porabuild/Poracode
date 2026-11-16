import { describe, expect, it } from "vitest";
import type { TestCase } from "vitest/node";
import { FlakyTestReporter } from "./flakyTestReporter";

function testCase(name: string, diagnostic: { flaky: boolean; retryCount: number } | undefined) {
  return {
    fullName: name,
    module: { relativeModuleId: "src/a/b.test.ts" },
    diagnostic: () => diagnostic,
  } as unknown as TestCase;
}

describe("FlakyTestReporter", () => {
  it("annotates only tests that passed after a retry", () => {
    const output: string[] = [];
    const reporter = new FlakyTestReporter((text) => output.push(text));

    reporter.onTestCaseResult(testCase("suite > stable", { flaky: false, retryCount: 0 }));
    reporter.onTestCaseResult(testCase("suite > skipped", undefined));
    reporter.onTestCaseResult(
      testCase("suite > timing, 50%: race", { flaky: true, retryCount: 1 }),
    );

    expect(output).toEqual([
      "::warning file=src/a/b.test.ts::Flaky test passed only after 1 retry: suite > timing, 50%25: race\n",
    ]);
  });
});
