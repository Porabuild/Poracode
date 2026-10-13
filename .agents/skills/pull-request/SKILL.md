---
name: pull-request
description: Opens or updates a Poracode pull request against master with a conventional title, the repo template body, verification evidence, and before/after screenshots for UI changes. Use when asked to "open a PR", "create a pull request", "publish this", "push and open a PR", or "update the PR description". Not for committing (use commit) or responding to review comments (use address-pr-feedback).
---

# Pull request

Get committed work into a draft PR that a reviewer can understand without reading every line of the diff. This is the repo-specific form of the in-app `publish-changes` skill (`resources/plugins/github/skills/publish-changes/SKILL.md`); its rules still apply: publish only when asked, ask only when the branch, included changes, base, or content is materially ambiguous, and never describe a check as passing unless you ran it.

## Steps

1. Confirm the work is committed on a non-`master` branch (see the `commit` skill) and the tree has nothing that belongs in this PR left unstaged.
2. Run the `verify` skill. Use the full gate if the PR will be marked ready.
3. If `src/renderer` strings changed, confirm they are localized and all 12 non-English catalogs are filled (`.agents/docs/i18n.md`). If persisted state, caches, manifests, protocols, or deployed helpers changed, complete the audit in `.agents/docs/versioning.md`.
4. If the UI visibly changed, capture screenshots (below).
5. Push: `git push -u origin HEAD`.
6. Write the body to `tmp/pr-body.md` following `.github/PULL_REQUEST_TEMPLATE.md`, then create the PR:
   ```sh
   gh pr create --draft --base master --title "<title>" --body-file tmp/pr-body.md \
     --attach './tmp/pr-shots/before.png#Before: <state>' \
     --attach './tmp/pr-shots/after.png#After: <state>'
   ```
   Drop `--draft` only when the user says the PR is ready. Drop `--attach` when there is no visible UI change.
7. Read it back with `gh pr view --json url,title,baseRefName,headRefName,isDraft,body` and fix anything wrong with `gh pr edit`. Check that images rendered as uploaded `user-attachments` URLs, not local paths.
8. Report the PR URL, branch, draft state, and anything left unverified.

## Title

Same format as the commit subject: `type(scope): subject`, imperative, lowercase after the colon, no trailing period, 72 characters or fewer. With an issue, the number comes first: `#123 fix(sidebar): show worktree identity while pending`. Never invent an issue number. Do not add `(#PR)`; GitHub appends it on squash merge. For a single-commit PR, the title usually equals the commit subject.

## Body

Use the template sections in order. Remove its HTML comments and any section you leave empty except the required ones.

- **First line**: `Closes #123`, or `Refs #123` when the PR only partly resolves the issue. Omit when there is no issue.
- **Summary**: what changed, in user-visible terms.
- **Why**: the problem or motivation.
- **Benefits**: concrete outcomes for users or maintainers. Optional; skip it when it would only restate Why.
- **How verified**: the commands actually run and their results, with counts. Name checks you did not run and why.
- **Before / After**: a two-column table, or `No visible UI change.`
- **Risk & rollback**: compatibility and versioned-state impact, and how to revert (usually reverting the merge commit; say so if a migration makes that unsafe).

Also note deliberate omissions, follow-ups, and anything that needs an owner decision.

## Screenshots

Required whenever the change visibly alters UI a user would see: `src/renderer`, `website/`, or mobile UI. Skip for changes with no visible effect and write `No visible UI change.`

- Drive the app with the managed launcher and CDP helper from `.agents/skills/interactive-testing/SKILL.md` (`run-poracode-smoke.mjs --launch-only --mode mock`, then `poracode-cdp.mjs nav|click|shot`). Do not start the app with raw `pnpm run dev`; the helper needs a managed session.
- Capture "after" on the branch and "before" from the merge-base (`git merge-base origin/master HEAD`). The simplest "before" is one taken before you edit. Otherwise use a temporary detached worktree outside this checkout with its own `pnpm install --frozen-lockfile`, and remove it with `git worktree remove` afterwards.
- Use the same window size, theme, data, and navigation state on both sides. For state-dependent UI, capture each affected state (empty, loading, error; light and dark if the change affects theming).
- Save captures under `tmp/pr-shots/` (gitignored). Never commit screenshots.
- Upload with `gh pr create --attach` or `gh pr edit <n> --attach`; the `#text` suffix becomes the alt text. If the body already contains `![Before](./tmp/pr-shots/before.png)` with the same path, gh rewrites it to the uploaded URL; otherwise the image is appended to the end of the body. Present them as:

  ```md
  | Before                               | After                              |
  | ------------------------------------ | ---------------------------------- |
  | ![Before](./tmp/pr-shots/before.png) | ![After](./tmp/pr-shots/after.png) |
  ```

- If the UI changed but capture is impossible (requires real credentials, a device, or a locked desktop), say why in the Before / After section instead of omitting it.

## Done when

- A draft PR (or ready, if asked) targets `master` from the intended branch.
- Title and body follow the rules above, and `gh pr view` confirms them.
- How verified lists only checks that actually ran.
- UI changes have rendered before/after images or a stated reason they could not be captured.
- The PR URL is reported.
