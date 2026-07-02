---
name: interactive-testing
description: Smoke-test the running Lightcode Electron app end-to-end via Chrome DevTools Protocol. Use when the user asks to "smoke test", "test the app", "verify the refactor in the UI", "open the app and click through", or otherwise wants Claude to drive the real running app instead of relying on unit tests. Boots dev server + Electron with CDP enabled, uses raw CDP or agent-browser as appropriate, walks the surfaces most relevant to the current diff (provider selector, ThreadDraftView, ChatPane, ThreadRuntimeRequestPanel, Browser panel), and reports findings with screenshots.
allowed-tools: Bash(pnpm:*), Bash(node:*), Bash(npx:*), Bash(agent-browser:*), Bash(git:*), Bash(lsof:*), Bash(curl:*), Bash(env:*), Bash(taskkill:*), Bash(tasklist:*), Read, Edit, Grep, Glob
---

# Interactive Testing — Lightcode

Drive the real running Electron app via Chrome DevTools Protocol (CDP) to verify changes after a refactor or feature edit. Complements unit/integration tests — catches the things vitest can't (real renderer rendering, real IPC, real Electron lifecycle, real provider menus, real chat layout).

## When to use

- User says **"smoke test"**, **"test the app"**, **"open the app and try X"**, **"verify the refactor"**.
- After a non-trivial UI refactor where unit tests pass but visual / interaction correctness is still in doubt.
- After IPC / contract changes — to confirm the renderer still talks to the supervisor.

## When NOT to use

- Pure logic bugs that have a failing unit test reproduction — fix the test instead.
- Backend-only changes (database, supervisor process internals) with no renderer-visible surface.
- When the user asks a quick question — don't spin up the whole app to answer "what does this function do".

## Quick path (macOS/POSIX) — read this first

The detailed sections below are written for PowerShell/Windows. On macOS/Linux the flow
is identical but the commands differ. This is the copy-pasteable POSIX path for the most
common job: **boot the app and screenshot/verify a renderer change.** Each numbered item
maps to friction that has actually cost time — follow it and skip the rediscovery.

### The two tools

1. **`lightcode-cdp.mjs`** (preferred for boot-wait, state driving, screenshots) — runs
   entirely through `node` (always on PATH; no agent-browser/shell quirks). Pairs with the
   DEV bridge (Patch 3). Set `H=.agents/skills/interactive-testing/scripts/lightcode-cdp.mjs` once per Bash call:

   ```sh
   node $H wait [--timeout 120]      # block until the app CDP target is up (run_in_background)
   node $H nav <section>             # open Settings deep-linked: about | usage | appearance | …
   node $H back                      # close Settings
   node $H update '<json>'           # patch the app-update store (phase/version/progress)
   node $H eval '<js>'               # Runtime.evaluate, prints JSON (drive any store via window.__lightcodeDev)
   node $H shot <selector|-> <out>   # element (CSS selector) or full-viewport (-) PNG, written to <out>
   node $H reset                     # restore driven state before teardown
   ```

2. **`agent-browser`** (for the accessibility tree + clicking real controls) — via
   `npx --no-install agent-browser --cdp 9222 …`; use `snapshot -i` to list refs and
   `click "@eNN"` to click. Only reach for it when you must drive a real control the bridge
   can't set directly.

Most visual checks are: `node $H wait` → `node $H nav <section>` (or `update …`) → tag +
`node $H shot` → read the PNG inline → `node $H reset`. No clicking, no temp edits.

### 0. Shell & tooling caveats (these cost the most)

- **The Bash tool's shell may not match the environment header.** It has executed as
  `zsh` even when the header said `fish` (tell-tale: `(eval):N: command not found` /
  `parse error near ')'`). Write **POSIX sh only**: `for i in $(seq 1 90)`,
  `case "$x" in *foo*) … ;; esac`. Avoid fish builtins (`string match`, `set -x VAR`,
  `(seq …)`) and zsh-only assumptions.
- **A variable holding a multi-word command does NOT word-split in zsh** — `AB="npx … "; $AB click` fails with "command not found". Use a function instead:
  ```sh
  ab(){ npx --no-install agent-browser --cdp 9222 "$@"; }   # redefine in each Bash call
  ```
  (Shell functions/vars do not persist across separate Bash tool calls — redefine `ab()` at the top of each call that needs it.)
