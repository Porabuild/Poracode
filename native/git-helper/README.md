# poracode-git-helper

Native Rust daemon for Poracode's local Git status and multi-worktree batch queries (`src/supervisor/git/gitNativeHelperClient.ts` and `src/supervisor/git/statusService.ts`).

When many background agent threads run across sibling worktrees, spawning dozens of short-lived `git` subprocesses, parsing porcelain v2 + `--numstat` outputs, and running per-file `stat` + `readFile` untracked line/binary scans in Node competes with the supervisor event loop. One persistent `poracode-git-helper` sidecar per supervisor (~2 MB private memory) executes multi-worktree `git` batches and untracked file scans across a bounded Rust OS thread pool and returns structured JSON over stdio NDJSON.

- `poracode-git-helper --hello` prints a one-line JSON handshake (`helper`, `helperVersion`, `protocolVersion`, `platform`, `arch`) verified by `scripts/prepare-git-helper.mjs`.
- `poracode-git-helper --serve-v1` runs the newline-delimited JSON request/response loop; unknown flags or mismatched `protocolVersion` envelopes fail closed.
- Concurrency: stdin parsing stays on the main thread; worktree queries and inner `git` subprocess fans run on bounded Rust worker pools with per-command timeouts (`CREATE_NO_WINDOW` on Windows) and thread-safe untracked `mtime + size` line-count caching.
- Fallback: WSL projects and targets without a staged binary (`linux-arm64`, SSH hosts without target binaries) transparently fall back to the TypeScript `GitStatusService` + `gitExecWorker` path.

Build: `cargo build --release`. Stage: `node scripts/prepare-git-helper.mjs`.
