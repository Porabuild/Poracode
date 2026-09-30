# Muse Code — Native Windows Support (retire the WSL routing workaround)

Status: plan (2026-09-16). Phases 1, 3, 4, 5 implemented; Phase 0, Phase 2, and the Windows QA matrix still need a Windows host. Authored against `poracode/v2` at `889d2d79e`.

Read `.agents/docs/agent-adapters.md` ("Provider Isolation — Hard Rules") and
`.agents/docs/versioning.md` before starting.

## 1. Decision summary

Meta now ships an official native Windows package for Muse Code
(`irm https://dev.meta.ai/install.ps1 | iex`). Poracode currently has no native
Windows path for Muse: native Windows projects are force-routed into the default
WSL distro via the adapter flag `windowsProjectExecution: "wsl"`, the Settings
"Install" and "Update" actions run the Linux installer inside WSL, and detection
probes WSL instead of the Windows host. This plan removes that routing and makes
Muse behave like every other natively-installed Windows CLI (Kimi, Codex, Grok).

| Area                                         | Today (WSL workaround)                                   | Target                                                                 |
| -------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| Native Windows project, Muse thread          | Routed to default WSL distro (`windowsProjectExecution`) | Runs `muse` natively on the Windows host                               |
| Settings → Install (Windows)                 | `wsl.exe --exec bash -lc "curl … install.sh \| bash"`    | `powershell.exe … "irm https://dev.meta.ai/install.ps1 \| iex"`        |
| Settings → Update (Windows)                  | Same WSL installer via `update.installer.windows`        | Same PowerShell installer via `update.installer.windows`               |
| Detection on Windows                         | Probes WSL when the project is native Windows            | Probes the Windows host (`muse.cmd` on `PATH`)                         |
| Native MCP config (`settings.json`)          | POSIX env only (`envKind === "posix"`)                   | POSIX and native Windows                                               |
| WSL **projects** (`location.kind === "wsl"`) | Supported                                                | Unchanged — still supported for Muse installed inside a distro         |
| Usage credential WSL fallback                | `readMuseAuthFromWsl` when native auth.json is missing   | Unchanged — parity with Claude/Codex/Gemini fallbacks                  |
| Legacy threads pinned to WSL                 | `config.executionEnvironment = { kind: "wsl", distro }`  | Still honored (thread-level pin), so old sessions keep resuming in WSL |

Scope boundary that must not blur: **WSL projects are a first-class location kind
for every provider and stay.** Only the _native-Windows-project → WSL_ redirect,
and the WSL-based install/update on Windows, are the workaround being removed.

## 2. Facts about the official Windows package (verified 2026-09-16)

Sources: `https://dev.meta.ai/docs/muse-code` (Windows section),
`https://dev.meta.ai/install.ps1`, `https://api.meta.ai/muse-launcher.ps1`.

- **Install command:** `irm https://dev.meta.ai/install.ps1 | iex`. Requires
  PowerShell 5.1+. Windows only.
