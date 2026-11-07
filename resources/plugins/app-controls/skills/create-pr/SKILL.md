---
name: create-pr
description: Commit and push the current worktree and create or update a pull request with an accurate title, description, verification evidence, and screenshots where they help review a visible UI change. Use for Create PR, open a pull request, or publish changes. Does not merge unless requested.
---

# Create PR

The user's request authorizes committing the intended changes, pushing, and creating or updating their PR.
Keep the current worktree and branch. Read repository instructions and its PR template, inspect the complete change
against the intended base, and resolve the remote repository from the actual configuration. Use the repository's
default or specified base; never assume `main` or `master`. Reuse the existing PR for this head/base instead of
opening a duplicate. A PR request alone does not authorize merging.

## Prepare the change

1. Review the changes and fix confirmed in-scope issues. Run the repository's verification workflow and real manual
   QA for changed interactions. Record what ran and what remains unverified. Capture UI evidence as described below.
2. Use the `commit` skill for any intended uncommitted work. Preserve unrelated work and stay on the current branch.
3. Resolve `projectId` and the exact `worktreePath` from `get_current_thread`. Prefer Poracode's `git_sync` with
   `action: push` and `setUpstream: true`, then `gh_create_pr` with the same worktree and explicit branch and base.
   Create a draft unless the user requested readiness or invoked Finalize through merge.
4. Use `gh_get_pr` to read back the result and synchronize Poracode's UI. Verify the head, base, draft state, title,
   body, and URL. Inspect live schemas; older hosts may lack some tools or omit core `pr` state.

Use CLI only for unavailable operations, such as editing title/body or attaching local screenshots. After those
operations, call `git_status` and `gh_get_pr` when available. Never repeat a successful publication because its UI
refresh failed: check the existing remote object first. A `syncWarning` means the operation succeeded but refresh
needs retrying.

## Title and description

Follow the repository's commit/title convention. Otherwise use `type(scope): imperative subject`, at most 72
characters, lowercase after the colon, without a trailing period. Rewrite the title and body around the final diff
when scope changes. Do not use a list of commit subjects as the description.

Use the repository's template. With no template, cover the concrete problem, resulting behavior, motivation, checks
and manual QA actually performed, visual evidence, and material risks or rollback. Include an issue-closing reference
only for a real linked issue. Keep simple changes brief; explain complex changes enough for a reviewer without the
conversation. Do not claim a check passed without its observed result or call mock evidence a live integration.

Pass multiline content as a structured tool argument. For CLI fallback, write it to a temporary body file and use
`gh pr create` or `gh pr edit` with `--body-file`; preserve actual newlines and literal shell characters.

## Screenshots

Screenshots are for reviewers. Before launching anything, choose the cheapest level that still shows what the diff
and a sentence cannot, unless the repository's PR rules require more:

- **None**: no visible effect, or one sentence conveys it completely, such as copy or translation edits,
  accessibility-only changes, or a fix that makes existing UI work without changing how it looks. Say so in the
  description.
- **After only**: new UI whose before state is just its absence, such as a new control, dialog, setting, or state.
  Capture the changed region once and describe the old state in a sentence.
- **Before and after**: the appearance of existing UI changes and the comparison is the point, such as layout,
  spacing, sizing, styling, theming, or a visual bug. Capture both in the same viewport, theme, data, and
  interaction state.

Take shots in the QA session while it is still running instead of launching another. Only the before-and-after
level needs the old code: prefer a capture taken before editing; otherwise use a separate temporary checkout at the
merge base with its own dependencies and isolated app profile, and never reset or disrupt the user's active
worktree.

Use the project's interactive testing workflow when available, or an appropriate connected browser/device tool.
Capture only the changed surface and the states the change affects. Keep scratch images in the project's ignored
temporary directory. Never fabricate a before image or present a mockup as a running app.

Upload images through a supported attachment tool. If the installed `gh pr create --help` / `gh pr edit --help`
advertises `--attach`, use it with each local path (and optional `#alt text`). Put the matching local image references
in the body (a Before / After table for comparisons) so gh replaces them with uploaded URLs. Do not assume older gh
versions support the flag. Read back the body and verify accessible uploaded image URLs, never local paths.
If capture or upload is blocked, state the exact missing environment or capability; do not claim screenshots exist.

Report the PR URL, draft/ready state, verification, and any blocker. Leave the PR open unless merge was authorized.