- **`agent-browser` is usually NOT on PATH.** Don't hunt for the binary —
  `npx --no-install agent-browser …` resolves it from the npx cache. The bare
  `agent-browser` and even `agent-browser disconnect` may not exist.
- **Set env inline with `env`:** `env LIGHTCODE_CDP_PORT=9222 pnpm run dev`.

### 1. Boot (background) + wait on the CDP target, not the log

`pnpm run dev` is long-running → launch with `run_in_background: true`:

```sh
env LIGHTCODE_CDP_PORT=9222 pnpm run dev          # Bash run_in_background: true
```

Then wait with a **single** background `until` loop that polls the CDP target list — the
page target appearing is the true "ready" signal, more reliable than grepping Vite's log.
Per the Monitor tool's own contract, a one-shot "tell me when ready" wait is a background
Bash loop, **not** a Monitor:

```sh
for i in $(seq 1 90); do
  case "$(curl -s http://127.0.0.1:9222/json/list)" in
    *127.0.0.1:3100*) echo "READY"; exit 0;;
  esac
  sleep 2
done; echo "TIMEOUT"; exit 1                       # Bash run_in_background: true
```

Cold first boot ~20–40s (incl. native rebuild); warm reboots ~2–5s.

### 2. Attach & confirm

```sh
ab get url                               # expect http://127.0.0.1:3100/
ab eval "JSON.stringify({url:location.href})"
ab --color-scheme dark snapshot -i       # dark is the app default
```

### 3. Fast visual-only path (skip seeding & WelcomeOverlay)

If the change is a **renderer visual** tweak and the user's dev app is **not running**
(ports free — check `lsof -nP -iTCP:3100 -sTCP:LISTEN` and `:9222`), you may boot against
the real `~/.lightcode-dev` profile by **omitting `LIGHTCODE_BASE_DIR`**. The app opens
straight to the user's existing projects — no seeding, no WelcomeOverlay. Rules:

- **Read-only:** navigate and screenshot only; never send a chat into a real thread.
- **Restore persisted UI state you change.** Sidebar collapse, panel sizes, etc. persist
  to that profile — if you collapse the sidebar for a shot, re-expand it before teardown.
- **Reset any injected store state** (see Patch 3) back to its resting value.

For anything that mutates data (threads, settings), use the isolated + seeded path instead.

### 4. Element / component screenshots

`screenshot` takes an optional **CSS selector** to capture one element — far cleaner than
full-window shots. If the component has no stable selector, tag it via eval first, then
read the PNG back to view it inline:

```sh
ab eval "(()=>{const h=[...document.querySelectorAll('h1')].find(e=>e.textContent.trim()==='About'); h.closest('div').parentElement.id='shot'; return 'ok';})()"
ab screenshot "#shot" "$HOME/.lightcode-smoke/shots/about.png"   # write OUTSIDE the repo
```

Write shots **outside the repo** (`$HOME/.lightcode-smoke/…`) so the file write doesn't
trigger an `electronmon` restart.

### 5. Finding controls to click

`ab snapshot -i` lists refs (`ref=eNN`); click with `ab click "@eNN"`. Grep the snapshot
for the accessible name. **Caveat:** icon-only buttons (collapsed sidebar rail, toolbar
icons) get their name from a **tooltip, not `aria-label`/text** — text finders miss them.
Fall back to a ref from the open snapshot, or DOM traversal (`rail.lastElementChild`, nth
button, etc.).

### 6. Teardown

Stop the dev server by its background **task id** with `TaskStop` (not by killing
electron). Confirm ports freed (`lsof -nP -iTCP:9222 -sTCP:LISTEN` → empty). Revert any
temporary source hooks and `git status` to confirm the tree is clean.

## Prerequisites — one-time source patches

Two small env-gated escape hatches in `src/main/main.ts` make smoke testing hermetic. Both are opt-in (default behavior unchanged), safe to commit. Check whether they're already present:

```bash
grep -n "LIGHTCODE_CDP_PORT\|LIGHTCODE_BASE_DIR" src/main/main.ts
```

