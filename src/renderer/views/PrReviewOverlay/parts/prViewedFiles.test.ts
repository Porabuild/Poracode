import { describe, expect, it } from "vitest";
import type { ForgeRepository } from "@/shared/contracts";
import { reviewCacheMatchesSource, reviewViewedScope } from "@/renderer/utils/forgeReviews";
import {
  absorbReadyFingerprints,
  fileViewState,
  PR_VIEWED_FILES_STORAGE_KEY,
  readViewedMarks,
  withFileMark,
  writeViewedMarks,
} from "./prViewedFiles";
import { viewedFingerprint } from "@/shared/reviewDiff";

const source: ForgeRepository = {
  forge: "gitlab",
  host: "https://git.example/gitlab",
  repository: "team/app",
  remote: "origin",
  account: { forge: "gitlab", host: "https://git.example/gitlab", login: "alice" },
  capabilities: {
    mergeMethods: ["merge"],
    reviewDecisions: ["comment"],
    draft: true,
    reopen: true,
    updateBranch: false,
    rebaseBranch: false,
    edit: true,
    checks: true,
    reviewThreads: true,
    expectedHeadMerge: true,
    autoMerge: false,
    autoFix: false,
    adminMerge: false,
  },
};

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe("pr viewed files", () => {
  it("keeps a viewed tick on the review that owns it", () => {
    const otherAccount = { ...source, account: { ...source.account!, login: "bob" } };
    const otherRepository = { ...source, repository: "other/app" };
    expect(reviewViewedScope(source, "project-1", 12)).not.toBe(
      reviewViewedScope(otherAccount, "project-1", 12),
    );
    expect(reviewViewedScope(source, "project-1", 12)).not.toBe(
      reviewViewedScope(otherRepository, "project-1", 12),
    );
    expect(reviewViewedScope(source, "project-1", 12)).not.toBe(
      reviewViewedScope(undefined, "project-1", 12),
    );
    expect(reviewViewedScope(undefined, "project-1", 12)).toBe("legacy:project-1#12");
    expect(reviewCacheMatchesSource(otherAccount, source)).toBe(false);
    expect(reviewCacheMatchesSource(source, source)).toBe(true);
    expect(reviewCacheMatchesSource(undefined, undefined)).toBe(true);
  });

  it("treats a changed patch as unread-until-reread and keeps an identical patch viewed", () => {
    const file = { additions: 2, deletions: 1 };
    const first = viewedFingerprint("diff --git a/file b/file\n+one", file);
    const same = viewedFingerprint("diff --git a/file b/file\n+one", file);
    const changed = viewedFingerprint("diff --git a/file b/file\n+two", file);
    const marks = withFileMark({}, "scope", "file", first);
    expect(fileViewState(marks, "scope", "file", same)).toBe("viewed");
    expect(fileViewState(marks, "scope", "file", changed)).toBe("changed");
    expect(fileViewState(withFileMark(marks, "scope", "file", null), "scope", "file", same)).toBe(
      "unread",
    );
    const pending = viewedFingerprint(undefined, file);
    const resized = viewedFingerprint("diff --git a/file b/file\n+two\n+three", {
      additions: 3,
      deletions: 1,
    });
    expect(fileViewState(withFileMark({}, "scope", "file", pending), "scope", "file", same)).toBe(
      "viewed",
    );
    expect(
      fileViewState(withFileMark({}, "scope", "file", pending), "scope", "file", resized),
    ).toBe("changed");
    expect(fileViewState(marks, "scope", "file", pending)).toBe("viewed");
    expect(fileViewState(marks, "scope", "file", `pending:${file.additions + 4}:0`)).toBe(
      "changed",
    );
    expect(
      absorbReadyFingerprints(withFileMark({}, "scope", "file", pending), "scope", [
        { path: "file", fingerprint: same },
      ])["scope"]?.file,
    ).toBe(same);
  });

  it("ignores an older or malformed store and drops the oldest scopes past the cap", () => {
    const storage = memoryStorage();
    storage.setItem(
      "poracode.pr-viewed-files.v1",
      JSON.stringify({ scope: { file: "ready:1:0:1:1" } }),
    );
    expect(readViewedMarks(storage)).toEqual({});
    storage.setItem(PR_VIEWED_FILES_STORAGE_KEY, "{");
    expect(readViewedMarks(storage)).toEqual({});
    storage.setItem(PR_VIEWED_FILES_STORAGE_KEY, JSON.stringify({ scope: { file: 1 } }));
    expect(readViewedMarks(storage)).toEqual({});
    let marks: Record<string, Record<string, string>> = {};
    for (let index = 0; index < 205; index += 1) {
      marks = withFileMark(marks, `scope-${index}`, "file", "1:0:0:1");
    }
    expect(Object.keys(marks)).toHaveLength(200);
    expect(marks["scope-0"]).toBeUndefined();
    expect(marks["scope-204"]?.file).toBe("1:0:0:1");
    writeViewedMarks(storage, marks);
    expect(readViewedMarks(storage)["scope-204"]?.file).toBe("1:0:0:1");
  });
});
