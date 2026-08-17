/**
 * Pure-parser regression tests for statusParsing.
 *
 * The functions exercised here interpret raw `git` output: any drift in
 * `git status --porcelain=v2 -b`, `git remote -v`, or `git diff --numstat`
 * (e.g. a git version that emits a new line shape) would silently corrupt
 * the GitStatusResult passed to the renderer. These fixture-driven tests
 * lock down the parser shape independently of `execGit`.
 */

import { describe, expect, it } from "vitest";
import {
  buildGitStatusResultFromOutputs,
  buildGitStatusSummaryFromOutput,
  expandUntrackedEntries,
  isInheritedStartPointUpstream,
  parseDiffNumstat,
  parseStatusPorcelainV2,
  unquoteGitPath,
} from "./statusParsing";

// git C-quotes non-ASCII bytes as octal-escaped UTF-8 wrapped in double quotes.
// `файл.txt` → ф=\321\204 а=\320\260 й=\320\271 л=\320\273 then `.txt`.
const QUOTED_CYRILLIC = '"\\321\\204\\320\\260\\320\\271\\320\\273.txt"';
const DECODED_CYRILLIC = "файл.txt";

describe("isInheritedStartPointUpstream", () => {
  it("detects a worktree branch that inherited origin/master as upstream", () => {
    expect(
      isInheritedStartPointUpstream({
        branch: "poracode/clever-falcon-2541f8a0",
        tracking: "origin/master",
        poracodeSource: "origin/master",
      }),
    ).toBe(true);
  });

  it("keeps a same-named remote tracking branch", () => {
    expect(
      isInheritedStartPointUpstream({
        branch: "feature/x",
        tracking: "origin/feature/x",
        poracodeSource: "origin/master",
      }),
    ).toBe(false);
  });

  it("ignores tracking that is not the recorded fork base", () => {
    expect(
      isInheritedStartPointUpstream({
        branch: "poracode/clever-falcon-2541f8a0",
        tracking: "origin/master",
        poracodeSource: "origin/develop",
      }),
    ).toBe(false);
  });
});

