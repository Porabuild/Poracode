# Native (Rust) helpers

Read this before writing a new standalone process or optimizing a module's
memory, CPU, startup, or latency. `AGENTS.md` states the rule; this doc holds
the decision guide and the procedure.

## When to write Rust

- **New code is Rust by default** when it is a standalone executable (helper,
  relay, sidecar, per-session or per-server worker, CLI) or a self-contained
  CPU- or memory-bound module (parsing, indexing, diffing, compression, media).
- **Performance work always weighs a Rust rewrite.** List it next to fixes in
  the module's current language, measure the baseline and the candidate on the
  same workload, and put the numbers in the PR. Rust usually wins when:
  - many instances run at once (one per thread, server, or project): every Node
    or Electron-as-Node process costs about 14–20 MB of private memory before
    doing any work, while a Rust helper costs 1–3 MB;
  - startup time matters, or the work is CPU-bound;
  - the module already runs as its own process, so a native boundary adds
    nothing new.
- **TypeScript stays** for renderer UI and React, provider adapters, and host,
  backend, and supervisor services that own in-process state, stores, IPC, or
  shared contracts. A native boundary there adds a process or a binding layer;
  choose it only when a measurement shows it pays for itself.

Measuring: on macOS, `footprint -p <pid>` reports `phys_footprint` (what the
process costs) and `ps -o rss= -p <pid>` the resident size; on Linux, read
`Private_*` and `Pss` from `/proc/<pid>/smaps_rollup`. Sample right after the
workload and again after an idle minute, because V8 heaps shrink late.

## Existing helpers

| Crate                        | Binary                  | Role                                                                                    | Staged at                                    | Without a binary                                       |
| ---------------------------- | ----------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| `native/computer-use-helper` | `poracode-computer-use` | `computer_use` backends ([computer-use.md](computer-use.md))                            | `resources/computer-use-helper/<target>/`    | legacy foreground driver (Windows, macOS)              |
| `native/mcp-relay`           | `poracode-mcp-relay`    | MCP HTTP relay, stdio cwd launcher, and tool-filter/schema proxy for stdio & plain HTTP | `resources/wsl-helpers/mcp-relay/<target>/`  | `mcp-relay.mjs`, `mcp-stdio.mjs`, and `mcp-filter.mjs` |
| `native/git-helper`          | `poracode-git-helper`   | in-process local Git status, scoped filesystem watching, and project search             | `resources/wsl-helpers/git-helper/<target>/` | TypeScript status/search and bundled watcher worker    |

Targets are `darwin-universal` (lipo of x86_64 and aarch64), `win32-x64`,
`win32-arm64`, and `linux-x64` (static musl). The Linux MCP relay is also
packaged into Windows desktop builds for x64 WSL distros and Linux SSH runtime
archives. Linux arm64, arm64 WSL distros, `https:`/SSE/failure-isolated MCP
upstreams, and macOS SSH hosts use the MCP `.mjs` fallbacks. Git operations in
WSL continue through the existing bridge.

## Adding a helper

1. **Crate.** Create `native/<name>/` like the existing crates: a pinned
   `rust-toolchain.toml`, `.cargo/config.toml` (static CRT on MSVC),
   `rustfmt.toml`, `deny.toml`, a committed `Cargo.lock`, and a `README.md`. No
   `unwrap`, `expect`, or `panic!` outside tests. Prefer `std` and small,
   established crates, since every dependency ships in every install; new crate
   versions must be at least 7 days old, and `cargo deny check` must pass.
2. **Contract.** Add a `--hello` flag that prints the helper version and the
   protocol or config version it speaks, and fail closed on unknown versions. A
   helper that replaces a TypeScript implementation ports its behavior exactly;
   any improvement is deliberate and tested.
3. **Staging.** Add `scripts/prepare-<name>.mjs` as a spec for the shared
   driver `scripts/lib/native-helper-prepare.mjs` (arg parsing, host/target
   selection, freshness, cargo/rustup checks, Windows/Linux and macOS lipo
   staging, `--hello` handshake, manifest, `--check`, `--require`,
   `--host-only`): the script only declares its crate, binary name, staging
   dir, version constant, hello validation, manifest schema, and messages.
   Include `scripts/lib/native-helper-prepare.mjs` in every artifact-cache
   `hashFiles` key that names the prepare script.
4. **Shipping.** Stage into a directory that every layout already ships
   (desktop extraResources, server tarball, SSH runtime bundles);
   `resources/wsl-helpers/` covers MCP launch helpers. Wire the prepare step
   into `package.json` (`prepare:desktop-package-assets`),
   `scripts/dev-launch.mjs`, `.github/workflows/_build.yml`, and
   `.github/workflows/_server-artifact.yml`, with an artifact cache keyed on the
   crate sources.
5. **CI.** Add a job to `.github/workflows/ci.yml` that runs `cargo fmt
   --check`, `clippy -D warnings`, `test`, `doc`, and `cargo deny` on Linux,
   Windows, and macOS, and add it to `ci_gate`. Packaging workflows run only for
   nightly and release builds, so run the prepare script locally before pushing.
6. **Runtime.** Resolve the staged binary for the host target, and keep a
   fallback for every target without one: a missing binary must never fail a
   launch.
7. **Versioning.** Add the helper to the deployed-helper inventory in
   [versioning.md](versioning.md).
8. **Tests.** Write Rust unit tests and integration tests that run the built
   binary. When a TypeScript implementation exists, run its test scenarios
   against the binary too, so the two stay in parity.
