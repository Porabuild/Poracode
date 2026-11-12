# poracode-git-helper

Native Rust daemon for Poracode's local Git status, multi-worktree batch queries, and project file/tree fuzzy search indexing (`src/supervisor/git/gitNativeHelperClient.ts`, `src/supervisor/git/statusService.ts`, `src/supervisor/ProjectSearchIndex.ts`, and `src/supervisor/fileIndex.ts`).

When many background agent threads run across sibling worktrees or large repositories are searched via `@` mentions / `Ctrl+P`, spawning dozens of short-lived `git` subprocesses, parsing porcelain v2 + `--numstat` outputs, scanning untracked files, and holding 50k–100k file index objects in V8 competes with the supervisor event loop. One persistent `poracode-git-helper` sidecar per supervisor executes multi-worktree `git` batches, untracked file scans, and arena-allocated fuzzy file/tree searches across a bounded Rust OS thread pool and returns structured JSON over stdio NDJSON.

- `poracode-git-helper --hello` prints a one-line JSON handshake (`helper`, `helperVersion`, `protocolVersion`, `platform`, `arch`) verified by `scripts/prepare-git-helper.mjs`.
- `poracode-git-helper --serve-v2` runs the newline-delimited JSON request/response loop (`statusBatch`, `searchTree`, `searchFiles`, `invalidateSearch`, `ping`); unknown flags or mismatched `protocolVersion` envelopes fail closed.
- Concurrency & memory: stdin parsing stays on the main thread; worktree queries and inner `git` subprocess fans run on bounded Rust worker pools with per-command timeouts (`CREATE_NO_WINDOW` on Windows), thread-safe untracked `(size, mtime)` caching, and contiguous `String` arenas for 50k–100k file search indexes off the V8 heap.
- Fallback: WSL projects, complex extglob exclude patterns, and targets without a staged binary (`linux-arm64`, SSH hosts without target binaries) transparently fall back to the TypeScript supervisor implementations.

Build: `cargo build --release`. Stage: `node scripts/prepare-git-helper.mjs`.
