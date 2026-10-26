---
name: verify
description: Runs Poracode's canonical pre-push check gate and reports exact commands and results. Use when asked to "verify", "run the checks", "make CI green", "fix all checks", "is this ready to push", or before committing, pushing, or marking a PR ready. Not for driving the live app (use interactive-testing) or reviewing code quality (use a review skill).
---

# Verify

The single gate to pass before pushing. Prove the change works with real checks, then report exactly what ran.

## Rules

- Never weaken a check to get green: no skipping or deleting tests, no `.skip`/`.only`, no disabling lint rules, no loosening types, no raising timeouts or thresholds. If a check is wrong, say so and fix it in a separate, explained change.
- A syntax-only or compile-only pass is not verification of behavior; run the tests that exercise the change.
- A failure you did not cause is still reported. Confirm it also fails on `origin/master` before calling it pre-existing.
- Report every command with its result (pass/fail, test and file counts). State what you did not run and why.

## Focused gate (default)

Use for in-progress work and focused fixes.

1. Lint and format the touched files:
   ```sh
   bun run cross-env npm_lifecycle_event=lint bun lint --deny-warnings <files>
   bun run cross-env npm_lifecycle_event=lint bun lint --type-aware --deny-warnings -c .oxlintrc.type-aware.json <files>
   bun run cross-env npm_lifecycle_event=fmt bun fmt --check <files>
   ```
   The pinned Bun preview uses `npm_lifecycle_event` to select the built-in command instead of a same-named package script.
2. Run the nearby tests: the touched files' `*.test.ts(x)` plus tests for direct callers.
   ```sh
   bun run vitest run <test paths or dirs>
   ```
   Use `bun run vitest run`; Jest-only flags such as `--runInBand` do not exist here.
3. `bun run typecheck`.

## Full gate

Run all four when asked to fix all checks, before marking a PR ready for review, or when the change crosses shared runtime, IPC, or build config:

```sh
bun run fmt:check
bun run lint
bun run typecheck
bun run test
```

## Conditional gates

Add these when the change touches the matching area:

- **Renderer strings** (`src/renderer`): `bun run i18n:extract` reports 0 missing for every locale and every new `msgstr` is filled in all 12 non-English catalogs. See `.agents/docs/i18n.md`.
- **Persisted state, caches, manifests, wire/IPC protocols, deployed helpers**: complete the audit in `.agents/docs/versioning.md` ("Required check for every change") and add the pre-upgrade regression test it calls for.
- **Remote protocol contract** (`src/shared/remote/contract/`, `protocol/remote/v3/`): `bun run protocol:remote:v3:check`, then `bun run vitest run --config tests/native-e2e/vitest.config.ts operationMap.test.ts` (the operation-map hash lock).
- **Module boundaries or new cross-layer imports**: `bun run architecture:check`.
- **Website** (`website/`): `bun run typecheck:website`.
- **Perf-sensitive paths** (CLI hook chain, remote protocol): `bun run test:perf:cli-hook` or `bun run test:perf:remote`.
- **Provider runtime behavior**: `bun run test:integration:providers` when the provider CLIs are available; otherwise say it was not run.
- **Visible UI or app-shell behavior**: a mock smoke run via the `interactive-testing` skill (`bun run smoke:integration` wraps its runner).
- **Smoke harness scripts** (`.agents/skills/interactive-testing/scripts/`): `node --test .agents/skills/interactive-testing/scripts/*.test.mjs`.
- **TUI** (`tui/`): `bun run tui:typecheck` and `bun run tui:test`.

## CI map

`.github/workflows/ci.yml` runs these on every PR; docs-only changes (`docs/`, `*.md`) skip everything except Format.

- Typecheck: `bun run typecheck` (Bun, all available cores; `bun run typecheck:tsc` is available for compiler comparison).
- Lint: `bun run lint`, `bun run architecture:check`, smoke-harness and release/qualification script tests, and the native-e2e `managedAppSession` and `operationMap` locks.
- Format: `actionlint` on workflows, then `bun run fmt:check`.
- Canonical web build: `bun run build:web`.
- Runtime dependencies: `bun run build:electron` plus the runtime-deps check in `scripts/build-desktop-artifact.mjs`.
- Rust helper: `cargo fmt`, `clippy`, `test`, `doc`, `deny`.
- TUI: `bun run tui:typecheck` and `bun run tui:test`.
- Test shards: `bun run test` split 8 ways.
- Perf suites: `bun run test:perf:cli-hook` and `bun run test:perf:remote`.

`.github/workflows/native-ci.yml` runs `bun run protocol:remote:v3:check`, the remote-v3 contract tests, and the Android and iOS builds when shared or native code changes.

## Done when

- The focused gate (or the full gate, when required) and every applicable conditional gate passed.
- Any remaining failure is reported with its cause and evidence that it is pre-existing or out of scope.
- The report lists each command run with its result, and each relevant check not run with the reason.