describe("parseStatusPorcelainV2", () => {
  it("captures branch, upstream, ahead/behind from the header lines", () => {
    const output = [
      "# branch.oid abc123",
      "# branch.head feature/x",
      "# branch.upstream origin/feature/x",
      "# branch.ab +3 -1",
    ].join("\n");

    const result = parseStatusPorcelainV2(output);
    expect(result.branch).toBe("feature/x");
    expect(result.headSha).toBe("abc123");
    expect(result.tracking).toBe("origin/feature/x");
    expect(result.ahead).toBe(3);
    expect(result.behind).toBe(1);
    expect(result.mergeInProgress).toBe(false);
  });

  it("returns defaults when no header lines are present", () => {
    expect(parseStatusPorcelainV2("")).toEqual({
      branch: "",
      headSha: "",
      tracking: "",
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      conflictFiles: [],
      mergeInProgress: false,
    });
  });

  it("classifies single-status records into staged vs unstaged buckets", () => {
    const output = [
      "# branch.head main",
      "1 M. N... 100644 100644 100644 aaa aaa src/changed.ts",
      "1 .M N... 100644 100644 100644 bbb bbb src/dirty.ts",
      "1 MM N... 100644 100644 100644 ccc ccc src/both.ts",
    ].join("\n");

    const { staged, unstaged } = parseStatusPorcelainV2(output);
    expect(staged.map((s) => s.path)).toEqual(["src/changed.ts", "src/both.ts"]);
    expect(unstaged.map((s) => s.path)).toEqual(["src/dirty.ts", "src/both.ts"]);
    expect(staged.every((s) => s.staged)).toBe(true);
    expect(unstaged.every((s) => !s.staged)).toBe(true);
  });

  it("captures renames as kind-2 entries with oldPath", () => {
    // Porcelain v2 rename line: `2 XY ... R100 <new-path>\t<old-path>` —
    // new path is space-separated within the first tab-delimited segment.
    const output = [
      "# branch.head main",
      "2 R. N... 100644 100644 100644 aaa aaa R100 src/new.ts\tsrc/old.ts",
    ].join("\n");

    const { staged } = parseStatusPorcelainV2(output);
    expect(staged).toHaveLength(1);
    expect(staged[0]!.path).toBe("src/new.ts");
    expect(staged[0]!.oldPath).toBe("src/old.ts");
    expect(staged[0]!.status).toBe("R");
  });

  it("captures untracked files as `? ` records on the unstaged side", () => {
    const output = ["# branch.head main", "? new-untracked.txt"].join("\n");
    const { unstaged, staged } = parseStatusPorcelainV2(output);
    expect(staged).toEqual([]);
    expect(unstaged).toHaveLength(1);
    expect(unstaged[0]!.path).toBe("new-untracked.txt");
    expect(unstaged[0]!.status).toBe("?");
  });

  it("captures `u ` conflict records and flags mergeInProgress", () => {
    const output = [
      "# branch.head main",
      "u UU N... 100644 100644 100644 100644 aaa bbb ccc src/conflict.ts",
    ].join("\n");

    const { conflictFiles, mergeInProgress } = parseStatusPorcelainV2(output);
    expect(mergeInProgress).toBe(true);
    expect(conflictFiles).toEqual(["src/conflict.ts"]);
  });

  it("normalizes Windows-style backslashes in paths to forward slashes", () => {
    const output = [
      "# branch.head main",
      "1 M. N... 100644 100644 100644 aaa aaa src\\nested\\file.ts",
    ].join("\n");
    const { staged } = parseStatusPorcelainV2(output);
    expect(staged[0]!.path).toBe("src/nested/file.ts");
  });

  it("ignores blank lines and unrecognised line kinds", () => {
    const output = ["# branch.head main", "", "x weird-line-not-real", "  ", "? real.txt"].join(
      "\n",
    );
    const { unstaged } = parseStatusPorcelainV2(output);
    expect(unstaged.map((u) => u.path)).toEqual(["real.txt"]);
  });

  it("treats malformed branch.ab line as 0/0", () => {
    const output = ["# branch.head main", "# branch.ab garbage"].join("\n");
    const { ahead, behind } = parseStatusPorcelainV2(output);
    expect(ahead).toBe(0);
    expect(behind).toBe(0);
  });

  it("decodes a C-quoted non-ASCII path back to real UTF-8", () => {
    const output = [
      "# branch.head main",
      `1 M. N... 100644 100644 100644 aaa aaa ${QUOTED_CYRILLIC}`,
    ].join("\n");
    const { staged } = parseStatusPorcelainV2(output);
    expect(staged[0]!.path).toBe(DECODED_CYRILLIC);
  });

  it("decodes a C-quoted path containing a literal double quote", () => {
    // git still quotes double-quote/backslash/control chars even with
    // core.quotepath=false: `a"b.txt` → `"a\"b.txt"`.
    const output = [
      "# branch.head main",
      '1 M. N... 100644 100644 100644 aaa aaa "a\\"b.txt"',
    ].join("\n");
    const { staged } = parseStatusPorcelainV2(output);
    expect(staged[0]!.path).toBe('a"b.txt');
  });

  it("decodes both the new and old quoted paths of a rename", () => {
    const output = [
      "# branch.head main",
      `2 R. N... 100644 100644 100644 aaa aaa R100 ${QUOTED_CYRILLIC}\t"\\320\\261.txt"`,
    ].join("\n");
    const { staged } = parseStatusPorcelainV2(output);
    expect(staged[0]!.path).toBe(DECODED_CYRILLIC);
    expect(staged[0]!.oldPath).toBe("б.txt");
  });

  it("decodes a C-quoted `u ` conflict path", () => {
    const output = [
      "# branch.head main",
      `u UU N... 100644 100644 100644 100644 aaa bbb ccc ${QUOTED_CYRILLIC}`,
    ].join("\n");
    const { conflictFiles } = parseStatusPorcelainV2(output);
    expect(conflictFiles).toEqual([DECODED_CYRILLIC]);
  });

  it("leaves an unquoted (raw UTF-8) path untouched", () => {
    const output = ["# branch.head main", `? ${DECODED_CYRILLIC}`].join("\n");
    const { unstaged } = parseStatusPorcelainV2(output);
    expect(unstaged[0]!.path).toBe(DECODED_CYRILLIC);
  });
});