- **Install layout:** `%LOCALAPPDATA%\Programs\muse\` (override
  `MUSE_INSTALL_DIR`) containing `muse.cmd` (batch shim) and
  `.muse-launcher.ps1`. The shim runs
  `powershell -NoProfile -ExecutionPolicy Bypass -File .muse-launcher.ps1 %*`.
  User `Path` is updated unless `MUSE_NO_MODIFY_PATH` is set.
- **Real binary:** the launcher downloads `muse-bin-<version>.exe` into the same
  directory, tracks the active version in `.muse-version`, and picks
  `aarch64_windows` / `x86_windows` from `PROCESSOR_ARCHITECTURE`. It invokes the
  binary with `& $binary @args` and propagates `$LASTEXITCODE`.
- **Auto-update:** on by default, checked hourly (`MUSE_UPDATE_INTERVAL_SECONDS`),
  disabled by `MUSE_NO_AUTO_UPDATE=1`. Poracode already sets that variable as
  Muse `baseSpawnEnv` (`MUSE_DISABLE_AUTO_UPDATE_ENV`), and deliberately not on
  `update` commands, so the existing contract carries over unchanged.
- **Auth file on Windows:** `MUSE_AUTH_PATH`, else
  `%USERPROFILE%\.config\muse\auth.json` (honors `XDG_CONFIG_HOME`). This is the
  same shape `nativeMuseAuthPath()` already computes (`homedir()` is
  `%USERPROFILE%` on Windows), so credential detection and usage-token reading
  need no path change.
- **Other launcher env:** `MUSE_CHANNEL`, `MUSE_CHANNEL_URL`, `MUSE_LOGIN`,
  `MUSE_SYNC_UPDATE`, `MUSE_AUTH_URL`, `MUSE_CLIENT_ID`, `MUSE_DOWNLOAD_HOST`.
- **Windows caveats from the docs:** agent-run commands use PowerShell; the OS
  sandbox may show a UAC prompt on first initialization; voice input and
  cross-session messaging (`muse session-message`) are unavailable on Windows.
- **Not documented anywhere:** the Windows data directory (session logs), the
  `settings.json` directory, and the skills directory. These must be established
  empirically in Phase 0.

## 3. Phase 0 — Windows spike (blocking for Phases 2 and 5; needs a Windows host)

Nothing in this phase changes the repo. Capture evidence under `tmp/muse-win/`.

1. Install with the official command in a clean user profile. Record the
   directory listing of `%LOCALAPPDATA%\Programs\muse` and confirm
   `muse-bin-*.exe` exists **before** any Poracode probe runs. Then run
   `set MUSE_NO_AUTO_UPDATE=1 && muse --version`. If the launcher refuses to run
   with auto-update disabled and no cached binary, the Settings install command
   must be followed by one unguarded `muse --version` (see Phase 1, item 4).
2. Run one interactive session and one `muse serve` session, then locate the
   session store. Candidates: `%USERPROFILE%\.local\share\muse\sessions`
   (POSIX convention, matches the auth path convention) or `%LOCALAPPDATA%\muse`.
   Record the exact path and the date-sharded layout (`YYYY/MM/DD/<uuid>`).
3. Locate `settings.json` (add an MCP server via `muse init` or by editing and
   confirm it is read). Locate the global skills directory.
4. Confirm `muse serve` exists and handshakes on Windows (MSP `initialize` /
   `initialized`) through the `.cmd` shim with piped stdio. Record the schema
   fingerprint reported by the Windows binary against `MSP_SCHEMA_FINGERPRINT`.
5. Invoke `muse-bin-<version>.exe --version` and `… serve` directly, bypassing
   the launcher, to learn whether direct-exe spawning is viable (Phase 2).
6. Teardown: spawn `muse serve` via the shim from a Node child with piped stdio,
   `taskkill /T /F` the root, and verify no `muse-bin-*` process survives and a
   subsequent `session/resume` does not fail `sessionInUse`.
7. Console flicker: check whether the shim's `cmd.exe` grandchild shows a
   console window for hidden piped spawns (the shared code documents this hazard
   for `.cmd` wrappers).
8. Capture ConPTY frames of the TUI (`Muse Code <version>` header, `⟩` glyph,
   `◆ Working (… esc to interrupt)`, `◇ Thinking`) to confirm the terminal
   heuristics in `src/supervisor/agents/muse/terminal.ts` still match.
9. Run `muse login` natively, confirm the browser opens without `BROWSER`
   overrides and `auth.json` lands at the launcher's path.
10. Run `muse serve --trust-workspace` **without** `--disable-sandbox` and note
    whether the UAC prompt blocks a headless host.

## 4. Phase 1 — Adapter goes native on Windows (`src/supervisor/agents/muse/`)

All changes are provider-local. No shared file changes in this phase.

1. `index.ts`: delete `windowsProjectExecution: "wsl"`. Keep
   `spawnEnv: { wsl: { BROWSER: "/bin/true" } }` — it still serves WSL projects.
   Update the header comment with the Windows install command. Change
   `nativeMcpConfig` from `envKind === "posix"` to `envKind !== "wsl"` (matching
   Kimi/Grok/Antigravity) once Phase 0 item 3 confirms the Windows
   `settings.json` location.
2. `detection.ts`: replace `update.installer.windows` with the Kimi pattern:
   `powershell.exe -NoLogo -NoProfile -NonInteractive -Command "irm https://dev.meta.ai/install.ps1 | iex"`.
   Rewrite the comment block above it (no WSL mention). Remove the
   `WSL_MUSE_AUTH_PATH` branch from `storedCredentialsAuthProbe` only if the
   probe context can no longer be WSL — it can (WSL projects), so **keep it**.
3. `paths.ts` / `nativeMcp.ts` / `sessionFiles.ts`: if Phase 0 shows Windows uses
   a non-XDG data or config root, add `process.platform === "win32"` branches
   inside `nativeMuseDataHome()` / `nativeMuseConfigHome()` / the default
   `museNativeMcpConfig` path. These are Muse-owned modules, so a platform branch
   there is legitimate. Keep the WSL POSIX snippets — WSL projects use them.
4. `src/renderer/views/SettingsOverlay/parts/agentRegistryNative.ts`: replace the
   Windows arm of Muse's `installCommand` with the PowerShell installer (copy the
   Kimi entry's shape, including the `Get-Command irm` guard). If Phase 0 item 1
   shows the first guarded run fails, append `; muse --version` so the binary is
   fetched during install. Rewrite the comment. The `description` string does
   **not** change, so no i18n work is needed; if it is changed, all 12 catalogs
   must be filled per CLAUDE.md.
5. `msp/protocol.ts` and `msp/client.ts` doc comments: reword "WSL routing" to
   "WSL project routing" so they no longer imply Windows depends on WSL.
6. `src/supervisor/runtime/museCredentials.ts`: no change. The WSL fallback is the
   same pattern every provider uses and is gated by the WSL-activity predicate.

## 5. Phase 2 — Windows shim handling (conditional on Phase 0 items 5–7)

Only if the spike shows console flicker or orphaned `muse-bin` processes:

- Add `src/supervisor/agents/muse/windowsExecutable.ts` modeled on
  `src/supervisor/agents/cursor/windowsExecutable.ts`: when the detected
  executable is `muse.cmd`, read `.muse-version` next to it and return
  `muse-bin-<version>.exe` as the direct launch binary. Wire it through the
  adapter's `buildLaunchArgv` / `buildResumeArgv` / `buildOneShotCommand` and the
  MSP `spawnMuseServeHost` executable path, exactly as Cursor does. Fall back to
  the shim when the version file or binary is missing.
- Because Poracode always sets `MUSE_NO_AUTO_UPDATE=1`, bypassing the launcher
  loses nothing on the update side. The Settings **Update** action still runs the
  official installer and must not use the direct exe.
- Tests: `windowsExecutable.test.ts` with a temp directory containing a fake
  shim, `.muse-version`, and `muse-bin-1.0.3.exe`; cover missing-file fallbacks.

If the spike is clean, skip this phase and record that decision here.

## 6. Phase 3 — Compatibility boundaries (`.agents/docs/versioning.md`)

1. **Agent-status caches.** Cached Windows statuses for Muse currently say
   `installed: false, envKind: "windows"` because detection never probed the host.
   Bump `STATUS_CACHE_VERSION` 35 → 36 in
   `src/supervisor/runtime/agentStatusService.ts` and the renderer store version
   32 → 33 in `src/renderer/state/agentStatusesStore.ts`. Add a v35 fixture test
   next to the existing "invalidates v22 native terminal-only Muse statuses" case
   in `agentStatusCache.test.ts`, and the mirror in `agentStatusesStore.test.ts`.
2. **Persisted thread config `executionEnvironment`.** This field is part of the
   remote v3 thread-config schema (`protocol/remote/v3/fixtures/thread-config-execution-environment.json`)
   and is persisted on every Muse thread created on a native Windows project.
   Keep the schema field (no wire change, no protocol regeneration). Change
   `resolveAgentProjectLocation` in `src/supervisor/agents/base/executionEnvironment.ts`
   to honor an explicit `executionEnvironment.kind === "wsl"` **regardless of the
   adapter flag**, so legacy threads keep resuming inside the distro where their
   Muse session logs live. New threads never receive the field because nothing
   produces it any more. Add a regression test: a `windows` location plus a
   persisted `{ kind: "wsl", distro }` resolves to that distro for an adapter with
   no routing flag.
3. **No migration of thread rows** is needed under item 2. If the decision in
   item 2 is reversed (drop the pin), a migration must mark those threads
   non-resumable with a user-visible notice; do not silently resume them natively.

## 7. Phase 4 — Remove the now-unused shared capability

Muse was the only consumer of `windowsProjectExecution` (introduced in #696).
With the thread-level pin from Phase 3 carrying legacy behavior, the adapter flag
is dead. Remove it in one dedicated commit so it can be reverted independently:

- `src/supervisor/agents/base/types.ts` — drop `windowsProjectExecution`.
- `src/supervisor/agents/base/executionEnvironment.ts` — delete
  `resolveAgentEnvContext` (and its call sites; grep) and drop the adapter
  parameter from `resolveAgentProjectLocation`.
- `src/supervisor/runtime/threadSession/spawnPipeline.ts` `resolveThreadExecution`
  — stop stripping/re-deriving `executionEnvironment`; pass the persisted value
  through unchanged.
- `src/supervisor/crossagentMcp/SubagentRunManager.ts` — drop the
  `attempt.adapter.windowsProjectExecution === "wsl"` clause (the platform and
  `executionEnvironment` clauses remain).
- `src/supervisor/crossagentMcp/testHarness.ts` — drop the option.
- `src/supervisor/agents/base/executionEnvironment.test.ts` and any crossagent
  tests referencing the flag.
- `.agents/docs/agent-adapters.md` — remove the "Optional — Execution
  Environment" bullet; update the Muse row/mentions in the provider table.

If the team prefers to keep the capability for a future provider, skip this phase
and instead document it as "currently unused" in `agent-adapters.md`.

## 8. Phase 5 — Tests to update or add

- `src/supervisor/agents/muse/muse.test.ts`: `windowsProjectExecution` expectation
  removed; `update.installer.windows` expects the PowerShell installer; the WSL
  `BROWSER` test stays (WSL projects).
- `src/supervisor/agents/muse/detection.test.ts:147`: installer expectation.
- `src/supervisor/agents/muse/nativeMcp.test.ts`: `envKind: "windows"` now yields a
  config; `envKind: "wsl"` still yields `undefined`.
- `src/supervisor/agents/muse/paths` (new test if Phase 1 item 3 adds branches):
  mock `process.platform` / env to cover Windows resolution.
- `src/renderer/views/SettingsOverlay/parts/SingleAgentSettings/SingleAgentSettings.test.tsx:1394`
  ("offers Muse's WSL-backed installer for a native Windows environment") →
  native PowerShell installer.
- `src/renderer/views/SettingsOverlay/parts/AcpRegistrySettings.test.tsx:1110`
  ("runs Muse's native Windows install through the default WSL distro") → expects
  `irm https://dev.meta.ai/install.ps1 | iex`.
