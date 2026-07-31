import { describe, expect, it } from "vitest";
import { attachErrorDetails, friendlyError, friendlyErrorWithDetail } from "./messages";

describe("friendlyErrorWithDetail", () => {
  it("returns the raw message and no details for plain errors", () => {
    const result = friendlyErrorWithDetail(new Error("something broke"));
    expect(result).toEqual({ summary: "something broke", details: "" });
  });

  it("strips the Electron IPC wrapper prefix", () => {
    const wrapped = new Error("Error invoking remote method 'gitCommit': Error: real message");
    expect(friendlyError(wrapped)).toBe("real message");
  });

  it("splits an attached details block out of the message", () => {
    const composed = attachErrorDetails("Git commit failed: stuff", "stderr line 1\nstderr line 2");
    const result = friendlyErrorWithDetail(new Error(composed));
    expect(result.summary).toBe("Git commit failed: stuff");
    expect(result.details).toBe("stderr line 1\nstderr line 2");
  });

  it("classifies husky output as a pre-commit hook failure", () => {
    const stderr = [
      "running pre-commit",
      "husky - pre-commit hook exited with code 1 (error)",
    ].join("\n");
    const composed = attachErrorDetails("Git commit failed: ...", stderr);
    const result = friendlyErrorWithDetail(new Error(composed));
    expect(result.summary).toBe("Pre-commit hook failed");
    expect(result.details).toContain("husky - pre-commit");
  });

  it("classifies bash hook noise based on .husky/ paths in stderr", () => {
    const stderr = [
      "/bin/bash: line 1: setSportsMaxSignals: command not found",
      ".husky/pre-commit: line 7: unexpected token",
    ].join("\n");
    const composed = attachErrorDetails("Git commit failed: bash exited 2", stderr);
    const result = friendlyErrorWithDetail(new Error(composed));
    expect(result.summary).toBe("Pre-commit hook failed");
    expect(result.details).toContain("setSportsMaxSignals");
  });

  it("does not treat unrelated git errors as hook failures", () => {
    const composed = attachErrorDetails(
      "Git commit failed: nothing to commit, working tree clean",
      "",
    );
    const result = friendlyErrorWithDetail(new Error(composed));
    expect(result.summary).toContain("nothing to commit");
    expect(result.details).toBe("");
  });

  it("maps remote server error codes to shared messages", () => {
    const error = Object.assign(new Error("A project path may not contain traversal segments."), {
      code: "invalid_project_path",
    });
    expect(friendlyErrorWithDetail(error)).toEqual({
      summary: "Enter a valid absolute project path.",
      details: "A project path may not contain traversal segments.",
    });
  });

  it("maps helper bootstrap failures to shared messages", () => {
    expect(friendlyError(new Error("Poracode Helper probe returned HTTP 503."))).toBe(
      "Poracode Helper is not ready yet (HTTP 503).",
    );
    expect(
      friendlyError(new Error("Poracode SSH requires Node 24.10 or newer on the remote host.")),
    ).toBe(
      "Poracode Helper failed to start. Check that Node 24.10 or newer and npm are installed on the remote machine.",
    );
  });
});
