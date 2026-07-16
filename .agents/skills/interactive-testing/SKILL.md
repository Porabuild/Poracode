---
name: interactive-testing
description: Run repeatable integration and smoke testing against the real Poracode Electron app through Chrome DevTools Protocol. Use when asked to smoke test, integration test, interactively test, verify a refactor in the UI, reproduce a renderer crash, click through the app, or check that changes did not regress functionality. Build a diff-derived coverage plan, run the scripted baseline and targeted scenarios, complete every required manual gate, capture screenshots and runtime errors, and report explicit per-surface evidence.
---

# Interactive Testing — Poracode

Test the real Electron renderer, preload bridge, main process, and supervisor integration. Treat unit tests as complementary; do not substitute them for this workflow when the skill triggers.

## Required workflow

1. Inspect `git status --short` and the relevant diff.
2. Audit the functional inventory:

   ```sh
   node .agents/skills/interactive-testing/scripts/poracode-integration-smoke.mjs audit
   ```

3. Generate the diff-derived plan:

   ```sh
   node .agents/skills/interactive-testing/scripts/poracode-integration-smoke.mjs plan --scope changed
   ```

4. Boot an isolated dev app unless the user explicitly requests their existing profile.
5. Run the scripted smoke plan in its default `mock` mode. Use `--scope full` for release, broad refactor, IPC, app-shell, or cross-provider changes.
6. Use fixture projects, deterministic store state, and mocked provider/auth/runtime data for local regression coverage. The runner executes these gates automatically and reports them as `mocked`.
7. Use `--mode real` only when real credentials, devices, or external services are intentionally available; complete and acknowledge those gates with `--ack-manual`.
8. Reset driven state, stop only the process launched for this run, inspect unexpected git changes, and report evidence.

Never claim “all functionality passed.” Report automated, manual, skipped, and not-applicable coverage separately.

## Boot an isolated app

The one-command runner below allocates its own free ports, so each invocation spawns a fully isolated dev app. Runs from multiple worktrees can execute side by side without colliding on the Vite or CDP port.

```sh
pnpm run smoke:integration -- --scope changed --mode mock
```

This allocates a free dev-server port and a free CDP port (override with `--vitePort`/`--port`; explicit values are verified free), creates and commits a disposable fixture project, seeds an isolated database, starts Electron with an isolated profile, dismisses and verifies the first-launch welcome screen, runs the integration suite, writes screenshots/report artifacts under `~/.poracode-smoke`, and tears down the process automatically. No provider credentials, PTY input, git mutations, MCP server, mobile device, or native update flow is required for the default mock run.

The runner prints the chosen ports and writes them to `<smoke root>/ports.json` (`{ appUrl, cdpPort, devServerPort }`). Every follow-up command in this skill must target that run's ports — export them before driving manual gates:

```sh
export PORACODE_CDP_PORT=<cdpPort from ports.json>
export PORACODE_APP_URL=<appUrl from ports.json>
```

All helper scripts default to `$PORACODE_CDP_PORT` / `$PORACODE_APP_URL`, falling back to `9222` / `http://127.0.0.1:3100/` only for a manually booted default app.

The committed dev hooks must honor `PORACODE_CDP_PORT` and `PORACODE_BASE_DIR` (`src/main/main.ts`) and `PORACODE_DEV_SERVER_PORT` (`vite.config.ts`, `scripts/dev-server-port.mjs`). Never rename or delete `~/.poracode-dev` as a workaround. To boot an isolated app manually instead of through the runner, set `PORACODE_DEV_SERVER_PORT`, `PORACODE_CDP_PORT`, and `PORACODE_BASE_DIR` before `pnpm run dev`.

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