describe("unquoteGitPath", () => {
  it("decodes multi-byte octal escapes as UTF-8 bytes, not code points", () => {
    // `\321\204` are the two UTF-8 bytes of `ф`; decoding per-byte then reading
    // the buffer as UTF-8 must reassemble the single code point.
    expect(unquoteGitPath('"\\321\\204"')).toBe("ф");
    expect(unquoteGitPath(QUOTED_CYRILLIC)).toBe(DECODED_CYRILLIC);
  });

  it("decodes the simple C escapes", () => {
    expect(unquoteGitPath('"a\\tb"')).toBe("a\tb");
    expect(unquoteGitPath('"a\\nb"')).toBe("a\nb");
    expect(unquoteGitPath('"a\\"b.txt"')).toBe('a"b.txt');
    expect(unquoteGitPath('"a\\\\b.txt"')).toBe("a\\b.txt");
  });

  it("returns unquoted input unchanged (raw UTF-8 or plain ASCII)", () => {
    expect(unquoteGitPath("src/plain.ts")).toBe("src/plain.ts");
    expect(unquoteGitPath(DECODED_CYRILLIC)).toBe(DECODED_CYRILLIC);
    expect(unquoteGitPath("")).toBe("");
    // A path only prefixed with a quote is not a fully-quoted blob.
    expect(unquoteGitPath('"partial')).toBe('"partial');
  });
});

describe("parseDiffNumstat", () => {
  it("parses standard numstat lines", () => {
    const output = ["3\t1\tsrc/a.ts", "10\t0\tsrc/b.ts"].join("\n");
    expect(parseDiffNumstat(output)).toEqual([
      { path: "src/a.ts", insertions: 3, deletions: 1 },
      { path: "src/b.ts", insertions: 10, deletions: 0 },
    ]);
  });

  it("returns insertions=0, deletions=0 for binary files (git emits '-\\t-\\tpath')", () => {
    expect(parseDiffNumstat("-\t-\tassets/logo.png")).toEqual([
      { path: "assets/logo.png", insertions: 0, deletions: 0 },
    ]);
  });

  it("normalizes path separators", () => {
    expect(parseDiffNumstat("1\t1\tsrc\\nested\\file.ts")).toEqual([
      { path: "src/nested/file.ts", insertions: 1, deletions: 1 },
    ]);
  });

  it("returns [] for empty output", () => {
    expect(parseDiffNumstat("")).toEqual([]);
    expect(parseDiffNumstat("   \n  ")).toEqual([]);
  });

  it("skips malformed lines that lack a path", () => {
    expect(parseDiffNumstat("3\t1")).toEqual([]);
  });

  it("resolves a brace rename with a common prefix to the new path", () => {
    expect(parseDiffNumstat("1\t0\tsrc/{old.txt => new.txt}")).toEqual([
      { path: "src/new.txt", insertions: 1, deletions: 0 },
    ]);
  });

  it("resolves a brace rename with a common prefix AND suffix to the new path", () => {
    expect(parseDiffNumstat("1\t0\tsrc/{a => b}/file.txt")).toEqual([
      { path: "src/b/file.txt", insertions: 1, deletions: 0 },
    ]);
  });

  it("resolves an empty-side brace rename to the new path", () => {
    expect(parseDiffNumstat("2\t1\tdir/{ => sub}/file.txt")).toEqual([
      { path: "dir/sub/file.txt", insertions: 2, deletions: 1 },
    ]);
    // Reverse (removal) side collapses the adjacent slashes back to the new path.
    expect(parseDiffNumstat("2\t1\tdir/{sub => }/file.txt")).toEqual([
      { path: "dir/file.txt", insertions: 2, deletions: 1 },
    ]);
  });

  it("resolves a plain `old => new` rename (no common prefix) to the new path", () => {
    expect(parseDiffNumstat("1\t0\tsrc/old.txt => deep/dir/new.txt")).toEqual([
      { path: "deep/dir/new.txt", insertions: 1, deletions: 0 },
    ]);
  });

  it("returns 0/0 for a binary rename line (`-\\t-\\t{old => new}`)", () => {
    expect(parseDiffNumstat("-\t-\tsrc/{old.png => new.png}")).toEqual([
      { path: "src/new.png", insertions: 0, deletions: 0 },
    ]);
  });

  it("decodes a whole-field C-quoted non-ASCII path", () => {
    expect(parseDiffNumstat(`3\t1\t${QUOTED_CYRILLIC}`)).toEqual([
      { path: DECODED_CYRILLIC, insertions: 3, deletions: 1 },
    ]);
  });

  it("decodes each independently-quoted side of a plain rename to the new path", () => {
    // git quotes each side of a rename separately: `"old" => "new"`.
    expect(parseDiffNumstat(`4\t2\t"\\320\\261.txt" => ${QUOTED_CYRILLIC}`)).toEqual([
      { path: DECODED_CYRILLIC, insertions: 4, deletions: 2 },
    ]);
  });
});

