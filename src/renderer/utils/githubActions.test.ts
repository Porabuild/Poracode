import { describe, expect, it } from "vitest";
import { parseGitHubActionsRunId } from "./githubActions";

describe("parseGitHubActionsRunId", () => {
  it("extracts a run id from run and job URLs", () => {
    expect(parseGitHubActionsRunId("https://github.com/owner/repo/actions/runs/501")).toBe(501);
    expect(parseGitHubActionsRunId("https://github.com/owner/repo/actions/runs/501/job/9001")).toBe(
      501,
    );
  });

  it("ignores non-Actions and invalid URLs", () => {
    expect(parseGitHubActionsRunId("https://ci.example.com/build/501")).toBeNull();
    expect(parseGitHubActionsRunId("not-a-url")).toBeNull();
  });
});
