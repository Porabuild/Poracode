# poracode-git-helper

Native Rust daemon for Poracode's local Git status, multi-worktree batch queries, and project file/tree fuzzy search indexing (`src/supervisor/git/gitNativeHelperClient.ts`, `src/supervisor/git/statusService.ts`, `src/supervisor/ProjectSearchIndex.ts`, and `src/supervisor/fileIndex.ts`).

When many background agent threads run across sibling worktrees or large repositories are searched via `@` mentions / `Ctrl+P`, collecting status, scanning untracked files, and holding 50k–100k file index objects in V8 competes with the supervisor event loop. Native status uses in-process Git; file/tree search can still invoke Git subprocesses. One query helper (`--serve-v3`) and one separate watch helper (`--watch-v3`) per supervisor serve all local projects and worktrees, returning structured JSON over stdio NDJSON.

- `poracode-git-helper --hello` prints a one-line JSON handshake (`helper`, `helperVersion`, `protocolVersion`, `platform`, `arch`) verified by `scripts/prepare-git-helper.mjs`.
- `poracode-git-helper --serve-v3` runs the newline-delimited JSON request/response loop (`statusBatch`, `searchTree`, `searchFiles`, `invalidateSearch`, `ping`); unknown flags or mismatched `protocolVersion` envelopes fail closed.
- `poracode-git-helper --watch-v3` runs a separate long-lived watcher mode for all local projects and worktrees. Native filesystem callbacks, Git metadata discovery, noise filtering and 300 ms debounce stay in this process; only subscription acknowledgements and scoped Git/tree changes cross stdio. Targets without a compatible helper use the bundled filesystem worker. WSL keeps its bridge subscriptions.
- Concurrency & memory: request parsing stays on the query helper's main thread; status batches use bounded Rust workers and in-process Git. Search can run bounded Git subprocesses with per-command timeouts (`CREATE_NO_WINDOW` on Windows). Thread-safe untracked `(size, mtime)` caching and contiguous `String` arenas keep file statistics and 50k–100k file search indexes off the V8 heap. Filesystem callbacks, filters and debounce run in the separate watch helper.
- Fallback: WSL projects, complex extglob exclude patterns, and targets without a staged binary (`linux-arm64`, SSH hosts without target binaries) transparently fall back to the TypeScript supervisor implementations.
- Native status refuses unsupported command configuration, applied content filters or working-tree encodings, alternate attribute sources, unsupported repository/index formats (including intent-to-add), changed repository layouts, and installation-prefix includes. These requests use canonical Git through the TypeScript fallback. Ordinary `hasconfig` includes remain native.
- The watcher pins `notify` 9.0.0-rc.7 for Windows overflow-rescan and shutdown fixes missing from 8.x; OS event loss triggers scoped invalidation without periodic filesystem polling.

Build: `cargo build --release`. Stage: `node scripts/prepare-git-helper.mjs`.

The vendored libgit2 copyright, GPL v2 text and linking exception ship beside the staged helper in `resources/wsl-helpers/git-helper/libgit2-COPYING.txt`, including desktop, standalone and SSH resource layouts.