### Patch 1 — CDP port (required to attach `agent-browser`)

Add near the top of `main.ts`, after `import { app, BrowserWindow } from "electron";`:

```ts
if (process.env.LIGHTCODE_CDP_PORT) {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.LIGHTCODE_CDP_PORT);
}
```

### Patch 2 — Base data dir + Electron profile override (required for empty-settings runs)

Currently `main.ts` hardcodes the dev base dir as `~/.lightcode-dev`, while Electron `userData` stores renderer `localStorage` separately. Add a top-level base-dir override and use it before `app.whenReady()` so sqlite/settings and renderer storage are both isolated:

```ts
const baseDirOverride = process.env.LIGHTCODE_BASE_DIR;

if (baseDirOverride) {
  app.setPath("userData", join(baseDirOverride, "userData"));
} else if (isDev) {
  app.setPath("userData", join(app.getPath("userData"), "Dev"));
}
```

Then replace the `prepareLightcodeDataRoot(...)` call inside `app.whenReady()` with:

```ts
lightcodePaths = prepareLightcodeDataRoot(
  baseDirOverride ?? (isDev ? join(homedir(), ".lightcode-dev") : resolveLightcodeBaseDir(channel)),
);
```

This propagates automatically: `supervisorClient.start(lightcodePaths.baseDir)` (further down in `main.ts`) hands the same path to the supervisor, so sqlite, settings, attachments, worktrees, and agent plugins all relocate together. The `app.setPath("userData", ...)` line prevents stale renderer `localStorage` (collapsed sidebar, terminal position, git cache, etc.) from leaking into fresh smoke runs.

### Patch 3 — Dev state bridge ✅ already wired

State-dependent UI — update phases (`checking`/`downloading`/`downloaded`), button
variants, error/empty/loading states — is painful to reach through real flows, and some
states (a live download with specific byte counts) you essentially **cannot** trigger on
demand. So the renderer exposes its Zustand stores + a few helpers on
`window.__lightcodeDev` in dev — no clicking, no waiting on real async, and **no
per-iteration source edits / extra boots.**

This already ships: `src/renderer/devBridge.ts` (`installDevBridge()`), called from
`src/renderer/main.tsx` under an `import.meta.env.DEV` guard (dead-code eliminated from
prod). The shape:

```ts
window.__lightcodeDev = {
  stores: { update, app, panel, sidebarUi, sharedSettings },  // raw Zustand: .getState()/.setState()
  openSettings(section?),   // deep-link Settings, e.g. "about" | "usage" | "appearance"
  closeSettings(),
  setUpdate(patch),         // patch the app-update store (phase/version/progress)
  reset(),                  // restore driven state to baseline — call before teardown
};
```

Drive it through the **`lightcode-cdp.mjs` helper** (preferred — see Quick path) or any
`eval`:

```sh
H=.agents/skills/interactive-testing/scripts/lightcode-cdp.mjs
node $H nav about
node $H update '{"phase":"downloading","version":"1.2.3","downloadPercent":42,"downloadTransferred":30618419,"downloadTotal":113554636}'
node $H shot "#shot" "$HOME/.lightcode-smoke/shots/downloading.png"   # tag #shot first (Quick path §4)
node $H reset
```

To drive a state not covered by a helper, reach the store directly:
`node $H eval "window.__lightcodeDev.stores.panel.setState({threadSearchOpen:true})"`.
If you genuinely need a store that isn't exposed, add it to the `stores` map in
`devBridge.ts` (one line) rather than temp-hacking the store module.

### Verify `agent-browser`

```bash
npx --no-install agent-browser --version    # resolves from npx cache; bare `agent-browser` is usually NOT on PATH
```

If that fails, `npm i -g @anthropic-ai/agent-browser` then retry — but prefer
`npx --no-install agent-browser …` in every command (don't waste calls hunting for a
global binary).

Current CLI notes:

- Use `agent-browser eval`, not `agent-browser evaluate`.
- `screenshot` takes an optional CSS **selector** and **path**: `… screenshot "#sel" ./out.png` captures just that element (see Quick path §4). `--full` for the whole page.
- There is no `disconnect` subcommand on all versions — just stop the dev server (TaskStop) at teardown; the CDP attach is stateless.
- macOS/zsh: `@eNN` refs are safe unquoted, but quoting (`"@e24"`) is harmless and matches the PowerShell guidance. In PowerShell, quoting is **required** (`'@e24'`).
- `agent-browser connect 9222` can drift to `about:blank` with Electron. Prefer `npx --no-install agent-browser --cdp 9222 …`, and use the Browser-panel raw CDP script below for Browser panel work.

### Fallback if patches aren't accepted

- **No CDP patch**: skill cannot attach. Hard requirement.
- **No base-dir patch**: instead of an override, the skill can rename `~/.lightcode-dev` → `~/.lightcode-dev.smoke-bak-<ts>` before launch and restore on teardown. Reversible but destructive-feeling — only use with user confirmation.

## Boot sequence

1. **Free port 9222** (CDP) and any leftover dev port. Optional — only if a previous run left things attached.

   ```powershell
   # Windows: kill any electron/vite/node listening
   tasklist /FI "IMAGENAME eq electron.exe" /NH
   # Only run taskkill if user confirms; do not blanket-kill
   ```

2. **Provision an isolated workspace** for the run. Pick fresh paths under a smoke root so multiple runs never overlap and the user's real `~/.lightcode-dev` is untouched.

   ```powershell
   $ts = Get-Date -Format "yyyyMMdd-HHmmss"
   $smokeRoot = "$HOME\.lightcode-smoke\$ts"
   $env:LIGHTCODE_BASE_DIR = "$smokeRoot\data"
   $env:LIGHTCODE_SMOKE_OUT_DIR = "$smokeRoot\artifacts"
   $projectDir = "$smokeRoot\project"
   New-Item -ItemType Directory -Force $env:LIGHTCODE_BASE_DIR | Out-Null
   New-Item -ItemType Directory -Force $env:LIGHTCODE_SMOKE_OUT_DIR | Out-Null
   New-Item -ItemType Directory -Force $projectDir | Out-Null
   ```

   Then seed the test project into sqlite — see **Seeding a test project** below — _before_ launching the app, so the app boots with the project already selected.

3. **Launch dev in background** with both env vars set. Use `run_in_background: true` on the Bash call. Do NOT poll — let the harness notify on log lines via Monitor.

   ```powershell
   $env:LIGHTCODE_CDP_PORT="9222"
   $env:LIGHTCODE_BASE_DIR="$smokeRoot\data"   # already set above, re-state for clarity
   $env:LIGHTCODE_SMOKE_OUT_DIR="$smokeRoot\artifacts"
   pnpm run dev
   ```

   Dev launch path:
   - `pnpm run dev` → `concurrently` runs `dev:renderer` (Vite on `:3100`), `dev:electron` (tsdown watch), `dev:app` (electronmon).
   - `wait-on tcp:3100 dist/main/main.cjs` gates the app launch.
   - Electron starts after Vite is up and `dist/main/main.cjs` exists.

4. **Wait for "ready" before attaching.** The reliable signal is the CDP page target
   appearing in `/json/list`, not a Vite log line. Use a **single background Bash `until`
   loop** that polls it (see Quick path §1) — this is the one-shot "ready" pattern from the
   Monitor tool's own contract. Don't blanket-sleep, and don't use `Monitor` for this
   (Monitor is for ongoing event streams, not a one-time readiness check). Cold boot
   ~20–40s; warm reboot ~2–5s.

5. **Attach/check CDP target**:

   ```bash
   npx agent-browser --cdp 9222 get url
   npx agent-browser --cdp 9222 snapshot -i
   ```

   Expected URL is `http://127.0.0.1:3100/`. If `agent-browser` reports `about:blank` even though `/json/list` contains the Lightcode page, do not fight its target picker; use the raw CDP Browser smoke script for Browser-panel work.

6. **Set color scheme** if the app uses dark mode (Lightcode does by default):

   ```bash
   npx agent-browser --cdp 9222 --color-scheme dark snapshot -i
   ```

