import { describe, expect, it } from "vitest";
import { classifyForgeCommand, classifyForgeToolCall } from "./classifyForgeCommand";
import type { ForgeCommandActivity } from "./types";

type CommandCase = [command: string, expected: ForgeCommandActivity[]];

const commandCases: CommandCase[] = [
  ["git push", [{ action: "push" }]],
  ["git push -u origin HEAD", [{ action: "push" }]],
  ["git -C ../wt push", [{ action: "push" }]],
  ["GIT_TRACE=1 git push", [{ action: "push" }]],
  ["env GIT_TRACE=1 git push", [{ action: "push" }]],
  ["git push --dry-run", []],
  ["git push -n", []],
  ["git pull", []],
  ['git commit -m "git push"', []],
  ["echo gh pr create", []],
  ['echo "git push"', []],
  [
    "git add -A && git commit -m x && git push && gh pr create --fill",
    [{ action: "push" }, { action: "create" }],
  ],
  [
    'gh pr create --title "Fix" --body "a && b" --head feat/x',
    [{ action: "create", branch: "feat/x" }],
  ],
  ["gh pr create --head octo:feat/y", [{ action: "create", branch: "feat/y" }]],
  ["C:\\Tools\\gh.exe pr create", [{ action: "create" }]],
  ["C:\\Program\\ Files\\Git\\cmd\\git.exe push", [{ action: "push" }]],
  ["git push \\\n  origin HEAD", [{ action: "push" }]],
  ["gh pr merge 7 \\\n --squash", [{ action: "merge" }]],
  ["gh pr merge 179 --squash --auto", [{ action: "auto-merge" }]],
  ["gh pr merge feat-x", [{ action: "merge", branch: "feat-x" }]],
  ["gh pr merge https://github.com/o/r/pull/42", [{ action: "merge" }]],
  ["gh pr merge 5 --disable-auto", [{ action: "update" }]],
  ["gh -R o/r pr close 5", [{ action: "close" }]],
  ["gh pr ready --undo", [{ action: "draft" }]],
  ["gh pr view 5", []],
  ["gh pr list", []],
  ["gh pr create --help", []],
  ['/bin/bash -lc "cd /w && git push origin HEAD"', [{ action: "push" }]],
  ['bash -lc "git push --dry-run"', []],
  ['pwsh -Command "gh pr create --fill"', [{ action: "create" }]],
  ["cmd /c gh pr merge 3", [{ action: "merge" }]],
  ["cmd /k gh pr create --fill", [{ action: "create" }]],
  ['"C:\\Program Files\\GitHub CLI\\gh.exe" pr create', [{ action: "create" }]],
  ["glab mr create -s feat --fill", [{ action: "create", branch: "feat" }]],
  ["glab mr merge !12", [{ action: "merge" }]],
  ["glab mr update 3 --draft", [{ action: "draft" }]],
  ['glab mr note 3 -m "hi"', [{ action: "comment" }]],
  ["glab mr view 3", []],
  ["tea pr create --head feat", [{ action: "create", branch: "feat" }]],
  ["tea pulls merge 7", [{ action: "merge" }]],
  ["tea pulls approve 4", [{ action: "review" }]],
  ["tea pr", []],
  ["fj pr merge 9", [{ action: "merge" }]],
  ["berg pull create", [{ action: "create" }]],
  ["az repos pr create -s feat -t main", [{ action: "create", branch: "feat" }]],
  ["az repos pr update --status completed", [{ action: "merge" }]],
  ["az repos pr update --draft false", [{ action: "ready" }]],
  ["az repos pr set-vote --vote approve", [{ action: "review" }]],
  ["az repos pr reviewer add", [{ action: "update" }]],
  ["az repos pr list", []],
  ["cat > notes.md <<'EOF'\ngh pr create --fill\nEOF", []],
  ["cat <<-EOF\n\tgit push\n\tEOF\ngit push", [{ action: "push" }]],
  ["cat > f <<EOF && git push\nbody\nEOF", [{ action: "push" }]],
  ["git push <<< input", [{ action: "push" }]],
  ["# cat <<EOF\ngit push", [{ action: "push" }]],
  ["git push # gh pr create", [{ action: "push" }]],
  ["echo a#b && git push", [{ action: "push" }]],
  ["x=$((1<<20))\ngh pr create --fill", [{ action: "create" }]],
  ["((x=1<<2)); git push", [{ action: "push" }]],
  ["cat <<\\EOF\nbody gh pr create\nEOF\ngit push", [{ action: "push" }]],
  ['cat <<E"OF"\ngh pr create\nEOF\ngit push', [{ action: "push" }]],
];

type ToolCase = [name: string, args: unknown, expected: ForgeCommandActivity | null];

const toolCases: ToolCase[] = [
  ["mcp__github__create_pull_request", { head: "me:feat" }, { action: "create", branch: "feat" }],
  ["github.merge_pull_request", { pullNumber: 5 }, { action: "merge" }],
  ["gitlab/create_merge_request", undefined, { action: "create" }],
  [
    "mcp__gitlab__create_merge_request",
    { merge_request_iid: "8", source_branch: "me:feat" },
    { action: "create", branch: "feat" },
  ],
  ["mcp__github__get_pull_request", undefined, null],
  ["gh_create_pr", undefined, null],
];

describe("classifyForgeCommand", () => {
  it.each(commandCases)("classifies %s", (command, expected) => {
    expect(classifyForgeCommand(command)).toEqual(expected);
  });
});

describe("classifyForgeToolCall", () => {
  it.each(toolCases)("classifies %s", (name, args, expected) => {
    expect(classifyForgeToolCall(name, args)).toEqual(expected);
  });
});