describe("buildGitStatusResultFromOutputs", () => {
  it("returns the empty/non-repo shape when isRepo=false", () => {
    expect(
      buildGitStatusResultFromOutputs({
        isRepo: false,
        statusOutput: "",
        remoteOutput: "",
        stagedNumstat: "",
        unstagedNumstat: "",
      }),
    ).toEqual({
      isRepo: false,
      branch: "",
      tracking: "",
      hasRemote: false,
      remoteInfo: null,
      ahead: 0,
      behind: 0,
      staged: [],
      unstaged: [],
      totalInsertions: 0,
      totalDeletions: 0,
    });
  });

  it("identifies a GitHub origin URL and exposes owner/repo", () => {
    const result = buildGitStatusResultFromOutputs({
      isRepo: true,
      statusOutput: ["# branch.head main"].join("\n"),
      remoteOutput: [
        "origin\thttps://github.com/owner/repo.git (fetch)",
        "origin\thttps://github.com/owner/repo.git (push)",
      ].join("\n"),
      stagedNumstat: "",
      unstagedNumstat: "",
    });
    expect(result.hasRemote).toBe(true);
    expect(result.remoteInfo?.platform).toBe("github");
    expect(result.remoteInfo?.owner).toBe("owner");
    expect(result.remoteInfo?.repo).toBe("repo");
  });

  it("flags remote URL but null remoteInfo when the URL is unparseable", () => {
    const result = buildGitStatusResultFromOutputs({
      isRepo: true,
      statusOutput: "# branch.head main",
      remoteOutput: "origin\tnot-a-real-url (fetch)",
      stagedNumstat: "",
      unstagedNumstat: "",
    });
    expect(result.hasRemote).toBe(true);
    expect(result.remoteInfo).toBeNull();
  });

  it("backfills numstat counts onto matching staged/unstaged entries", () => {
    const result = buildGitStatusResultFromOutputs({
      isRepo: true,
      statusOutput: [
        "# branch.head main",
        "1 M. N... 100644 100644 100644 aaa aaa src/a.ts",
        "1 .M N... 100644 100644 100644 bbb bbb src/b.ts",
      ].join("\n"),
      remoteOutput: "",
      stagedNumstat: "5\t1\tsrc/a.ts",
      unstagedNumstat: "2\t0\tsrc/b.ts",
    });
    expect(result.staged[0]!.insertions).toBe(5);
    expect(result.staged[0]!.deletions).toBe(1);
    expect(result.unstaged[0]!.insertions).toBe(2);
    expect(result.unstaged[0]!.deletions).toBe(0);
    expect(result.totalInsertions).toBe(7);
    expect(result.totalDeletions).toBe(1);
  });

  it("backfills rename numstat counts onto a porcelain-v2 rename entry", () => {
    // Porcelain v2 carries the new path (`src/new.txt`); numstat emits the
    // combined rename syntax, which must resolve to the same new path.
    const result = buildGitStatusResultFromOutputs({
      isRepo: true,
      statusOutput: [
        "# branch.head main",
        "2 R. N... 100644 100644 100644 aaa aaa R83 src/new.txt\tsrc/old.txt",
      ].join("\n"),
      remoteOutput: "",
      stagedNumstat: "4\t2\tsrc/{old.txt => new.txt}",
      unstagedNumstat: "",
    });
    expect(result.staged).toHaveLength(1);
    expect(result.staged[0]!.path).toBe("src/new.txt");
    expect(result.staged[0]!.oldPath).toBe("src/old.txt");
    expect(result.staged[0]!.insertions).toBe(4);
    expect(result.staged[0]!.deletions).toBe(2);
    expect(result.totalInsertions).toBe(4);
    expect(result.totalDeletions).toBe(2);
  });

  it("merges numstat counts onto a porcelain entry when both paths are C-quoted", () => {
    // End-to-end: the porcelain path and the numstat path both arrive C-quoted
    // and must decode to the SAME real path so the count backfill matches.
    const result = buildGitStatusResultFromOutputs({
      isRepo: true,
      statusOutput: [
        "# branch.head main",
        `1 .M N... 100644 100644 100644 aaa aaa ${QUOTED_CYRILLIC}`,
      ].join("\n"),
      remoteOutput: "",
      stagedNumstat: "",
      unstagedNumstat: `5\t2\t${QUOTED_CYRILLIC}`,
    });
    expect(result.unstaged).toHaveLength(1);
    expect(result.unstaged[0]!.path).toBe(DECODED_CYRILLIC);
    expect(result.unstaged[0]!.insertions).toBe(5);
    expect(result.unstaged[0]!.deletions).toBe(2);
    expect(result.totalInsertions).toBe(5);
    expect(result.totalDeletions).toBe(2);
  });

  it("drops tracked rows that `git diff --numstat` has no entry for", () => {
    // Windows + core.autocrlf=true: a tool rewrote src/phantom.ts with LF
    // endings, so its on-disk size no longer matches the CRLF size the index
    // cached at checkout. `git status` reports it modified from that stale stat
    // alone while `git diff` shows nothing — the row must not reach the panel.
    const result = buildGitStatusResultFromOutputs({
      isRepo: true,
      statusOutput: [
        "# branch.head main",
        "1 M. N... 100644 100644 100644 aaa aaa src/staged-phantom.ts",
        "1 M. N... 100644 100644 100644 bbb bbb src/staged-real.ts",
        "1 .M N... 100644 100644 100644 ccc ccc src/phantom.ts",
        "1 .M N... 100644 100644 100644 ddd ddd src/real.ts",
        "? src/new.ts",
      ].join("\n"),
      remoteOutput: "",
      stagedNumstat: "5\t1\tsrc/staged-real.ts",
      unstagedNumstat: "2\t3\tsrc/real.ts",
    });
    expect(result.staged.map((f) => f.path)).toEqual(["src/staged-real.ts"]);
    // The untracked row survives: it never appears in `git diff --numstat`.
    expect(result.unstaged.map((f) => f.path)).toEqual(["src/real.ts", "src/new.ts"]);
    expect(result.totalInsertions).toBe(7);
    expect(result.totalDeletions).toBe(4);
  });

  it("keeps rows numstat reports with zero counts (binary and mode-only changes)", () => {
    const result = buildGitStatusResultFromOutputs({
      isRepo: true,
      statusOutput: [
        "# branch.head main",
        "1 .M N... 100644 100755 100755 aaa aaa src/mode-only.sh",
        "1 .M N... 100644 100644 100644 bbb bbb assets/logo.png",
      ].join("\n"),
      remoteOutput: "",
      stagedNumstat: "",
      unstagedNumstat: ["0\t0\tsrc/mode-only.sh", "-\t-\tassets/logo.png"].join("\n"),
    });
    expect(result.unstaged.map((f) => f.path)).toEqual(["src/mode-only.sh", "assets/logo.png"]);
  });

  it("keeps every row when a numstat command failed (null), rather than wiping the list", () => {
    const result = buildGitStatusResultFromOutputs({
      isRepo: true,
      statusOutput: [
        "# branch.head main",
        "1 M. N... 100644 100644 100644 aaa aaa src/a.ts",
        "1 .M N... 100644 100644 100644 bbb bbb src/b.ts",
      ].join("\n"),
      remoteOutput: "",
      stagedNumstat: null,
      unstagedNumstat: null,
    });
    expect(result.staged.map((f) => f.path)).toEqual(["src/a.ts"]);
    expect(result.unstaged.map((f) => f.path)).toEqual(["src/b.ts"]);
    expect(result.totalInsertions).toBe(0);
  });

  it("returns hasRemote=false when remoteOutput is empty", () => {
    const result = buildGitStatusResultFromOutputs({
      isRepo: true,
      statusOutput: "# branch.head main",
      remoteOutput: "",
      stagedNumstat: "",
      unstagedNumstat: "",
    });
    expect(result.hasRemote).toBe(false);
    expect(result.remoteInfo).toBeNull();
  });

  it("prefers an origin (fetch) line when multiple remotes are configured", () => {
    const result = buildGitStatusResultFromOutputs({
      isRepo: true,
      statusOutput: "# branch.head main",
      remoteOutput: [
        "upstream\thttps://gitlab.com/x/y.git (fetch)",
        "origin\thttps://github.com/owner/repo.git (fetch)",
      ].join("\n"),
      stagedNumstat: "",
      unstagedNumstat: "",
    });
    expect(result.remoteInfo?.platform).toBe("github");
    expect(result.remoteInfo?.owner).toBe("owner");
  });
});