- `src/supervisor/runtime/agentStatusCache.test.ts` and
  `src/renderer/state/agentStatusesStore.test.ts`: version constants and the new
  pre-upgrade fixtures (Phase 3).
- `src/supervisor/agents/base/executionEnvironment.test.ts`: thread-pin test
  (Phase 3), flag removal (Phase 4).
- Terminal heuristics: if Phase 0 item 8 shows different ConPTY frames, add the
  captured Windows frame as a fixture to the `terminal.ts` tests.
- Do not touch `msp/session.test.ts` WSL disposal tests or `client.test.ts` WSL
  login-shell routing — those cover WSL projects and remain valid.

## 9. Phase 6 — Verification

Repo checks (run on the touched files, then the full trio before hand-off):

```
pnpm exec vitest run src/supervisor/agents/muse src/supervisor/agents/base/executionEnvironment.test.ts src/supervisor/runtime/agentStatusCache.test.ts src/renderer/state/agentStatusesStore.test.ts src/renderer/views/SettingsOverlay
pnpm run typecheck && pnpm run lint && pnpm run test
```

Windows manual QA matrix (native Windows project, fresh profile, evidence in
`tmp/muse-win/qa/`):

1. Settings → Agent Registry → Install Muse; status flips to installed with the
   correct version; no WSL distro is booted (`VmmemWSL` absent).
