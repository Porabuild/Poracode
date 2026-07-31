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
4. For a manual live check, generate the plan first:

   ```sh
   node .agents/skills/interactive-testing/scripts/poracode-integration-smoke.mjs plan --scope changed
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

| Need                                             | Run                                                                                                       | What it proves                                                                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Quick regression smoke after a focused change    | `pnpm run smoke:integration -- --scope changed --mode mock`                                               | Isolated app boots, changed-surface checks and relevant mock gates pass, and no renderer/runtime errors occur. This is the default. |
| Broad regression or release confidence           | `pnpm run smoke:integration -- --scope full --mode mock`                                                  | Full functional inventory, including app-shell and cross-provider surfaces.                                                         |
| One real provider / credential / device workflow | Manually boot one isolated app, drive the real controls, then run the real acknowledgement command below. | The external integration actually completes end to end.                                                                             |
| Continue an already-running manual session       | Reuse its `PORACODE_CDP_PORT` and `PORACODE_APP_URL`; do not launch anything.                             | The requested next interaction in that exact app.                                                                                   |

Use the quick smoke by itself when the user asks to “smoke test,” “check the
app,” or “make sure this did not regress.” Use the real workflow when the user
asks whether a provider, ACP/tool call, login, device, PTY, or other external
integration works live. Run the full smoke only for release-scale, broad
cross-cutting, IPC/app-shell, or cross-provider changes.

## Boot an isolated app

Choose exactly one launch path per test run. Do not start `pnpm run dev` alongside
`pnpm run smoke:integration`: the runner already owns one isolated Electron app
and tears it down. For a live provider flow, use the manual command below instead
of the runner, then stop that exact shell session when testing is complete.

The one-command runner below allocates its own free ports, so each invocation spawns a fully isolated dev app. Runs from multiple worktrees can execute side by side without colliding on the Vite or CDP port.

```sh
pnpm run smoke:integration -- --scope changed --mode mock
```

This allocates a free dev-server port and a free CDP port (override with `--vitePort`/`--port`; explicit values are verified free), creates and commits a disposable fixture project, seeds an isolated database, starts Electron with an isolated profile, dismisses and verifies the first-launch welcome screen, runs the integration suite, writes screenshots/report artifacts under `~/.poracode-smoke`, and tears down the process automatically. No provider credentials, PTY input, git mutations, MCP server, mobile device, or native update flow is required for the default mock run.

**`HOME` and provider detection — no drift between test and app.** Poracode's own state is always isolated via `PORACODE_BASE_DIR`, independent of `HOME`. Provider _detection_, however, resolves each CLI through the login-shell `command -v` (e.g. `kimi` → `~/.kimi-code/bin/kimi`) and reads credentials under the home dir — so it only matches the real app when `HOME` is the real home. Therefore:

- **Mock mode** sandboxes `HOME`/`APPDATA` and uses a mock keychain (deterministic isolation; providers are mocked). Real providers legitimately show **"Not found"** here — that is expected, not a bug, and mock gates never depend on real credentials.
- **Real mode** (`--mode real`) and the manual `dev:test` launch both keep the **real `HOME`**, so authenticated providers (Kimi, Qwen, …) can detect as in the shipped app. Always verify a provider-dependent surface in real mode; never diagnose a real detection issue from a mock-mode "Not found".

Real `HOME` is necessary but not always sufficient: detection probes `command -v <binary>` in a login+interactive shell with **`cwd: homedir()`**, so a CLI whose bin dir is on `PATH` only via a _project-scoped_ mechanism (direnv `.envrc`, `asdf` local, `mise`, a per-repo `.env`) is invisible to the detector even though it works inside the project — direnv unloads at the home cwd. Symptom: the app log prints `direnv: unloading` and the provider shows "Not found". Fix in the environment, not the app: put the binary on a globally-resolvable `PATH` (e.g. symlink into `~/.local/bin`, as qwen/grok are). This is why `~/.kimi-code/bin/kimi` (direnv-only) can miss while `~/.local/bin`-installed providers detect fine.

The runner prints the chosen ports and writes them to `<smoke root>/ports.json` (`{ appUrl, cdpPort, devServerPort }`). Every follow-up command in this skill must target that run's ports — export them before driving manual gates:

```sh
export PORACODE_CDP_PORT=<cdpPort from ports.json>
export PORACODE_APP_URL=<appUrl from ports.json>
```

All helper scripts default to `$PORACODE_CDP_PORT` / `$PORACODE_APP_URL`, falling back to `9222` / `http://127.0.0.1:3100/` only for a manually booted default app.

The committed dev hooks must honor `PORACODE_CDP_PORT` and `PORACODE_BASE_DIR` (`src/main/main.ts`) and `PORACODE_DEV_SERVER_PORT` (`vite.config.ts`, `scripts/dev-server-port.mjs`). Never rename or delete `~/.poracode-dev` as a workaround. To boot an isolated app manually instead of through the runner, reserve one port pair, set a new smoke directory, and launch only this command:

```sh
PORACODE_DEV_SERVER_PORT=<vitePort> \
PORACODE_CDP_PORT=<cdpPort> \
PORACODE_BASE_DIR="$HOME/.poracode-smoke/<run-id>" \
pnpm run dev:test
```

