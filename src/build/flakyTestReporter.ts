import type { Reporter, TestCase } from "vitest/node";

/**
 * CI retries a failed test once so a timing flake cannot turn master red, but
 * a test that only passes on retry is still a defect. Vitest's built-in
 * `github-actions` reporter lists such tests in the job summary; this reporter
 * also raises each one as a warning annotation so it is visible on the run and
 * the pull request.
 */
export class FlakyTestReporter implements Reporter {
  readonly #write: (text: string) => void;

  constructor(write: (text: string) => void = (text) => process.stdout.write(text)) {
    this.#write = write;
  }

  onTestCaseResult(testCase: TestCase): void {
    const diagnostic = testCase.diagnostic();
    if (!diagnostic?.flaky) return;
    const retries = diagnostic.retryCount;
    const message = `Flaky test passed only after ${retries} ${retries === 1 ? "retry" : "retries"}: ${testCase.fullName}`;
    this.#write(
      `::warning file=${escapeProperty(testCase.module.relativeModuleId)}::${escapeData(message)}\n`,
    );
  }
}

// GitHub workflow command escaping for annotation data and properties.
function escapeData(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function escapeProperty(value: string): string {
  return escapeData(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
}