2. Login from Settings opens the browser; status shows authenticated; usage panel
   resolves the `dca:` token from `%USERPROFILE%\.config\muse\auth.json`.
3. Terminal thread: launch, first prompt delivery, Working/Thinking/idle status
   transitions, resume after app restart (session UUID discovered from the
   Windows session store).
4. GUI thread (MSP): handshake, turn streaming, approvals, Stop, steer, resume;
   after closing the thread no `muse-bin-*` process survives.
5. One-shot (`muse exec`) with a prompt containing quotes and newlines on
   PowerShell 5.1 and on pwsh 7.
6. Native MCP setup writes to the Windows `settings.json`; Muse skills slash
   commands appear.
7. Settings → Update runs the PowerShell installer and the version refreshes.
8. Logout from Settings clears `auth.json`.
9. Legacy thread created before this change (config pinned to a WSL distro)
   still resumes inside that distro.
10. A WSL project with Muse installed in the distro behaves exactly as before.

## 10. Risks and open questions

- **Unknown Windows data/config roots** (Phase 0 items 2–3). Session discovery,
  resume, native MCP config, and skills all depend on them. Nothing in Phases
  1–2 that touches paths should be merged on a guess.
- **Launcher + `MUSE_NO_AUTO_UPDATE=1` on first run** may refuse to fetch the
  binary (Phase 0 item 1). Mitigation lives in the install command, not in
  `baseSpawnEnv`.