7. **For Browser-panel changes, run the raw CDP harness before manual clicks**:

   ```powershell
   node .agents/skills/interactive-testing/scripts/lightcode-browser-smoke.mjs --port 9222 --outDir $env:LIGHTCODE_SMOKE_OUT_DIR
   ```

   This harness pins to the real Lightcode page target from `/json/list`, creates or reuses an in-app browser tab, navigates deterministic `data:` pages, verifies the embedded browser target DOM, checks toolbar/back/forward state, opens Settings > Browser, captures screenshots outside the repo, and reports console errors. Keeping artifacts outside the repo avoids `electronmon` restarts from screenshot file writes.

8. **Confirm the seeded project loaded** — the first snapshot should show the sidebar and ThreadDraftView for the seeded project. If the WelcomeOverlay appears, sqlite seeding or `LIGHTCODE_BASE_DIR` did not land in the app process.

## Seeding a test project

Lightcode's "Add Project" flow goes through a native OS folder picker (`window.lightcode.pickFolder()`), which `agent-browser` cannot drive. Smoke runs should avoid that flow by seeding `$env:LIGHTCODE_BASE_DIR\state.sqlite` before Electron starts.

### Step A — Create the project directory on disk

Run _before_ launching the dev server, so the dir is ready when the app starts:

```powershell
# $projectDir already set in boot step 2
git init $projectDir | Out-Null
Set-Content "$projectDir\README.md" "# Smoke test project`n`nCreated by interactive-testing skill at $(Get-Date -Format o)."
Set-Content "$projectDir\hello.txt" "hello from smoke test"
git -C $projectDir add -A
git -C $projectDir -c user.email=smoke@lightcode.local -c user.name="Smoke Test" commit -m "initial smoke fixture" | Out-Null
```

This gives the app a real git repo (so git features in the sidebar / status panels work), with two files for chat scenarios that need to reference content.

### Step B — Seed sqlite before launch

```powershell
node --no-warnings .agents/skills/interactive-testing/scripts/seed-lightcode-smoke-db.mjs `
  --baseDir $env:LIGHTCODE_BASE_DIR `
  --projectDir $projectDir `
  --projectId smoke-project `
  --projectName "Smoke Project" `
  --reset
```

For a WSL fixture, create the repo inside the distro and seed the WSL location instead:

```powershell
$distro = "Ubuntu"
$linuxPath = "/tmp/lightcode-smoke/$ts/project"
wsl.exe -d $distro -- sh -lc "rm -rf '$linuxPath' && mkdir -p '$linuxPath' && cd '$linuxPath' && git init >/dev/null && printf '# Smoke test project\n' > README.md && git add -A && git -c user.email=smoke@lightcode.local -c user.name='Smoke Test' commit -m 'initial smoke fixture' >/dev/null"
node --no-warnings .agents/skills/interactive-testing/scripts/seed-lightcode-smoke-db.mjs `
  --baseDir $env:LIGHTCODE_BASE_DIR `
  --wslDistro $distro `
  --wslLinuxPath $linuxPath `
  --projectId smoke-project `
  --projectName "Smoke WSL Project" `
  --reset
