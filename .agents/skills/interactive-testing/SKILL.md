---
name: interactive-testing
description: Drives the real Poracode Electron app over Chrome DevTools Protocol for smoke, integration, and interactive UI testing, including screenshots. Use when asked to smoke test, integration test, click through the app, verify a UI change or refactor, reproduce a renderer crash, capture before/after screenshots, or check that a change did not regress. Reports per-surface evidence from a diff-derived coverage plan.
---

# Interactive Testing — Poracode

Test the real Electron renderer, preload bridge, main process, and supervisor
together. Unit tests complement this workflow; they do not replace it when this
skill applies. All scripts are under `.agents/skills/interactive-testing/scripts/`
(abbreviated `scripts/` below); run them with `node` from the repo root.
Launcher and session internals: [references/launcher.md](references/launcher.md).

## Choose the validation shape

Use the smallest path that proves the requested behavior, and use exactly one
app-launch command per validation run.

| Need                                           | Run                                                                                               | Proves                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Quick regression smoke after a focused change  | `scripts/run-poracode-smoke.mjs --scope changed --mode mock` (the default)                        | Isolated app boots, changed-surface checks and relevant mock gates pass, no renderer/runtime errors. |
| Broad regression or release confidence         | `scripts/run-poracode-smoke.mjs --scope full --mode mock`                                         | Full functional inventory, including app shell and cross-provider surfaces.                          |
| Manual checks or screenshots in a live app     | `scripts/run-poracode-smoke.mjs --launch-only --mode mock`, then drive it                         | The requested interaction in a persistent isolated app.                                              |
| A real provider / credential / device workflow | `scripts/run-poracode-smoke.mjs --launch-only --mode real`, drive real controls, then acknowledge | The external integration completes end to end.                                                       |
| Continue an already-running managed session    | `scripts/poracode-cdp.mjs info` (resolves the one active session; launches nothing)               | The next interaction in that exact app.                                                              |

Use the quick smoke for "smoke test", "check the app", or "make sure this did
not regress". Use real mode when asked whether a provider, ACP/tool call, login,
device, PTY, or other external integration works live. Run the full smoke only
for release-scale, broad cross-cutting, IPC/app-shell, or cross-provider
changes.

## Workflow

1. Inspect `git status --short` and the relevant diff.
2. Check the desktop precondition (below), then choose the validation shape.
3. For a quick or full smoke, run the one-command runner; it creates the
   isolated fixture, boots the app, derives the scope plan, runs the checks, and
   tears the app down.
4. For live work, generate the plan
   (`scripts/poracode-integration-smoke.mjs plan --scope changed`), then start or
   reuse one managed session with `--launch-only`.
5. Reset driven state, stop only the process launched for this run, check for
   unexpected git changes, and report.

Never claim "all functionality passed." Report automated, manual, skipped, and
not-applicable coverage separately.

## Desktop precondition