`dev:test` is the manual-test entrypoint: it bypasses the first-launch welcome
overlay before the renderer's first paint and releases the welcome gate for
background work immediately. Use ordinary `pnpm run dev` when the welcome experience
itself is under test. The one-command integration runner also keeps using the
ordinary launch path because its baseline explicitly exercises and verifies the
real welcome dismissal flow.

Set `PORACODE_APP_URL="http://127.0.0.1:<vitePort>/"` and
`PORACODE_CDP_PORT=<cdpPort>` before using the CDP helpers. Do not launch a
second manual app while this session is running.

For a real live check, keep this one terminal session running. In a second
terminal, export the same two variables, use CDP to inspect state/screenshots,
and use `agent-browser` only to click or type. When done, reset the app and
send `Ctrl-C` to this exact manual session.

## Run the deterministic suite

Changed-surface run (with `PORACODE_CDP_PORT`/`PORACODE_APP_URL` exported from the run's `ports.json`):

```sh
node .agents/skills/interactive-testing/scripts/poracode-integration-smoke.mjs run \
  --scope changed --mode mock --outDir "$SMOKE_ROOT/artifacts"
```

Full functional inventory run:

```sh
node .agents/skills/interactive-testing/scripts/poracode-integration-smoke.mjs run \
  --scope full --mode mock --outDir "$SMOKE_ROOT/artifacts"
```

Exit meanings:

- `0`: automated scenarios and deterministic mock gates passed.
- `1`: an automated scenario or coverage audit failed.
- `2`: `--mode real` was selected and real manual gates remain.

The runner first dismisses the welcome screen through its real primary action and verifies the overlay stays absent. It then checks boot/render health, the preload and dev bridges, crash-screen markers, runtime exceptions, unhandled rejections, console errors, and screenshots. Depending on the plan it also walks every Settings section, opens thread search, runs the dedicated Browser harness, and executes mock IPC/project/provider/auth/terminal/runtime checks against the isolated fixture.

Do not acknowledge a real gate before exercising it. After completing real gates through real controls, record them:

```sh
node .agents/skills/interactive-testing/scripts/poracode-integration-smoke.mjs run \
  --scope changed --mode real --outDir "$SMOKE_ROOT/artifacts" \
  --ack-manual provider-live,runtime-requests
```

Replace the acknowledgement list with every real gate actually exercised. For
example, an ACP AskUserQuestion run that visibly opened the form, submitted an
answer, and received the provider reply acknowledges
`changed-surface,ipc-roundtrip,provider-live,runtime-requests`.

## Drive real controls for manual gates

Use raw CDP helpers for state, evaluation, and screenshots:

```sh
H=.agents/skills/interactive-testing/scripts/poracode-cdp.mjs
node "$H" eval 'location.href'
node "$H" nav about
node "$H" shot - "$SMOKE_ROOT/artifacts/manual-about.png"
node "$H" reset
```

Use `agent-browser` only when a real control must be clicked or typed into:

```sh
npx --no-install agent-browser --cdp "$PORACODE_CDP_PORT" --color-scheme dark snapshot -i
npx --no-install agent-browser --cdp "$PORACODE_CDP_PORT" click '@e12'
```

Re-snapshot after every navigation, portal opening, or hot reload; element references become stale. HeroUI menus and dialogs render in portals, so take a new snapshot while they are open.

For a changed provider, start a fresh thread in the isolated project, observe the user row and first provider output, then stop it. For a permission flow, request a harmless read-only command and choose Deny unless the user authorized execution. For terminal changes, verify a real PTY launch, input, resize, interrupt, and stop. For git/file changes, mutate only the fixture repository.

## Browser-specific testing

The integration runner invokes this automatically when Browser-related paths changed. It can also be run directly:

```sh
node .agents/skills/interactive-testing/scripts/poracode-browser-smoke.mjs \
  --outDir "$SMOKE_ROOT/artifacts/browser"
```

It verifies embedded page creation, DOM access, navigation history, toolbar state, Browser settings, screenshots, and zero renderer console errors.

## Coverage integrity

`scripts/smoke-scenarios.mjs` is the functional source of truth. It maps production paths to automated scenarios and manual gates. Update it in the same change whenever adding a new production surface or subsystem.

Run `audit` after modifying the inventory. The audit must fail if any tracked production file is unmapped. Broad catch-all areas prevent accidental omission, while the printed plan exposes which detailed and manual gates apply.

If a changed behavior cannot be automated against a safe fixture, add a deterministic mock gate with a concrete assertion. Keep a corresponding real gate only when an external system is genuinely required. Do not silently omit it or weaken an assertion to make the run green.

## Safety and teardown

- Default to `PORACODE_BASE_DIR` under `$HOME/.poracode-smoke`; never mutate real threads or settings.
- Never blanket-kill Electron, Node, or `electron.exe`. Stop only the background process/session launched for this run.
- Never send destructive prompts or approve destructive permission requests.
- Write artifacts outside the repository so file watchers do not restart Electron.
- Call `node "$H" reset` and close transient panels before teardown.
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