describe("expandUntrackedEntries", () => {
  it("replaces a collapsed `? dir/` entry with one entry per ls-files path", () => {
    const parsed = parseStatusPorcelainV2(["# branch.head main", "? src/widget/"].join("\n"));
    expandUntrackedEntries(parsed, "src/widget/a.ts\0src/widget/b.ts\0src/widget/c.css\0");
    expect(parsed.unstaged.map((f) => f.path)).toEqual([
      "src/widget/a.ts",
      "src/widget/b.ts",
      "src/widget/c.css",
    ]);
    // Counts stay 0 — the summary path leaves them for mergeSummaryStatus to backfill.
    expect(parsed.unstaged.every((f) => f.status === "?" && !f.staged)).toBe(true);
    expect(parsed.unstaged.every((f) => f.insertions === 0 && f.deletions === 0)).toBe(true);
  });

  it("keeps tracked unstaged entries and drops only collapsed `?` rows", () => {
    const parsed = parseStatusPorcelainV2(
      [
        "# branch.head main",
        "1 .M N... 100644 100644 100644 bbb bbb src/tracked.ts",
        "? src/new/",
      ].join("\n"),
    );
    expandUntrackedEntries(parsed, "src/new/x.ts\0");
    expect(parsed.unstaged.map((f) => f.path)).toEqual(["src/tracked.ts", "src/new/x.ts"]);
  });

  it("is a no-op when there are no untracked entries", () => {
    const parsed = parseStatusPorcelainV2(
      ["# branch.head main", "1 .M N... 100644 100644 100644 bbb bbb src/tracked.ts"].join("\n"),
    );
    expandUntrackedEntries(parsed, "src/ignored.ts\0");
    expect(parsed.unstaged.map((f) => f.path)).toEqual(["src/tracked.ts"]);
  });

  it("leaves the collapsed entry intact when ls-files output is empty", () => {
    const parsed = parseStatusPorcelainV2(["# branch.head main", "? src/new/"].join("\n"));
    expandUntrackedEntries(parsed, "");
    expect(parsed.unstaged.map((f) => f.path)).toEqual(["src/new/"]);
  });
});

describe("buildGitStatusSummaryFromOutput", () => {
  it("keeps untracked directories collapsed when ls-files output is empty", () => {
    const result = buildGitStatusSummaryFromOutput(
      ["# branch.head main", "? src/new/"].join("\n"),
      "",
    );
    expect(result.detail).toBe("summary");
    expect(result.unstaged.map((f) => f.path)).toEqual(["src/new/"]);
  });

  it("expands untracked directories so the summary file list matches the full path", () => {
    const result = buildGitStatusSummaryFromOutput(
      ["# branch.head main", "? src/new/"].join("\n"),
      "src/new/a.ts\0src/new/b.ts\0",
    );
    // Same per-file granularity the full/enriched path produces, with status "?"
    // and counts 0 — keys line up so mergeSummaryStatus can backfill insertions.
    expect(
      result.unstaged.map((f) => ({ path: f.path, status: f.status, staged: f.staged })),
    ).toEqual([
      { path: "src/new/a.ts", status: "?", staged: false },
      { path: "src/new/b.ts", status: "?", staged: false },
    ]);
    expect(result.totalInsertions).toBe(0);
  });
});
