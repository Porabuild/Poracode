import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { GitMergeService } from "./mergeService";
import { GitWorktreeService } from "./worktreeService";

it("reports an actual pull-from-source conflict and its preserved stash", async () => {
  const root = mkdtempSync(join(tmpdir(), "poracode-merge-conflict-"));
  const repo = join(root, "repo");
  const worktree = join(root, "worktree");
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const commitEdit = (cwd: string, text: string) => {
    writeFileSync(join(cwd, "conflict.txt"), text);
    git(cwd, "add", "conflict.txt");
    git(cwd, "commit", "-m", text);
  };
  try {
    git(root, "init", "-b", "main", repo);
    git(repo, "config", "user.name", "Poracode fixture");
    git(repo, "config", "user.email", "fixture@example.test");
    git(repo, "config", "commit.gpgsign", "false");
    git(repo, "config", "core.hooksPath", join(root, "empty-hooks"));
    commitEdit(repo, "base");
    git(repo, "worktree", "add", "-b", "feature", worktree);
    commitEdit(repo, "main edit");
    commitEdit(worktree, "feature edit");
    writeFileSync(join(worktree, "draft.txt"), "uncommitted draft");

    const service = new GitMergeService(new GitWorktreeService());
    const result = await service.pullFromSource({ kind: "posix", path: worktree }, "main", true);
    expect(result).toMatchObject({
      merged: false,
      conflicting: true,
      conflictFiles: ["conflict.txt"],
      stashPreserved: true,
      stashCommit: git(repo, "rev-parse", "refs/stash"),
    });
    expect(git(worktree, "diff", "--name-only", "--diff-filter=U")).toBe("conflict.txt");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