- **`.cmd` shim process tree**: teardown relies on `taskkill /T /F` from the
  spawned root; a surviving `muse-bin` keeps sessions locked (`sessionInUse`).
  Phase 2 direct-exe launch is the fallback.
- **UAC sandbox prompt** can block a headless `muse serve` host on first use.
  If confirmed, surface a one-time hint in the Muse provider UI (localized) or
  document running `muse sandbox` once after install.
- **Schema fingerprint drift**: the Windows binary may report a different MSP
  fingerprint than the pinned `MSP_SCHEMA_FINGERPRINT`; treat as a normal
  host-version follow-up, not a Windows-specific branch.
- **Third-party articles still claim WSL is required.** The official docs and
  installer are authoritative; link them in the PR description.

## 11. Execution notes

- Phases 1, 3, 4, and 5 are implementable and unit-testable on macOS now.
  Phase 2 and the Windows QA matrix need a Windows host (developer machine or
  a Windows CI runner with the app built via `pnpm run build`).
- Suggested commit sequence: (1) adapter native switch + installer + tests,
  (2) cache bumps + thread-pin + fixtures, (3) shared capability removal + docs,
  (4) optional shim resolution. Each commit must leave typecheck/lint/tests green.
- Release notes: add the "Muse Code runs natively on Windows" entry through the
  `release-notes` skill at release time; older changelog lines that mention WSL
  for Muse stay as historical record.