```

The script writes the project row and `app_state.view = {"kind":"draft","projectId":"smoke-project"}`. It intentionally does not write `app_state.schema_version`; app startup still owns migrations.

### Step C — Verify the project landed

```bash
npx agent-browser --cdp 9222 snapshot -i
```

Confirm the sidebar lists the seeded project and ThreadDraftView is open. Do not click "Add Project" during normal smoke tests; if the native picker appears, stop and fix the seed or launch environment.

## Targeting the right surfaces

Always derive the test plan from the actual diff. Run:

```bash
git status --short
git diff --stat HEAD
```

Map the changed paths to UI surfaces:

| Changed path                                                          | Surface to exercise                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------ |
| `src/renderer/components/providers/**/*Icon.tsx`                      | Provider selector dropdown — all icons render                |
| `src/renderer/components/common/ProviderModelMenu/**`                 | Provider+model picker in ThreadDraftView header              |
| `src/renderer/components/thread/ThreadDraftView*`                     | New-thread draft surface — composer, model picker, launch    |
| `src/renderer/components/thread/ThreadDraftChrome*`                   | Draft frame / chrome around the composer                     |
| `src/renderer/components/thread/ChatPane/**`                          | Live chat message list — open an existing thread or send msg |
| `src/renderer/components/thread/ChatPane/parts/items/QuestionAnswer*` | Q/A rendering inside chat (assistant question → user answer) |
| `src/renderer/components/thread/ChatPane/parts/items/ChatItemRow*`    | Every chat row — markdown render path                        |
| `src/renderer/components/thread/ThreadRuntimeRequestPanel/**`         | Permission / approval / elicitation prompts during a run     |
| `src/renderer/views/FileEditorOverlay/**`                             | File editor overlay (Monaco) — open a file                   |
| `src/renderer/views/MainView/**`                                      | Top-level layout (panes, sidebars)                           |
| `src/shared/ipc/**`                                                   | Any flow that calls supervisor — full smoke required         |
| `src/supervisor/agents/<provider>/**`                                 | Launch a real thread with that provider                      |

Always include the **baseline smoke** below, even if the diff is narrow — refactors leak.

## Baseline smoke (every run)

Execute in order. After each step, `snapshot -i` (or `screenshot`) and verify outcome before moving on.

1. **App boots, main window renders**
   - Attach. `npx agent-browser --cdp 9222 snapshot -i`.
   - Confirm: sidebar visible, no blank white screen, no React error boundary.
   - Screenshot: `$env:LIGHTCODE_SMOKE_OUT_DIR\smoke-01-boot.png`.

2. **DevTools console errors check**
   - `npx agent-browser --cdp 9222 eval "JSON.stringify((window as any).__devLogs ?? [])"` (only if such a log array exists) — otherwise use the runtime/CDP console-listener pattern below.
   - Capture any `Uncaught` / `Warning: ...` from React. Save to `$env:LIGHTCODE_SMOKE_OUT_DIR\smoke-console.txt`. Non-zero count → flag.

3. **Provider selector renders all icons**
   - Open ProviderModelMenu (find by accessible name "Provider", or by ref from snapshot).
   - Snapshot the open menu. Confirm: Claude, Codex, Copilot, Cursor, Gemini, OpenCode icons all visible (whichever are configured).
   - Screenshot: `$env:LIGHTCODE_SMOKE_OUT_DIR\smoke-02-providers.png`.

4. **ThreadDraftView — create a new thread**
   - Click "New Thread" (or whatever the entry point is — find via snapshot).
   - Confirm: ThreadDraftView renders with composer, model picker, project picker.
   - Type a benign prompt: `"echo hello from smoke test"`.
   - Screenshot: `$env:LIGHTCODE_SMOKE_OUT_DIR\smoke-03-draft.png`.

5. **ChatPane — send and observe**
   - Submit the draft. Wait for thread state to transition.
   - Confirm: ChatPane renders, user message row appears, assistant streaming row appears.
   - Watch for: markdown rendered (not raw `**bold**`), no duplicated rows, no layout jump.
   - Screenshot: `$env:LIGHTCODE_SMOKE_OUT_DIR\smoke-04-chat.png`.

6. **ThreadRuntimeRequestPanel — if a tool/permission prompt appears**
   - If the prompt asks for permission (file write, command exec), confirm the panel renders.
   - Click "Deny" (safest — we don't want the smoke test to actually run commands on the user's box).
   - Confirm: panel dismisses, thread continues or cleanly ends.

7. **Teardown**
   - Stop the thread (if still running) via UI.
   - Revert any temporary source hooks; reset any injected store state to its resting value.
   - Leave the dev server running unless the user asked you to stop it. If stopping: stop the background bash task by id with `TaskStop` (the CDP attach is stateless — no `disconnect` needed); do NOT kill all `electron.exe`/`Electron` processes blindly (the user may have other Electron apps open — VS Code, Slack, etc.). Confirm ports freed with `lsof -nP -iTCP:9222 -sTCP:LISTEN`.
   - **Clean up the smoke workspace**: by default, leave `$smokeRoot` on disk so the user can inspect what happened. If the user asked for a clean run-and-purge, delete `$smokeRoot` (the isolated data dir + project) — confirm before doing so. Never delete `~/.lightcode-dev` itself; the smoke run never wrote to it.

## Targeted scenarios

Add these on top of the baseline when the diff touches them.

### Provider icon refactor (e.g. `createProviderIcon`)

- After step 3, hover each provider in the menu. Confirm tooltip / accessible name still present.
- Confirm sidebar icon for any running thread still renders.
- Snapshot a thread row in the sidebar to confirm StatusIcon composition still works.

### ThreadRuntimeRequestPanel split

- Trigger each request type the user might encounter:
  - **Approval** (tool permission) — easiest: ask a Claude/Codex thread to run a shell command.
  - **Elicitation / structured form** (ACP providers) — Gemini thread with a config that elicits input.
  - **Question switcher** — multi-question flow (rare; if hard to trigger, skip and note).
- For each: confirm render, confirm submission round-trips, confirm panel dismisses.

### IPC refactor (`src/shared/ipc/**` split)

- Exercise at least one procedure per file you touched (db read, git status, settings read, thread launch).
- Watch for `IPC handler not found` errors in the renderer console — strong sign a procedure name got dropped during the split.

### Browser panel / browser MCP changes

Run the Browser panel harness:

```powershell
node .agents/skills/interactive-testing/scripts/lightcode-browser-smoke.mjs --port 9222 --outDir $env:LIGHTCODE_SMOKE_OUT_DIR
```

Expected checks:

- App page target is `http://127.0.0.1:3100/`.
- Browser panel opens and creates/reuses an in-app tab.
- Embedded browser target appears in `/json/list` and exposes the deterministic smoke page DOM.
- Toolbar URL input is present and enabled.
- Back/forward state round-trips after two navigations.
- Settings > Browser is reachable.
- Renderer console error count is zero.

If this fails only when screenshots are written inside the repo, move artifacts back under `$env:LIGHTCODE_SMOKE_OUT_DIR`; repo-local screenshot writes can trigger `electronmon` restarts.

### Chat markdown changes (`ChatItemRow`, `QuestionAnswer`, `MarkdownPreview`)

- Send a prompt that yields a code block, a list, and a table in the response — confirm all three render through Streamdown.
- Verify table column count if the diff touched table separator logic (see [feedback_markdown_table_separator]).

## Console error capture

Install a CDP-level console listener at attach time so errors surface even if the user never opens DevTools:

```bash
npx agent-browser --cdp 9222 eval "(() => {
  if ((window as any).__smokeErrors) return 'already-installed';
  (window as any).__smokeErrors = [];
  const orig = console.error.bind(console);
  console.error = (...args) => { (window as any).__smokeErrors.push(args.map(String).join(' ')); orig(...args); };
  window.addEventListener('error', e => (window as any).__smokeErrors.push('window.error: ' + e.message));
  window.addEventListener('unhandledrejection', e => (window as any).__smokeErrors.push('unhandledrejection: ' + String(e.reason)));
  return 'installed';
})()"
```

Drain at end:

```bash
npx agent-browser --cdp 9222 eval "JSON.stringify((window as any).__smokeErrors)"
```

## Reporting

End-of-test summary should be terse — 1 short paragraph + a bullet list:

- **PASS / FAIL** verdict per surface (provider menu, draft view, chat pane, runtime panel).
- Console errors collected (count + first 3).
- Screenshots written to `$env:LIGHTCODE_SMOKE_OUT_DIR\smoke-*.png` (give the user the paths).
- Anything that regressed vs. expectation — link to the file:line you suspect.

Do not narrate every snapshot in the final summary — that goes to chat as you work, not in the wrap-up.

## Critical safety rules

- **Never blanket-kill `electron.exe`** — the user likely has other Electron apps running. Only kill the specific background task you spawned.
- **Never run destructive prompts** through the smoke test. If you must trigger a permission panel, choose a request like "list files in cwd" not "delete X". Always click Deny on real permission prompts unless the user told you otherwise.
- **Default to the isolated workspace.** With `LIGHTCODE_BASE_DIR` set and the `userData` patch in place, the app starts with empty sqlite/settings and isolated renderer storage — no risk of touching real threads or leaking old `localStorage`. If a smoke run is asked to use the user's actual `~/.lightcode-dev` (e.g. to repro a real bug), always create a fresh thread and never send into an existing one without explicit confirmation.
- **Do not commit anything** during a smoke test — the dev session may have modified files (cache, settings). Leave git state untouched and report any unexpected modifications.
- **Dev server is long-running.** Always launch with `run_in_background: true`. Do not foreground sleep-loop waiting for it; wait with a separate background Bash `until` loop polling the CDP target (Quick path §1). Stop it at teardown with `TaskStop` by task id, never by blanket-killing electron.
- **Single instance lock**: in dev mode `main.ts` bypasses `requestSingleInstanceLock`, so multiple electron instances can coexist — but don't spawn two dev sessions at once anyway; port 9222 collides.

## Troubleshooting

- **`connect 9222` refuses**: confirm the `appendSwitch` patch landed in `main.ts`, confirm `LIGHTCODE_CDP_PORT=9222` was in env at launch, and confirm Electron actually started (look at `dev:app` output). Check `netstat -ano | findstr :9222`.
- **`agent-browser` shows `about:blank` but the visible app is loaded**: query `http://127.0.0.1:9222/json/list`. If the Lightcode page target is present, use the raw CDP Browser smoke script or direct CDP instead of retrying `agent-browser connect`.
- **Two tabs returned by `tab`**: pick the one whose URL contains `localhost:3100`. The other may be a DevTools window.
- **Elements not in snapshot**: HeroUI portals (modals, menus) render to a different root — re-snapshot with the menu open, or pass `-C` to include div-onclick elements.
- **App didn't pick up `LIGHTCODE_CDP_PORT`**: env var must be set in the same shell that runs `pnpm run dev`. On PowerShell, `$env:LIGHTCODE_CDP_PORT="9222"; pnpm run dev` — `LIGHTCODE_CDP_PORT=9222 pnpm run dev` is bash syntax and silently does nothing in PowerShell.
- **Vite hot-reload mid-test**: if a file watch fires during the smoke run (e.g. you edited something), the renderer remounts and refs go stale. Re-snapshot before continuing.
- **App didn't pick up `LIGHTCODE_BASE_DIR`**: confirm patch 2 landed in `main.ts` (`grep LIGHTCODE_BASE_DIR src/main/main.ts`) and that `app.setPath("userData", join(baseDirOverride, "userData"))` exists. Also confirm `$env:LIGHTCODE_BASE_DIR` was set in the _same_ PowerShell session that ran `pnpm run dev` — `concurrently` inherits env from that parent.
- **Smoke screenshots cause app restarts**: screenshots were probably written inside the repo. Use `$env:LIGHTCODE_SMOKE_OUT_DIR` under `$HOME\.lightcode-smoke\...`; `electronmon` may see repo-local artifact writes as renderer file changes.
- **Seeded project does not appear**: confirm the seed script wrote `$env:LIGHTCODE_BASE_DIR\state.sqlite`, confirm the app was launched from the same shell with that `LIGHTCODE_BASE_DIR`, and confirm the seeded path exists on disk.
- **`command not found` / `parse error near ')'` on a Bash call**: the shell isn't what the environment header claims (it has run as zsh while the header said fish). Rewrite in POSIX sh — no `(seq …)`, no `string match`, no relying on `$VAR` word-splitting a multi-word command (use an `ab(){ …; }` function). See Quick path §0.
- **`agent-browser: command not found`**: it's not on PATH in the Bash shell. Use `npx --no-install agent-browser …` (resolves from the npx cache); don't go looking for the binary.
- **Can't reach a state-dependent UI (download progress, error, loading, a specific variant)**: don't try to trigger it through real async — drive the store via the dev bridge (Patch 3), or temporarily expose the store on `window` and reset it before teardown.
- **Icon-only button not clickable by name**: collapsed-rail / toolbar icon buttons expose their label via a **tooltip**, not `aria-label`/text — your text-based ref finder returns nothing. Take a ref from the open `snapshot -i`, or traverse the DOM (`container.lastElementChild`, nth `button`). See Quick path §5.
- **Left the user's dev app in a changed state**: when using the fast real-`~/.lightcode-dev` path, sidebar collapse / panel sizes persist. Re-expand the sidebar and reset injected store state before teardown. See Quick path §3.
