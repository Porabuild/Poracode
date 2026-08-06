---
name: interactive-testing
description: Run repeatable integration and smoke testing against the real Poracode Electron app through Chrome DevTools Protocol. Use when asked to smoke test, integration test, interactively test, verify a refactor in the UI, reproduce a renderer crash, click through the app, or check that changes did not regress functionality. Build a diff-derived coverage plan, run the scripted baseline and targeted scenarios, complete every required manual gate, capture screenshots and runtime errors, and report explicit per-surface evidence.
---

# Interactive Testing — Poracode

Test the real Electron renderer, preload bridge, main process, and supervisor integration. Treat unit tests as complementary; do not substitute them for this workflow when the skill triggers.

## Required workflow

1. Inspect `git status --short` and the relevant diff.
2. Choose the validation shape below before launching anything.
3. For an ordinary quick or full smoke, run its one-command runner directly; it creates the isolated fixture, boots the app, derives the scope plan, runs the checks, and tears the app down.
4. For a manual live check, generate the plan, then start or reuse one managed debug session:

   ```sh
   node .agents/skills/interactive-testing/scripts/poracode-integration-smoke.mjs plan --scope changed
   node .agents/skills/interactive-testing/scripts/run-poracode-smoke.mjs --launch-only --mode mock
   ```

5. Audit the functional inventory only when changing `scripts/smoke-scenarios.mjs`, adding a production surface, or investigating coverage selection:

   ```sh
   node .agents/skills/interactive-testing/scripts/poracode-integration-smoke.mjs audit
   ```

6. Use fixture projects, deterministic store state, and mocked provider/auth/runtime data for local regression coverage. The runner executes these gates automatically and reports them as `mocked`.
7. Use `--mode real` only when real credentials, devices, or external services are intentionally available; complete and acknowledge those gates with `--ack-manual`.
8. Reset driven state, stop only the process launched for this run, inspect unexpected git changes, and report evidence.

Never claim “all functionality passed.” Report automated, manual, skipped, and not-applicable coverage separately.

## Choose the validation shape first

Use the smallest path that proves the requested behavior. Do not run more than
one app-launch command for a single validation run.

| Need                                             | Run                                                                                                               | What it proves                                                                                                                      |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Quick regression smoke after a focused change    | Run the smoke runner below with `--scope changed --mode mock`.                                                    | Isolated app boots, changed-surface checks and relevant mock gates pass, and no renderer/runtime errors occur. This is the default. |
| Broad regression or release confidence           | Run the smoke runner below with `--scope full --mode mock`.                                                       | Full functional inventory, including app-shell and cross-provider surfaces.                                                         |
| One real provider / credential / device workflow | Run the managed launcher below with `--mode real`, drive the real controls, then run the acknowledgement command. | The external integration actually completes end to end.                                                                             |
| Continue an already-running managed session      | Run `node <CDP helper> info`; it resolves the one active session and does not launch anything.                    | The requested next interaction in that exact app.                                                                                   |

Use the quick smoke by itself when the user asks to “smoke test,” “check the
app,” or “make sure this did not regress.” Use the real workflow when the user
asks whether a provider, ACP/tool call, login, device, PTY, or other external
integration works live. Run the full smoke only for release-scale, broad
cross-cutting, IPC/app-shell, or cross-provider changes.

## Boot an isolated app

Choose exactly one launch path per test run. Never use raw `pnpm run dev` or
`pnpm run dev:test` for CDP work: those commands do not allocate a managed
session and make wrong ports, shared state, and duplicate launches possible.
The smoke runner owns and tears down its app. The managed launcher keeps one app
alive for repeated manual actions, and its owner process performs every stop.

The one-command runner below allocates its own free ports, so each invocation spawns a fully isolated dev app. Runs from multiple worktrees can execute side by side without colliding on the Vite or CDP port.

```sh
node .agents/skills/interactive-testing/scripts/run-poracode-smoke.mjs --scope changed --mode mock
```

This allocates distinct free dev-server and CDP ports (override with
`--vitePort`/`--port`; explicit values are verified free), creates and commits a
disposable fixture project, seeds an isolated database, starts Electron with an
isolated profile and compiled runtime, dismisses and verifies the first-launch
welcome screen, runs the integration suite, writes screenshots/report artifacts
under `~/.poracode-smoke`, and tears down the process automatically. Managed
launches never reclaim an occupied port or rebuild another session's runtime.
No provider credentials, PTY input, git mutations, MCP server, mobile device, or
native update flow is required for the default mock run.

**`HOME` and provider detection — no drift between test and app.** Poracode's own state is always isolated via `PORACODE_BASE_DIR`, independent of `HOME`. Provider _detection_, however, resolves each CLI through the login-shell `command -v` (e.g. `kimi` → `~/.kimi-code/bin/kimi`) and reads credentials under the home dir — so it only matches the real app when `HOME` is the real home. Therefore:

- **Mock mode** sandboxes `HOME`/`APPDATA` and uses a mock keychain (deterministic isolation; providers are mocked). Real providers legitimately show **"Not found"** here — that is expected, not a bug, and mock gates never depend on real credentials.
- **Real mode** (`--mode real`) keeps the **real `HOME`**, so authenticated providers (Kimi, Qwen, …) can detect as in the shipped app. Always verify a provider-dependent surface in real mode; never diagnose a real detection issue from a mock-mode "Not found".

Real `HOME` is necessary but not always sufficient: detection probes `command -v <binary>` in a login+interactive shell with **`cwd: homedir()`**, so a CLI whose bin dir is on `PATH` only via a _project-scoped_ mechanism (direnv `.envrc`, `asdf` local, `mise`, a per-repo `.env`) is invisible to the detector even though it works inside the project — direnv unloads at the home cwd. Symptom: the app log prints `direnv: unloading` and the provider shows "Not found". Fix in the environment, not the app: put the binary on a globally-resolvable `PATH` (e.g. symlink into `~/.local/bin`, as qwen/grok are). This is why `~/.kimi-code/bin/kimi` (direnv-only) can miss while `~/.local/bin`-installed providers detect fine.

For a persistent interactive app, use the managed launcher:

```sh
node .agents/skills/interactive-testing/scripts/run-poracode-smoke.mjs --launch-only --mode mock
# Use the real HOME and provider credentials only when the task needs them:
node .agents/skills/interactive-testing/scripts/run-poracode-smoke.mjs --launch-only --mode real
```

When an agent must launch an intentionally independent session and then keep
working in the same turn, use the detached CDP launch command instead of
inventing a `Start-Process`, shell-redirection, or helper-script wrapper:

```sh
node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs launch --new --mode mock --root "$HOME/.poracode-smoke/<unique-agent-root>"
```

It returns only after READY and prints the exact `sessionFile`, ports, URL,
owner PIDs, and launch time. `--new` plus a fresh unique root is mandatory so
parallel agents cannot reuse or stop each other's apps. Its default 180-second
deadline accommodates several concurrent cold Vite transforms; once READY,
individual CDP actions should still finish in milliseconds, not inherit that
cold-start budget.

The command allocates ports, creates the fixture, isolates the compiled Electron
bundle and runtime resources, skips the welcome gate, and waits until the main
renderer has a mounted root plus preload and DEV bridges. It prints `READY` only
after those checks pass. Keep that exact terminal alive. When testing is
complete, request verified teardown from any shell with:

```sh
node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs stop
```

The stop command returns success only after the owner has closed both ports,
removed its isolated build, and marked `session.json` stopped. Ctrl-C in the
owning terminal is a fallback and uses the same teardown path, but some Windows
PTY hosts report the outer shell interruption as exit 1 even after clean
teardown. A cold renderer transform can take about a minute on
a busy Windows checkout; `state: "starting"` still owns the launch, so wait for
`READY` or a concrete failure instead of starting another app.

The launcher reuses an existing healthy debug session for this checkout instead
of launching a duplicate. Only use `--new` when concurrent same-checkout apps
are the behavior under test. If more than one session exists, every helper
refuses to guess; pass the exact session printed by its launcher:

```sh
node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs info --session "<session.json path printed by launcher>"
```

The authoritative `<run-id>/session.json` records the unique token, lifecycle,
repo/worktree, app URL, distinct ports, base directory, isolated build, and
owner PIDs. `ports.json` remains report metadata, not an attachment instruction.
Never invent a port or copy one from another run. The helpers accept a complete
explicit port + URL pair only for deliberate unmanaged-app diagnosis; they
reject either value alone and have no `9222`/`3100` fallback.

## Run the deterministic suite

Changed-surface run against the one active managed debug session (or pass
`--session <session.json>` when concurrent sessions intentionally exist):

```sh
node .agents/skills/interactive-testing/scripts/poracode-integration-smoke.mjs run --scope changed --mode mock --outDir "<outDir from session.json>"
```

Full functional inventory run:

```sh
node .agents/skills/interactive-testing/scripts/poracode-integration-smoke.mjs run --scope full --mode mock --outDir "<outDir from session.json>"
```

Exit meanings:

- `0`: automated scenarios and deterministic mock gates passed.
- `1`: an automated scenario or coverage audit failed.
- `2`: `--mode real` was selected and real manual gates remain.

The runner first dismisses the welcome screen through its real primary action and verifies the overlay stays absent. It then checks boot/render health, the preload and dev bridges, crash-screen markers, runtime exceptions, unhandled rejections, console errors, and screenshots. Depending on the plan it also walks every Settings section, opens thread search, runs the dedicated Browser harness, and executes mock IPC/project/provider/auth/terminal/runtime checks against the isolated fixture.

Do not acknowledge a real gate before exercising it. After completing real gates through real controls, record them:

```sh
node .agents/skills/interactive-testing/scripts/poracode-integration-smoke.mjs run --scope changed --mode real --outDir "<outDir from session.json>" --ack-manual provider-live,runtime-requests
```

Replace the acknowledgement list with every real gate actually exercised. For
example, an ACP AskUserQuestion run that visibly opened the form, submitted an
answer, and received the provider reply acknowledges
`changed-surface,ipc-roundtrip,provider-live,runtime-requests`.

## Drive real controls for manual gates

Use the managed CDP helper for state, evaluation, screenshots, clicks, and typing:

```sh
node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs info
node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs eval 'location.href'
node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs nav about
node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs click '[data-testid="settings-save"]'
node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs type 'input[name="query"]' 'test'
node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs shot - "<outDir from session.json>/manual-about.png"
node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs reset
```

In PowerShell, invoke action commands directly with the call operator; use
variables or quoted positional values so selectors containing spaces remain one
argument. Never use `Start-Process` for CDP actions:

```powershell
$cdp = ".agents/skills/interactive-testing/scripts/poracode-cdp.mjs"
$session = "C:\Users\me\.poracode-smoke\my-run\session.json"
$selector = '[data-composer-input-anchor] [contenteditable="true"]'
& node $cdp type $selector "latency probe" --session $session --commandTimeoutMs 2000
& node $cdp eval 'document.body.innerText.includes("latency probe")' --session $session --commandTimeoutMs 2000
@'
(() => ({ title: document.title, windowKind: document.documentElement.dataset.windowKind }))()
'@ | & node $cdp eval - --session $session --commandTimeoutMs 2000
```

Use `eval -` for multi-line or quote-heavy JavaScript so PowerShell passes it on
stdin without rewriting it. Do not create a temporary wrapper script for an
action sequence.

The helper binds every action to the session token and `main` window by default.
Pass `--windowKind quickComposer` or `--windowKind browserExtract` only when
that surface is the one under test. It rejects missing, hidden, disabled,
read-only, off-screen, and ambiguous targets instead of clicking by stale
coordinates. Re-query selectors after navigation, portal opening, or hot reload;
HeroUI menus and dialogs render in portals. A successful click/type confirms
safe input dispatch, not application behavior; immediately evaluate or
screenshot the expected state change before marking the gate passed.

For a changed provider, start a fresh thread in the isolated project, observe the user row and first provider output, then stop it. For a permission flow, request a harmless read-only command and choose Deny unless the user authorized execution. For terminal changes, verify a real PTY launch, input, resize, interrupt, and stop. For git/file changes, mutate only the fixture repository.

## Browser-specific testing

The integration runner invokes this automatically when Browser-related paths changed. It can also be run directly:

```sh
node .agents/skills/interactive-testing/scripts/poracode-browser-smoke.mjs --outDir "<outDir from session.json>/browser"
```

It verifies embedded page creation, DOM access, navigation history, toolbar state, Browser settings, screenshots, and zero renderer console errors.

## Coverage integrity

`scripts/smoke-scenarios.mjs` is the functional source of truth. It maps production paths to automated scenarios and manual gates. Update it in the same change whenever adding a new production surface or subsystem.

Run `audit` after modifying the inventory. The audit must fail if any tracked production file is unmapped. Broad catch-all areas prevent accidental omission, while the printed plan exposes which detailed and manual gates apply.

If a changed behavior cannot be automated against a safe fixture, add a deterministic mock gate with a concrete assertion. Keep a corresponding real gate only when an external system is genuinely required. Do not silently omit it or weaken an assertion to make the run green.

## Safety and teardown

- Default to `PORACODE_BASE_DIR` under `$HOME/.poracode-smoke`; never mutate real threads or settings.
- Treat `session.json` as the only managed attachment authority; never infer ports from window titles, old logs, or nearby listeners.
- Never blanket-kill Electron, Node, or `electron.exe`. Stop only the background process/session launched for this run.
- Never send destructive prompts or approve destructive permission requests.
- Write artifacts outside the repository so file watchers do not restart Electron.
- Call `node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs reset` and close transient panels before teardown.
- Stop with `node .agents/skills/interactive-testing/scripts/poracode-cdp.mjs stop`; do not infer failure from an outer PTY's Ctrl-C exit code.
- Leave the isolated smoke directory for inspection unless the user requested cleanup.
- Never commit smoke artifacts or source changes created only to reach a UI state.

## Report

Give one verdict per functional area. Include:

- automated scenarios and PASS/FAIL;
- mock gates and PASS/FAIL, plus real gates and PASS/FAIL/SKIPPED with reasons;
- console/runtime error count and the first three errors;
- screenshot and `smoke-report.json` paths;
- any untested functionality and why;
- suspected source file/line for each regression.

Do not call a `--mode real` run successful while the script exits `2` or any required real gate is unresolved. A mock-mode PASS means deterministic local integration passed; it does not claim that external provider credentials or devices were tested.
