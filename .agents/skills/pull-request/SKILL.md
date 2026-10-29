---
name: pull-request
description: Opens or updates a Poracode pull request against master with a conventional title, the repo template body, verification evidence, and screenshots where they help review a UI change. Use when asked to "open a PR", "create a pull request", "publish this", "push and open a PR", or "update the PR description". Not for committing (use commit) or responding to review comments (use address-pr-feedback).
---

# Pull request

Get committed work into a draft PR that a reviewer can understand without reading every line of the diff. This is the repo-specific form of the in-app `publish-changes` skill (`resources/plugins/github/skills/publish-changes/SKILL.md`); its rules still apply: publish only when asked, ask only when the branch, included changes, base, or content is materially ambiguous, and never describe a check as passing unless you ran it.

## Steps

Prefer Poracode's `git_sync` (push) and `gh_create_pr` when available, using the current thread's project and exact
worktree path. Read back with `gh_get_pr` to synchronize the UI. Use CLI for operations the tools do not expose,
including title/body edits and attachment upload, then refresh with `gh_get_pr` and `git_status`. Inspect schemas on
older hosts. Reuse an existing PR for this branch/base. A `syncWarning` requires a readback, not repeating publication.

1. Confirm the work is committed on a non-`master` branch (see the `commit` skill) and the tree has nothing that belongs in this PR left unstaged.
2. Run the `verify` skill. Use the full gate if the PR will be marked ready. Reuse a completed gate only when it covered the exact unchanged final tree.
3. If `src/renderer` strings changed, confirm they are localized and all 12 non-English catalogs are filled (`.agents/docs/i18n.md`). If persisted state, caches, manifests, protocols, or deployed helpers changed, complete the audit in `.agents/docs/versioning.md`.
4. Choose the screenshot level and capture only what it calls for (below).
5. Push: `git push -u origin HEAD`.
6. Write the body to `tmp/pr-body.md` following `.github/PULL_REQUEST_TEMPLATE.md`, then create the PR:
   ```sh
   gh pr create --draft --base master --title "<title>" --body-file tmp/pr-body.md \
     --attach './tmp/pr-shots/after.png#After: <state>'
   ```
   Drop `--draft` when the user says ready or invokes `finalize` through merge. Attach each image the screenshot level calls for: add `--attach './tmp/pr-shots/before.png#Before: <state>'` for a before / after pair, and drop `--attach` at level None. Check that the installed gh advertises `--attach`; older versions may need another supported upload tool.
7. Read it back with `gh pr view --json url,title,baseRefName,headRefName,isDraft,body` and fix anything wrong with `gh pr edit`. Check that images rendered as uploaded `user-attachments` URLs, not local paths.
8. Report the PR URL, branch, draft state, and anything left unverified.

## Title

Same format as the commit subject, including the leading issue number when there is one (see the `commit` skill). For a single-commit PR the title usually equals the commit subject.

## Body

Use the template sections in order. Remove its HTML comments. Summary, Why, How verified, Before / After, and Risk & rollback are required; drop Benefits when it would only restate Why.

- **First line**: `Closes #123`, or `Refs #123` when the PR only partly resolves the issue. Omit when there is no issue.
- **Summary**: what changed, in user-visible terms.
- **Why**: the problem or motivation.
- **Benefits**: concrete outcomes for users or maintainers. Optional; skip it when it would only restate Why.
- **How verified**: the commands actually run and their results, with counts. Name checks you did not run and why.
- **Before / After**: what the screenshot level calls for (below): the two-column table, one After image with its sentence, or the level None text.
- **Risk & rollback**: compatibility and versioned-state impact, and how to revert (usually reverting the merge commit; say so if a migration makes that unsafe).

Also note deliberate omissions, follow-ups, and anything that needs an owner decision.

## Screenshots

Screenshots are for reviewers: add one only when it shows what the diff and a sentence cannot. Choose the level from the final diff before launching anything, and take the cheaper level when an extra image would add little.

- **None**: no visible effect, or one sentence conveys it completely, such as copy or translation edits, ARIA or keyboard-only changes, or a fix that makes existing UI work without changing how it looks. Write `No visible UI change.` or that sentence.
- **After only**: new UI whose before state is just its absence, such as a new control, dialog, setting, section, or state. Capture the changed region once and describe the old state in a sentence.
- **Before / after**: the appearance of existing UI changes and the comparison is the point, such as layout, spacing, alignment, sizing, styling, theming, or a visual bug like clipping or overflow.

To capture:

- Drive the app with the managed launcher and CDP helper from `.agents/skills/interactive-testing/SKILL.md` (`run-poracode-smoke.mjs --launch-only --mode mock`, then `poracode-cdp.mjs nav|click|shot`), or reuse a QA session already running on the final tree. Do not start the app with raw `bun run dev`; the helper needs a managed session. After the shots are in `tmp/pr-shots/`, stop the session and delete that smoke root. A before session and an after session are two roots; delete both.
- Shoot the smallest region that shows the change (`shot '<selector>'`) rather than the whole window. Add a state (empty, loading, error) or the other theme only when the change alters it.
- Only the before / after level needs "before", captured from the merge-base (`git merge-base origin/master HEAD`). The simplest "before" is one taken before you edit. Otherwise use a temporary detached worktree outside this checkout with its own `bun install --frozen-lockfile`, and remove it with `git worktree remove` afterwards. Use the same window size, theme, data, and navigation state on both sides.
- Save captures under `tmp/pr-shots/` (gitignored). Never commit screenshots.
- Upload with `gh pr create --attach` or `gh pr edit <n> --attach`; the `#text` suffix becomes the alt text. If the body already contains `![Before](./tmp/pr-shots/before.png)` with the same path, gh rewrites it to the uploaded URL; otherwise the image is appended to the end of the body. Present a before / after pair as below, and an after-only shot as `![After](./tmp/pr-shots/after.png)` followed by its sentence:

  ```md
  | Before                               | After                              |
  | ------------------------------------ | ---------------------------------- |
  | ![Before](./tmp/pr-shots/before.png) | ![After](./tmp/pr-shots/after.png) |
  ```

- If the chosen level needs images but capture is impossible (requires real credentials, a device, or a locked desktop), say why in the Before / After section instead of omitting it.

## Done when

- A draft PR (or ready, if asked) targets `master` from the intended branch.
- Title and body follow the rules above, and `gh pr view` confirms them.
- How verified lists only checks that actually ran.
- Before / After matches the screenshot level: rendered uploaded images, a stated reason they could not be captured, or the level None text.
- The PR URL is reported.
