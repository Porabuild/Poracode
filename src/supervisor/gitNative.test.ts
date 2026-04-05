import { describe, expect, it } from "vitest";
import { parseStatusPorcelainV2, parseRemoteUrl } from "./git";

// ── parseStatusPorcelainV2 ───────────────────────────────

describe("parseStatusPorcelainV2", () => {
  it("parses branch header with tracking and ahead/behind", () => {
    const output = [
      "# branch.oid abc123def456",
      "# branch.head main",
      "# branch.upstream origin/main",
      "# branch.ab +3 -1",
    ].join("\n");

    const result = parseStatusPorcelainV2(output);
    expect(result.branch).toBe("main");
    expect(result.tracking).toBe("origin/main");
    expect(result.ahead).toBe(3);
    expect(result.behind).toBe(1);
  });

  it("parses branch with no upstream", () => {
    const output = ["# branch.oid abc123def456", "# branch.head feature/new"].join("\n");

    const result = parseStatusPorcelainV2(output);
    expect(result.branch).toBe("feature/new");
    expect(result.tracking).toBe("");
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(0);
  });

  it("handles detached HEAD", () => {
    const output = ["# branch.oid abc123def456", "# branch.head (detached)"].join("\n");

    const result = parseStatusPorcelainV2(output);
    expect(result.branch).toBe("(detached)");
    expect(result.tracking).toBe("");
  });

  it("parses staged modified file (index changed, worktree clean)", () => {
    // XY=M. sub=N... mH mI mW hH hI path
    const output = [
      "# branch.oid abc123",
      "# branch.head main",
      "1 M. N... 100644 100644 100644 aaa bbb src/app.ts",
    ].join("\n");

    const result = parseStatusPorcelainV2(output);
    expect(result.staged).toHaveLength(1);
    expect(result.staged[0]).toMatchObject({
      path: "src/app.ts",
      status: "M",
      staged: true,
    });
    expect(result.unstaged).toHaveLength(0);
  });

  it("parses unstaged modified file (index clean, worktree changed)", () => {
    // XY=.M
    const output = [
      "# branch.oid abc123",
      "# branch.head main",
      "1 .M N... 100644 100644 100644 aaa bbb src/app.ts",
    ].join("\n");

    const result = parseStatusPorcelainV2(output);
    expect(result.staged).toHaveLength(0);
    expect(result.unstaged).toHaveLength(1);
    expect(result.unstaged[0]).toMatchObject({
      path: "src/app.ts",
      status: "M",
      staged: false,
    });
  });

  it("parses file that is both staged and unstaged (MM)", () => {
    // XY=MM → staged M + unstaged M
    const output = [
      "# branch.oid abc123",
      "# branch.head main",
      "1 MM N... 100644 100644 100644 aaa bbb src/both.ts",
    ].join("\n");

    const result = parseStatusPorcelainV2(output);
    expect(result.staged).toHaveLength(1);
    expect(result.staged[0]).toMatchObject({ path: "src/both.ts", status: "M", staged: true });
    expect(result.unstaged).toHaveLength(1);
    expect(result.unstaged[0]).toMatchObject({ path: "src/both.ts", status: "M", staged: false });
  });

  it("parses staged added file", () => {
    const output = [
      "# branch.oid abc123",
      "# branch.head main",
      "1 A. N... 000000 100644 100644 0000000 aaa src/new.ts",
    ].join("\n");

    const result = parseStatusPorcelainV2(output);
    expect(result.staged).toHaveLength(1);
    expect(result.staged[0]).toMatchObject({ path: "src/new.ts", status: "A", staged: true });
  });

  it("parses staged deleted file", () => {
    const output = [
      "# branch.oid abc123",
      "# branch.head main",
      "1 D. N... 100644 000000 000000 aaa 0000000 src/removed.ts",
    ].join("\n");

    const result = parseStatusPorcelainV2(output);
    expect(result.staged).toHaveLength(1);
    expect(result.staged[0]).toMatchObject({ path: "src/removed.ts", status: "D", staged: true });
  });

  it("parses renamed file (porcelain v2 type 2)", () => {
    // 2 R. N... 100644 100644 100644 aaa bbb R100 new-name.ts\told-name.ts
    const output = [
      "# branch.oid abc123",
      "# branch.head main",
      "2 R. N... 100644 100644 100644 aaa bbb R100 src/new-name.ts\tsrc/old-name.ts",
    ].join("\n");

    const result = parseStatusPorcelainV2(output);
    expect(result.staged).toHaveLength(1);
    expect(result.staged[0]).toMatchObject({
      path: "src/new-name.ts",
      oldPath: "src/old-name.ts",
      status: "R",
      staged: true,
    });
  });

  it("parses untracked files", () => {
    const output = [
      "# branch.oid abc123",
      "# branch.head main",
      "? src/untracked.ts",
      "? docs/readme.md",
    ].join("\n");

    const result = parseStatusPorcelainV2(output);
    expect(result.unstaged).toHaveLength(2);
    expect(result.unstaged[0]).toMatchObject({
      path: "src/untracked.ts",
      status: "?",
      staged: false,
    });
    expect(result.unstaged[1]).toMatchObject({
      path: "docs/readme.md",
      status: "?",
      staged: false,
    });
  });

  it("parses unmerged (conflict) entries", () => {
    // u XX N... mode mode mode mode h1 h2 h3 path
    const output = [
      "# branch.oid abc123",
      "# branch.head feature-a",
      "u UU N... 100644 100644 100644 100644 aaa bbb ccc src/conflict.ts",
      "u AA N... 100644 100644 100644 100644 aaa bbb ccc src/both-added.ts",
    ].join("\n");

    const result = parseStatusPorcelainV2(output);
    expect(result.conflictFiles).toEqual(["src/conflict.ts", "src/both-added.ts"]);
    expect(result.mergeInProgress).toBe(true);
  });

  it("returns empty arrays and defaults for empty output", () => {
    const result = parseStatusPorcelainV2("");
    expect(result.branch).toBe("");
    expect(result.tracking).toBe("");
    expect(result.ahead).toBe(0);
    expect(result.behind).toBe(0);
    expect(result.staged).toEqual([]);
    expect(result.unstaged).toEqual([]);
  });

  it("handles a complex mix of file states", () => {
    const output = [
      "# branch.oid abc123def456789",
      "# branch.head feature/complex",
      "# branch.upstream origin/feature/complex",
      "# branch.ab +1 -0",
      "1 M. N... 100644 100644 100644 aaa bbb src/modified-staged.ts",
      "1 .M N... 100644 100644 100644 aaa bbb src/modified-unstaged.ts",
      "1 A. N... 000000 100644 100644 000 aaa src/added.ts",
      "1 D. N... 100644 000000 000000 aaa 000 src/deleted.ts",
      "2 R. N... 100644 100644 100644 aaa bbb R100 src/renamed.ts\tsrc/old.ts",
      "? src/untracked.ts",
    ].join("\n");

    const result = parseStatusPorcelainV2(output);
    expect(result.branch).toBe("feature/complex");
    expect(result.tracking).toBe("origin/feature/complex");
    expect(result.ahead).toBe(1);
    expect(result.behind).toBe(0);
    expect(result.staged).toHaveLength(4); // M, A, D, R
    expect(result.unstaged).toHaveLength(2); // .M, ?
  });

  it("normalizes backslash paths to forward slashes", () => {
    const output = [
      "# branch.oid abc123",
      "# branch.head main",
      "1 M. N... 100644 100644 100644 aaa bbb src\\nested\\file.ts",
    ].join("\n");

    const result = parseStatusPorcelainV2(output);
    expect(result.staged[0]?.path).toBe("src/nested/file.ts");
  });
});

// ── parseRemoteUrl (retained from old tests, verify still works) ──

describe("parseRemoteUrl", () => {
  it("parses GitHub HTTPS URLs", () => {
    const result = parseRemoteUrl("https://github.com/owner/repo.git");
    expect(result).toEqual({
      url: "https://github.com/owner/repo.git",
      platform: "github",
      owner: "owner",
      repo: "repo",
    });
  });

  it("parses GitHub SSH URLs", () => {
    const result = parseRemoteUrl("git@github.com:owner/repo.git");
    expect(result).toEqual({
      url: "git@github.com:owner/repo.git",
      platform: "github",
      owner: "owner",
      repo: "repo",
    });
  });

  it("returns null for malformed URLs", () => {
    expect(parseRemoteUrl("")).toBeNull();
    expect(parseRemoteUrl("not-a-url")).toBeNull();
  });
});
