# Copy gitignored files into new worktrees

**Date:** 2026-06-10
**Status:** Approved

## Problem

Files excluded by `.gitignore` (most commonly `.env` and friends) are not part of a
checkout, so a freshly created worktree is missing them. Users currently have to copy
them by hand or script it via the setup script. Project worktree settings should let
users declare which ignored files to carry over, and Lightcode should copy them
automatically when a worktree is created.

## Decisions

- Users specify files with **gitignore-style patterns** (e.g. `.env.*`), one per line —
  not a file picker.
- Copying happens **only at worktree creation**. No sync action for existing worktrees.
- Candidate files are enumerated with git, not a filesystem walk: only files that are
  actually ignored in the main project can match, so tracked files in the fresh
  checkout are never clobbered, and fully-ignored directories (`node_modules/`)
  collapse to a single entry, keeping enumeration fast.

## Design

### Settings schema

Add to `projectScriptsSchema` in `src/shared/contracts/project.ts`:

```ts
worktreeCopyPatterns: z.array(z.string()).optional(),
```

The field rides in the existing `scripts` JSON column of the `projects` table — no DB
migration. Patterns are stored as a cleaned array (trimmed, no blanks, no `#` comments).

### UI

`src/renderer/views/ProjectSettingsOverlay/parts/ScriptsSection.tsx` (the "Worktrees"
settings page) gains a third field alongside Setup script and Cleanup script:

- Label: "Copy ignored files"
- Help text: copied from the main project into each new worktree; gitignore-style
  patterns, one per line.
- `TextArea`, monospace, placeholder `.env\n.env.*`
- Saved on blur like the other fields. The textarea shows raw lines; on save, lines are
  trimmed and blank lines / `#` comments dropped before storing as `string[]`.

### IPC plumbing

- `gitAddWorktreePayloadSchema` (`src/shared/contracts/git.ts`) gains
  `copyIgnoredPatterns: z.array(z.string()).optional()`.
- The renderer call site (`AppContent.tsx`, `gitAddWorktree` call) passes
  `project.scripts?.worktreeCopyPatterns`.
- `runtime.gitAddWorktree` forwards the field to `worktreeService.addWorktree`.

### Copy step (supervisor)

In `src/supervisor/git/worktreeService.ts`, after `git worktree add` succeeds and
before returning:

1. If no patterns, skip.
2. Run `git ls-files --others --ignored --exclude-standard --directory` in the main
   project to enumerate ignored entries (files, plus collapsed `dir/` entries for
   fully-ignored directories).
3. Filter entries with the existing `micromatch` dependency initialized from the
   user's patterns.
4. For each match, copy from main project to the same relative path in the new
   worktree with `fs.cp` (`recursive: true` so matched directory entries copy whole).
   Destination parent directories are created as needed. Existing destination files are
   never overwritten (`force: false`).

Path handling: posix and windows locations use the repo path directly; WSL locations
use the UNC path, which Node `fs` on Windows can read and write.

The matching/copy logic lives in a small helper module (e.g.
`src/supervisor/git/copyIgnoredFiles.ts`) so it is unit-testable without a real
worktree.

### Error handling

The copy step is non-fatal. Any failure (enumeration, matching, individual copy) is
caught, logged with a warning, and worktree creation still returns success. A missing
or empty pattern list is a no-op.

### Testing

- Unit tests for the helper: pattern filtering (`.env.*` matches `.env.local`, not
  `node_modules/`), directory entries, no-overwrite behavior, empty/comment lines.
- Extend the existing renderer test that asserts the `gitAddWorktree` payload
  (`src/renderer/app.test.tsx`) to cover `copyIgnoredPatterns` being passed from
  project settings.

## Out of scope

- Re-syncing files into existing worktrees after pattern changes.
- A file-picker UI for selecting ignored files.
- Copying files that live inside fully-ignored directories without matching the
  directory itself (e.g. `dist/.env` when all of `dist/` is ignored — git collapses it
  to `dist/`, so only a pattern matching `dist/` would copy it).