A visible DOM and a fast JavaScript evaluation do not prove that paint or input
delivery works. On macOS the smoke launcher checks the console lock state before
building or launching (it reads two console flags and nothing else). A locked
desktop requires the user to unlock it — do not retry captures or native UI
controls, extend deadlines, or change app rendering to compensate. Establish the
same precondition for any other launcher. If the lock is discovered after
launch, preserve the failed run and distinguish the observed current lock from
unknown historical state; independent protocol/source work may continue. See
[computer-use guidance](../../docs/computer-use.md#macos-locked-screen).

## Launching

Never use raw `pnpm run dev` or `pnpm run dev:test` for CDP work: they allocate
no managed session, which allows wrong ports, shared state, and duplicate
launches. The smoke runner owns and tears down its app; the `--launch-only`
launcher keeps one app alive and its owner process performs every stop.

When an agent must launch an independent session and keep working in the same
turn, use the detached launch instead of a `Start-Process`, redirection, or
wrapper script, with a fresh unique root so parallel agents cannot collide:

```sh
node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs launch --new --mode mock --root "$HOME/.poracode-smoke/<unique-agent-root>"
```

It prints `READY` with the exact `sessionFile`, ports, and URL. Keep that
terminal alive. When several sessions exist, pass `--session <session.json>` to
every helper; they refuse to guess. Stop with
`node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs stop`.

Never symlink a whole `node_modules` directory between worktrees or run `pnpm`
through such a link: pnpm can reconcile links relative to the other worktree and
rewrite its dependency tree. Run `pnpm install --frozen-lockfile` in each
checkout.

### Mock vs real mode

Poracode's own state is always isolated via `PORACODE_BASE_DIR`. Provider
detection, however, resolves each CLI through a login shell and reads
credentials under `HOME`.

- **Mock** sandboxes `HOME`/`APPDATA`, uses a mock keychain, and sets
  `PORACODE_MOCK_AGENTS=1`, so thread launches, one-shots, and provider
  sign-in/out fail with "Agent launch refused". Providers showing "Not found" in
  mock mode is expected; never diagnose a real detection issue from it.
- **Real** keeps the real `HOME` so authenticated providers detect as in the
  shipped app. Verify provider-dependent surfaces here. Detection runs
  `command -v <binary>` with `cwd` set to the home directory, so a CLI that is on
  `PATH` only through a project-scoped mechanism (direnv, asdf/mise local, a
  per-repo `.env`) is invisible — the app log shows `direnv: unloading`. Fix the
  environment (put the binary on a globally resolvable `PATH`, e.g.
  `~/.local/bin`), not the app.

## Driving the app

```sh
node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs info
node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs eval 'location.href'        # '-' reads JS from stdin; --await for promises
node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs nav about                   # open a Settings section
node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs click '[data-testid="settings-save"]'
node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs type 'input[name="query"]' 'test'
node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs reset                       # return driven state to baseline
```

Actions bind to the session token and the `main` window; pass
`--windowKind quickComposer` or `--windowKind browserExtract` only when that
surface is under test. The helper rejects missing, hidden, disabled, read-only,
off-screen, and ambiguous targets instead of clicking stale coordinates.
Re-query selectors after navigation, portal opening, or hot reload (HeroUI menus
and dialogs render in portals). A successful click or type proves only safe
dispatch — evaluate or screenshot the expected state change before marking a
gate passed. Smoke drivers share pointer logic through
`scripts/poracode-cdp-actions.mjs`; import it rather than duplicating dispatch.
`window.__poracodeDev` (DEV bridge, `src/renderer/devBridge.ts`) exposes the
renderer stores and navigation helpers for deterministic setup.

Windows/PowerShell quoting: [references/launcher.md](references/launcher.md#powershell).

## Screenshots

```sh
# Full viewport
node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs shot - "<outDir>/after-settings.png"
# One element, by CSS selector (captured even if it extends below the fold)
node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs shot '[role="dialog"]' "<outDir>/after-dialog.png"
```

`shot` writes a PNG to the given path and prints it. Use the session's `outDir`
(the `outDir` field of the `session.json` that `info` prints as `sessionFile`,
under `~/.poracode-smoke/`) so artifacts stay outside the repository, where file
watchers would restart Electron. Copy only the images you intend to publish.

For comparable before/after images:

- Launch one managed session per code state — for example, a separate worktree
  at the base commit for "before" and the change branch for "after". A session
  is reused only while the checkout's source matches, so the two states never
  share an app.
- Do not resize the window. Fresh isolated sessions open at the app's default
  window size, so shots from two fresh sessions line up.
- Set the theme explicitly in both sessions before capturing:
  `poracode-cdp.mjs eval '__poracodeDev.stores.sharedSettings.getState().setThemeMode("dark")'`
  (`"light"` or `"dark"`; avoid `"system"`). Capture both themes when the change
  affects color.
- Drive both sessions to the same state with the same commands, wait for the
  UI to settle, and shoot the same selector (or `-`) with matching file names.

## Deterministic suite

Against the one active managed session (or with `--session <session.json>`):

```sh
node .agents/skills/interactive-testing/scripts/poracode-integration-smoke.mjs run --scope changed --mode mock --outDir "<outDir>"
node .agents/skills/interactive-testing/scripts/poracode-integration-smoke.mjs run --scope full --mode mock --outDir "<outDir>"
```

Exit `0`: automated scenarios and mock gates passed. Exit `1`: a scenario or the
coverage audit failed. Exit `2`: `--mode real` with real manual gates remaining.

The runner dismisses the welcome screen through its real primary action, then
checks boot/render health, preload and DEV bridges, crash-screen markers,
runtime exceptions, unhandled rejections, console errors, and screenshots.
Depending on the plan it walks every Settings section, opens thread search, runs
the Browser harness, and executes mock IPC/project/provider/auth/terminal/runtime
checks against the fixture. Mock gates use fixtures, deterministic store state,
and mocked provider/auth/runtime data and report as `mocked`; quick-composer and
shutdown mock gates have limits described in
[references/launcher.md](references/launcher.md#native-bridge-mock-gates).

The Browser harness runs automatically when Browser paths changed; run it
directly with
`scripts/poracode-browser-smoke.mjs --outDir "<outDir>/browser"`. It verifies
embedded page creation, DOM access, navigation history, toolbar state, Browser
settings, screenshots, and zero renderer console errors.

## Real gates

Use `--mode real` only when real credentials, devices, or services are
intentionally available. Exercise a real gate through real controls before
acknowledging it, then record exactly the gates exercised:

```sh
node .agents/skills/interactive-testing/scripts/poracode-integration-smoke.mjs run --scope changed --mode real --outDir "<outDir>" --ack-manual provider-live,runtime-requests
```

For example, an ACP question run that visibly opened the form, submitted an
answer, and received the provider reply acknowledges
`changed-surface,ipc-roundtrip,provider-live,runtime-requests`.

- Changed provider: start a fresh thread in the isolated project, observe the
  user row and first provider output, then stop it.
- Permission flow: request a harmless read-only command and choose Deny unless
  the user authorized execution.
- Terminal changes: verify a real PTY launch, input, resize, interrupt, and stop.
- Git/file changes: mutate only the fixture repository.

For provider chat turn and ACP coverage, also use the `provider-chat-smoke`
skill.

## Coverage integrity

`scripts/smoke-scenarios.mjs` is the functional source of truth: it maps
production paths to automated scenarios and manual gates. Update it in the same
change when adding a production surface or subsystem, then run
`scripts/poracode-integration-smoke.mjs audit`, which fails when a tracked
production file is unmapped. If a changed behavior cannot be automated against
a safe fixture, add a deterministic mock gate with a concrete assertion and keep
a real gate only when an external system is genuinely required. Never weaken an
assertion or omit a gate to make the run green.

## Safety and teardown

- Keep `PORACODE_BASE_DIR` under `$HOME/.poracode-smoke`; never touch real
  threads or settings.
- `session.json` is the only attachment authority; never infer ports from window
  titles, old logs, or nearby listeners.
- Never blanket-kill Electron, Node, or `electron.exe`; stop only this run's
  session.
- Never send destructive prompts or approve destructive permission requests.
- Run `poracode-cdp.mjs reset` and close transient panels, then
  `poracode-cdp.mjs stop`.
- Leave the smoke directory for inspection unless asked to clean up, and never
  commit smoke artifacts or source changes made only to reach a UI state.

## Report

Give one verdict per functional area with:

- automated scenarios with PASS/FAIL;
- mock gates with PASS/FAIL, and real gates with PASS/FAIL/SKIPPED and reasons;
- console/runtime error count and the first three errors;
- screenshot and `smoke-report.json` paths;
- untested functionality and why;
- the suspected source file and line for each regression.

A `--mode real` run is not successful while the script exits `2` or any required
real gate is unresolved. A mock PASS means deterministic local integration
passed; it does not cover real provider credentials or devices.
