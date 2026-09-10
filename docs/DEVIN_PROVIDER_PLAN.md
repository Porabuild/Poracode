# Devin CLI Provider — Implementation Plan (Terminal + Structured Chat + Lifecycle)

Status: implemented and manually exercised on macOS with Devin 3000.10.21 (2026-09-10).
The original plan below is retained as the design record. Implementation findings:

- Terminal defaults to Smart; structured Chat uses Bypass as requested. Signed-in ACP also advertises Smart; Plan explicitly selects plan mode.
- Compact input/output price ranges appear beside model names, with full provider pricing and units on hover.
- Models are 46 CLI-declared families rather than 210 effort/speed variants. Independent controls resolve exact wire IDs, including opaque legacy IDs and priority speed variants.
- ACP runs only for GUI. Native terminal session IDs are discovered from cli/sessions.db; overlapping discoveries refuse ambiguous IDs.
- GUI remote MCPs use the existing stdio relay. Devin's native MCP discovery ignores ACP-only injected catalogs, so each GUI process receives a temporary config overlay with the merged catalog. Original configuration and durable session storage remain in place. Terminal per-thread MCP injection remains unsupported.
- Native foreground/background subagent metadata is mapped behind a provider-owned transform into agent rows and nested results.
- Terminal Plan entry waits for paste processing; subsequent input uses explicit bracketed paste boundaries.
- Usage is verified live: required Connect client metadata, nested userStatus.planStatus, daily/weekly quotas, reset times, and remaining overage balance.
- Updates use the official installer/package-manager path. The built-in update command is interactive; the installer update completed successfully during QA.
- Version audit: supervisor status cache29 and renderer cache26 refresh model families and pricing metadata. Daily usage expands the closed native wire enum, so remote protocol11 and regenerated native bindings are required. Temporary config overlays and ACP hooks are not persisted compatibility boundaries.
- QA evidence: `tmp/devin/qa/report.md`. Windows/WSL execution and destructive auth lifecycle actions were not live-tested on this macOS host.
  Read `.agents/docs/agent-adapters.md` in full before starting, especially
  "Provider Isolation — Hard Rules" and "Adding a New Provider — Full Checklist".

Scope (all required): terminal presentation, structured chat (GUI) presentation, one-shot
generation, install, update, login, logout, session management, usage bar.

## 1. Decision summary

Devin CLI (Cognition, binary `devin`) is a **local** terminal coding agent with an official
**ACP** (Agent Client Protocol, JSON-RPC 2.0 over stdio) server exposed as `devin acp`. This is
the sanctioned embedding surface used by Zed, JetBrains, and Xcode. The plain `-p` print mode
emits final text only, with no documented streaming JSON for conversations.

| Poracode surface                     | Backing process                                                                     | Pattern to copy                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Terminal presentation                | real PTY running the `devin` TUI                                                    | `src/supervisor/agents/kimi/` (dual-presentation, opaque session ids)                                     |
| GUI presentation ("Structural Chat") | `devin acp` via `createAcpStructuredSession`                                        | `src/supervisor/agents/factory/` (lean ACP built-in) + Kimi's `createStructuredSession`                   |
| One-shot (title/commit/conflict)     | `devin -p "<prompt>"`                                                               | Kimi `buildOneShotCommand`                                                                                |
| Install / update / login / logout    | shared Settings card + shared dispatch, driven by `DetectionSpec` and adapter hooks | Kimi (terminal login, installer update), Factory (ACP auth), Grok (`builtIn` update + latest-version URL) |
| Usage bar                            | HTTP collector in `packages/agents-usage` + host token resolver                     | `collectors/kimi.ts` + `src/supervisor/runtime/kimiCredentials.ts`                                        |

Decisions taken:

- Kind `"devin"`, label `"Devin"`, manifest order 48 (between Muse 47 and Antigravity 50).
- Default approval policy **`smart`** (confirmed by product owner). Bypass policy `bypass`.
- No new shared capability fields expected, so no version bump at any versioned boundary
  (`AgentKind` is an open string, see `.agents/docs/versioning.md`). The only likely
  additive schema change is a new usage window id (see §6.6), which needs the cache audit there.
- The word `devin` appears in code only under `src/supervisor/agents/devin/`,
  `src/renderer/components/providers/devin/`, `packages/agents-usage/src/collectors/devin.ts`,
  `src/supervisor/runtime/devinCredentials.ts`, and one-line registrations in the existing
  registration tables. `src/supervisor/agents/acp/providerIsolation.test.ts` enforces the
  agents-folder rule automatically once `devin/detection.ts` exists.

## 2. Devin CLI facts the implementation relies on

Verified against docs.devin.ai (cli/index, cli/reference/commands, cli/reference/permissions,
cli/acp/{zed,jetbrains}, cli/extensibility/_, cli/models, cli/sandbox, cli/changelog/stable,
cli/enterprise/_, admin/billing/*):

- Install: `curl -fsSL https://cli.devin.ai/install.sh | bash` (macOS/Linux/WSL, binary lands in
  `~/.local/bin/devin`); `brew install --cask devin-cli`; Windows `irm https://static.devin.ai/cli/setup.ps1 | iex`
  or `winget install --id CognitionAI.DevinCLI`. No official npm package. No `DEVIN_HOME` env var.
- Version scheme `v3000.MAJOR.MINOR[-build]` (current ~`v3000.10.21`). Exact `devin --version`
  output format is undocumented.
- Update: `devin update [--force]` and `/update` exist. macOS/Linux builds **self-update silently
  in the background** while running; opt-out is `"auto_update": false` in
  `~/.config/devin/config.json` (no env var). No public latest-version JSON endpoint is documented;
  the Homebrew cask `devin-cli` is the only stable public version signal.
- Auth: `devin auth login` (browser OAuth; `--force-manual-token-flow` for headless), `devin auth logout`
  (removes local credentials), `devin auth status` (prints login method, name, email, user id,
  team id, plan; no JSON flag). Env var honored: **`WINDSURF_API_KEY`**. Tokens do not expire by default.
- Credential file `credentials.toml` at `$XDG_DATA_HOME/devin/` (fallback `~/.local/share/devin/`),
  Windows `%APPDATA%\devin\`. Fields (inferred from open-source clients): `windsurf_api_key`,
  optional `api_server_url`. Treat the file as a bearer secret: read only to test presence and
  to hand the token to the usage collector; never log it.
- Interactive: `devin` or `devin -- <initial prompt>`. Flags: `--model <name>`,
  `--permission-mode {normal|accept-edits|smart|bypass|autonomous}`, `--sandbox`,
  `--continue`/`-c`, `--resume <id>`/`-r`, `--print`/`-p`, `--prompt-file`, `--config <path>`,
  `--respect-workspace-trust [true|false]`, `--export`.
- Modes: agent modes (normal / plan / ask) are separate from permission modes (since v2026.4.9).
  `autonomous` requires `--sandbox`; `--sandbox` hard-fails on Windows.
- Headless: `devin -p "<prompt>"` prints the final answer; `-p --continue` follows up.
  Non-interactive runs need `--respect-workspace-trust false` and a non-`normal` permission mode.
- ACP: `devin acp` (JSON-RPC over stdio). `authenticate` reuses stored credentials and only
  opens the browser flow when none are valid. No ACP `logout` method is documented.
- Models: `devin models list --format json`; default model `swe-1-6-fast`; aliases `opus`,
  `sonnet`, `swe`, `codex`, `gemini`. Reasoning level is a runtime toggle (Alt+T), no flag documented.
- MCP: `devin mcp add|list|get|remove|login|logout|enable|disable`; config at
  `~/.config/devin/mcp_config.json`, `.devin/mcp_config.json`, `.devin/mcp_config.local.json`.
- Config: `~/.config/devin/config.json`, `.devin/config.json`, `.devin/config.local.json`.
- Context files: `AGENTS.md`, `AGENTS.local.md`, `AGENT.md`, `CLAUDE.md`, `.devin/rules/*.md`.
- Skills: `.devin/skills/<name>/SKILL.md`, invoked as `/skill-name`.
- Sessions: `devin list|ls [--format json|csv]`, `devin rm <id>`, `/fork`, `/revert`, `/handoff`.
  No documented on-disk transcript path; `--export` writes an ATIF file on demand.
- Usage: `/usage` and `/session-stats` are TUI text panels only. No CLI JSON. The CLI's own
  quota source is an **undocumented** Connect-RPC call (see §6.6). Plans: Free, Pro (daily +
  weekly quota), Max (weekly only), Teams, Enterprise (ACU billing). Overage is tracked as a
  micro-dollar balance.
- Terminal tiers: full features need Kitty/Ghostty/WezTerm/iTerm2 3.5+/Windows Terminal 1.25+;
  cmd.exe conhost is unsupported.

Must be confirmed empirically in Phase 0: on-disk session store, `devin acp` flag handling and
`initialize` capabilities, `devin --version` format, `devin auth status` exact layout and exit
code when logged out, `devin update` exit behavior, `devin ls --format json` schema, trust store
format, WSL PATH after the install script, and the `GetUserStatus` response shape.

## 3. Phase 0 — empirical verification (do this first, record results in `tmp/devin/`)

Install the CLI on the dev host (`brew install --cask devin-cli`) and log in. Then capture:

1. `devin --help`, `devin acp --help`, `devin auth --help`, `devin update --help`,
   `devin --version`, `devin models list --format json`, `devin ls --format json`,
   `devin doctor --json`. Save raw outputs.
2. `devin auth status` while logged in and after `devin auth logout`: capture text and exit
   codes (`echo $status`). Note whether email/plan lines are stable enough to parse.
3. ACP handshake: run the existing probe helper against `devin acp` (see
   `probeAcpCapabilities` in `src/supervisor/agents/acp/probe.ts`; a tiny script under `tmp/`
   is fine) and save the `initialize` result plus a `session/new` result. Note `authMethods`,
   `agentCapabilities.loadSession`, `mcpCapabilities`, `auth.logout`, modes, models, and whether
   `session/new` accepts stdio and HTTP `mcpServers`. Also test `devin --model X acp` and
   `devin --permission-mode smart acp` to see whether flags before the subcommand are honored.
4. Start a TUI session in a scratch repo, send one prompt, then diff the filesystem to find
   where session transcripts land (`fd --changed-within 5m . ~ | rg -v Library/Caches`). Record
   the directory, file naming, and whether the session id appears in the file name or a JSON
   field. Compare with `devin ls --format json`.
5. Record the TUI footer/idle line, the "working" indicator text, the permission prompt text,
   the workspace-trust prompt text, the `/usage` panel text, and the model/plan-mode indicator
   strings (copy from scrollback, strip ANSI). These feed `terminal.ts`.
6. First launch in an untrusted directory: does a trust dialog block? Where is trust recorded
   (look under `~/.config/devin/`)? Decide between pre-writing the marker (Kimi `kimiTrust.ts`
   pattern) and passing `--respect-workspace-trust false`.
7. `devin update` on an already-current install: interactive or not, exit code, output.
   Check `~/.config/devin/config.json` for `auto_update` and whether a background update ever
   swaps the binary during a running session.
8. WSL (Windows host): run the install script inside a distro, then `command -v devin` and
   `ls ~/.local/bin`. Needed to decide `wslBinaryHome`.
9. Usage endpoint: with the token from `credentials.toml`, POST to
   `{api_server_url or https://server.codeium.com}/exa.seat_management_pb.SeatManagementService/GetUserStatus`
   with headers `Content-Type: application/json`, `Connect-Protocol-Version: 1` and body
   `{"metadata":{"apiKey":"<token>"}}`. Save the response shape with the key redacted. Confirm
   the fields `planStatus.planInfo.{planName,billingStrategy,hideDailyQuota}`,
   `dailyQuotaRemainingPercent`, `weeklyQuotaRemainingPercent`, `overageBalanceMicros`,
   `dailyQuotaResetAtUnix`, `weeklyQuotaResetAtUnix`. Record the 401/403 shape after logout.

Every claim in sections 4 to 6 marked **[verify]** depends on these results.

## 4. Supervisor adapter — `src/supervisor/agents/devin/`

### 4.1 `detection.ts`

```ts
export const DEVIN_ACP_ARGS = ["acp"] as const;

export const DEVIN_APPROVAL_POLICIES = [
  { id: "normal", label: "Normal (ask for writes and commands)" },
  { id: "accept-edits", label: "Accept Edits" },
  { id: "smart", label: "Smart (safety-model gated)" },
  { id: "bypass", label: "Bypass (auto-approve everything)" },
  // "autonomous" requires --sandbox; add only when sandboxModes ships (see §8).
] as const;

export const devinDefaultCapabilities: AgentCapability = {
  models: [],                 // filled by capabilitiesProbe
  efforts: [],
  modelEfforts: {},
  modes: ["agent", "plan"],   // ACP probe may replace with the advertised mode list
  approvalPolicies: [...DEVIN_APPROVAL_POLICIES],
  sandboxModes: [],
  supportsResume: true,
  supportsOneShot: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  presentationModes: ["terminal", "gui"],
  defaultApprovalPolicy: "smart",
  bypassPermissions: { approvalPolicy: "bypass" },
  settingDefs: [],
};

export const devinDetectionSpec: DetectionSpec = {
  kind: "devin",
  label: "Devin",
  binary: "devin",
  versionArgs: ["--version"],
  capabilities: devinDefaultCapabilities,
  loginCommand: ({ location, executablePath }) => /* `<quoted path> auth login` (see §5.3) */,
  update: { /* see §5.2 */ },
  authProbes: [
    envVarAuthProbe(["WINDSURF_API_KEY"]),
    configFileAuthProbe(resolveDevinCredentialsPath),   // §5.3
  ],
  // wslBinaryHome only if Phase 0.8 shows the binary is off PATH inside WSL [verify]
  async capabilitiesProbe(ctx) { /* ACP probe, see below */ },
  // statusProbe for account metadata, see §5.3 [verify parse stability]
};
```

- `buildDevinCommand(location, args, executablePath?)` = `buildAgentCommand(location, "devin", args, executablePath)`.
- `capabilitiesProbe(ctx)`: mirror Factory's `probeCapabilities` (`probeAcpCapabilities` on
  `devin acp`, `timeoutMs: 30_000`, label `devin:<kind>`), then `buildDevinProbeCapabilities(probe)`
  merging `models`, `efforts`, `modes`, `approvalPolicies`, `slashCommands`, `authMethods`
  (`dedupeAcpAuthMethods` plus the static terminal method from §5.3), `authState`,
  `authLogoutSupported` (only if `initialize` advertises `auth.logout`). If the ACP probe
  returns no models **[verify]**, add a secondary source that runs `devin models list --format json`
  and maps entries to `{ id, label, description? }`; keep that parser in `models.ts` in the folder.
- `baseSpawnEnv`: none known. Devin has no env opt-out for its background self-updater; see §5.2.

### 4.2 `argv.ts`

```ts
// devin [--model m] [--permission-mode p] [--resume id | --continue] [--respect-workspace-trust false] [-- prompt]
export function buildDevinArgs(config: ThreadConfig, prompt: string, session?: string): string[];
export function buildDevinContinueArgs(config: ThreadConfig): string[];
export function buildDevinAcpArgs(config: ThreadConfig): string[]; // flags allowed before `acp` [verify]
export function buildDevinOneShotArgs(model: string | undefined, prompt: string): string[];
```

Mapping rules:

- `config.model` → `--model <id>`.
- `config.approvalPolicy`: `bypassPermissions` or `bypass` → `--permission-mode bypass`;
  `smart`, `accept-edits`, `normal` → pass through; unknown → omit.
- `config.mode === "plan"`: if Phase 0 finds a plan flag **[verify]**, use it; otherwise omit from
  argv and let the runtime type `/plan` through `buildDirectInput` before the first prompt
  (document the choice in a comment). Never combine plan mode with `bypass`.
- Initial prompt: pass positionally after `--` when the TUI supports it **[verify]**; then
  `shouldDeferPromptToTerminal` returns `false`. If the positional prompt is unreliable
  (swallowed by a trust dialog), fall back to Kimi's deferred typing path.
- One-shot: `["-p", prompt, "--permission-mode", "bypass", "--respect-workspace-trust", "false", ...(model ? ["--model", model] : [])]`.
  Utility one-shots must never block on a prompt.

Each flag gets a doc-comment citing the docs page, as `kimi/argv.ts` does.

### 4.3 `terminal.ts`

`detectDevinTerminalStatus(text)` via `detectTerminalStatusFromHints(text, DEVIN_STRONG, DEVIN_FALLBACK_IDLE)`.
Start from Kimi's generic patterns (`[y/n]`, `Allow ...?`, `esc to interrupt`, `thinking...`)
and add the exact Devin strings recorded in Phase 0.5 (permission prompt, trust dialog,
idle footer, mode indicator). Export `DEVIN_TRUST_PROMPT_PATTERN` for the prompt gate.

### 4.4 `session.ts` and `sessionFiles.ts`

- `session.ts`: `resolveDevinCredentialsPath(location)` (§5.3), `detectDevinInvalidSessionRef(text)`
  (regex for the error printed by `--resume <bad id>` **[verify from Phase 0]**).
- `sessionFiles.ts` (only if Phase 0.4 finds a stable on-disk store): `snapshotDevinPreSpawnSessions`,
  `discoverDevinSessionRef`, `makeDevinDiscoverSessionRef`, `makeDevinWatchSessionRef`,
  mirroring `kimi/sessionFiles.ts`. The discovered id becomes `sessionRef.providerSessionId`
  and drives `--resume <id>`. Do not read transcript contents, only the id.
- Fallback if no stable store exists: `createInitialSessionRef` returns `undefined`,
  resume uses `--continue` (most recent session in cwd), and `supportsResume` stays `true`
  with a comment explaining the weaker guarantee. Do not shell out to `devin ls` on a schedule;
  a single pre/post-spawn diff of `devin ls --format json` is acceptable only as a last resort
  and must be documented as such (see "ACP session ownership" in the adapter doc).

### 4.5 `index.ts` — `createDevinAdapter()`

Compose exactly like Kimi:

- `kind`, `label`, `binary`, `...(update)`, `...inheritBaseSpawnEnv(spec)`, `get capabilities()`,
  `detectInstall` via `detectAgentInstall(ctx, devinDetectionSpec)`.
- `skillSupport`: roots `{ id: "devin", projectPath: ".devin/skills" }` plus a global path if
  Phase 0 finds one **[verify]**, and `{ id: "agents", globalPath/projectPath: ".agents/skills" }`;
  `invocation: "slash"`; precedence `["devin", "agents"]`.
- `buildLaunchArgv(location, config, prompt)`: snapshot sessions (if 4.4 applies), return
  `{ binary: "devin", args: buildDevinArgs(config, prompt) }`.
- `buildResumeArgv(_, config, prompt, sessionRef)`: `--resume <id>` or `--continue` fallback.
- `rewriteLaunchArgsForConfig`: pre-write the workspace-trust marker if Phase 0.6 shows a
  file-based trust list; otherwise no-op.
- `createStructuredSession(input)`:
  ```ts
  const command = buildDevinCommand(
    input.projectLocation,
    [...buildDevinAcpArgs(input.config), ...DEVIN_ACP_ARGS],
    resolveAgentBinaryPath(input.projectLocation, "devin"),
  );
  return createAcpStructuredSession(command, input, {
    // set only what Phase 0.3 proves necessary:
    // assumedMcpCapabilities: { http: true }   if initialize omits mcpCapabilities but session/new accepts HTTP servers
    // acpOptimisticMcpTransports: ["stdio"]     if stdio servers are rejected at session/new without a capability flag
    // acpFsTextCapability: false                if the agent mis-handles client fs errors (test plan mode first)
  });
  ```
  Do not add `sessionUpdateTransform`, `textStreamExtension`, or `behavior` speculatively.
  Add one only for a reproduced wire quirk, with the reproduction described in a comment, and
  keep the parser in the provider folder.
- `buildAcpAuthCommand`, `buildAcpLogoutCommand`, `preferAcpLogoutRpc`: see §5.3 and §5.4.
- `createInitialSessionRef` → `undefined`; `initialSessionRefDiscoveryDelayMs`, `discoverSessionRef`,
  `watchSessionRef` per 4.4.
- `buildDirectInput(prompt)` → `[prompt, "@wait:200", "\r"]` (adjust the wait after testing
  paste handling in the TUI).
- `isReadyForInitialPrompt(text)`: false while `DEVIN_TRUST_PROMPT_PATTERN` matches; true on
  the idle footer string.
- `formatPromptSegments`: attachments as `@<path>` tokens appended after the text **[verify
  that the TUI accepts `@path` mentions; otherwise inline the paths]**.
- `detectTerminalStatus: detectDevinTerminalStatus`, `detectInvalidSessionRef`.
- `defaultOneShotModel: "swe-1-6-fast"`, `buildOneShotCommand(model, _effort, prompt)` →
  `{ command: "devin", args: buildDevinOneShotArgs(model, prompt), stdin: "" }`.
- `spawnEnv: { wsl: { BROWSER: "/bin/true" } }` so `auth login` inside WSL prints the URL
  instead of hanging on `xdg-open` (Kimi pattern).

### 4.6 Tests (colocated)

- `argv.test.ts`: every mapping in 4.2 including plan/bypass exclusivity and `--resume` vs `--continue`.
- `detection.test.ts`: `buildDevinProbeCapabilities` with a fixture from Phase 0.3, credentials
  path resolution per platform, models-list JSON parsing fixture, `loginCommand` quoting,
  `auth status` account parsing fixtures (logged in, logged out, enterprise).
- `terminal.test.ts`: each pattern against real scrollback fragments from Phase 0.5.
- `sessionFiles.test.ts` (if applicable): snapshot/diff discovery against a temp dir.
- `devin.test.ts`: adapter shape (`presentationModes`, `createStructuredSession` defined,
  `buildAcpAuthCommand` and `buildAcpLogoutCommand` command/args, one-shot args, `update` re-exposed).

## 5. Lifecycle surfaces

All five surfaces are driven by shared code that reads declarations off `DetectionSpec` and the
adapter. None of them needs a shared-file change beyond the one registry entry in §5.1.

### 5.1 Install

Path: Settings agent card → `runAgentInstallCommand` (`src/renderer/actions/agentLoginActions.ts`)
opens the transient login terminal, runs the command string in a real PTY, and on exit 0 calls
`refreshAgentStatuses` scoped to that environment. The supervisor then invalidates the executable
path cache and re-detects.

Add to `NATIVE_AGENT_REGISTRY_ENTRIES` in `src/renderer/views/SettingsOverlay/parts/agentRegistryNative.ts`:

```ts
{
  id: "devin",
  description: msg`First-class Devin CLI integration using Poracode's native terminal and ACP runtimes.`,
  docsUrl: "https://docs.devin.ai/cli",
  installCommand: (project) =>
    nativeInstallCommand(project, {
      mac:
        "if command -v brew >/dev/null 2>&1; then brew install --cask devin-cli; " +
        "elif command -v curl >/dev/null 2>&1; then curl -fsSL https://cli.devin.ai/install.sh | bash; " +
        "else printf 'Homebrew or curl is required to install Devin CLI. Install one, then refresh detected agents.\\n'; fi",
      posix:
        "if command -v curl >/dev/null 2>&1; then curl -fsSL https://cli.devin.ai/install.sh | bash; " +
        "else printf 'curl is required to install Devin CLI. Install curl, then refresh detected agents.\\n'; fi",
      windows:
        "if (Get-Command winget -ErrorAction SilentlyContinue) { winget install --id CognitionAI.DevinCLI } " +
        "elseif (Get-Command irm -ErrorAction SilentlyContinue) { irm https://static.devin.ai/cli/setup.ps1 | iex } " +
        "else { Write-Host 'No supported installer found. Install winget or PowerShell Invoke-RestMethod first, then refresh detected agents.' }",
    }),
},
```

Notes:

- Devin has a native Windows build, so no WSL fallback in the Windows installer (unlike Muse).
  WSL installs still work through the posix branch when the project is a WSL project.
- Detection: the curl script installs to `~/.local/bin/devin`, which the shared resolver already
  covers via login-shell `command -v` and the well-known-dirs fallback in
  `src/supervisor/agents/base/processRuntime.ts`. No `wslBinaryHome` unless Phase 0.8 shows the
  WSL PATH misses `~/.local/bin` for non-login shells; then declare
  `wslBinaryHome: { env: "XDG_BIN_HOME", defaultSubpath: ".local" }` only if the resolver's
  `/bin/<binary>` suffix logic matches, otherwise skip it and document.
- `ownsInstallRows`, `runtimeSlots`, `acpRegistryAliases`, `settingsPanel`: not needed. Devin is
  one binary with no separate ACP artifact.
- Description string is user-facing: extract and translate (§7).

### 5.2 Update

Path: `useProviderUpdates.ts` asks `getLatestAgentVersion` per kind, compares with
`isNewerVersion`, shows "Update available", and `updateAgentBinary` runs
`runUpdateCommandWithFallback` (`src/supervisor/agents/updateAgent.ts`) using
`resolveSharedUpdateCommand` (`src/shared/agents/updateResolver.ts`).

Declare on `devinDetectionSpec.update` and re-expose on the adapter (Factory pattern):

```ts
update: {
  builtIn: { binary: "devin", args: ["update"] },
  verifyBuiltInVersionChange: true,     // fall through to the installer if `devin update` exits 0 without changing the version
  homebrewCask: "devin-cli",            // latest-version signal: the shared prober scrapes the cask formula
  winget: "CognitionAI.DevinCLI",       // path-sniffed strategy on Windows when installed via winget
  installer: {
    posix: { binary: "sh", args: ["-c", "curl -fsSL https://cli.devin.ai/install.sh | bash"] },
    windows: { binary: "powershell.exe", args: ["-NoProfile", "-Command", "irm https://static.devin.ai/cli/setup.ps1 | iex"] },
  },
},
```

Notes:

- No `npm` (Devin is not on npm). No `latestVersionUrls` unless Phase 0 finds a public
  version endpoint; if one exists, add it first in the list since it beats the cask.
- Version comparison: `isNewerVersion` handles `v3000.10.21` style tags (numeric dotted compare
  after stripping a leading `v`). Add a unit test in `detection.test.ts` that feeds the exact
  `devin --version` output captured in Phase 0.1 through the shared version normalizer to prove
  the installed version parses **[verify]**. If the output has a prefix (for example
  `Devin CLI v3000.10.21`), implement `versionProbe` on the spec to extract the tag.
- Background self-update: Devin updates itself silently on macOS/Linux. Poracode must not write
  `auto_update: false` into the user's config. Document in the adapter that a running PTY may
  be on an older binary than the next launch, and rely on re-detection after each launch to keep
  the shown version honest. Revisit if Phase 0.7 shows the swap breaks a live `devin acp` process.
- Windows via winget: `resolveSharedUpdateCommand` picks `winget upgrade` only when the
  executable path looks like a winget install; the `installer.windows` branch covers the
  PowerShell-script install.

### 5.3 Login

Two mechanisms exist; the renderer prefers ACP-owned auth when both are present
(`SingleAgentSettings.tsx`, `findAgentAuthMethod`). Declare both so the Login button survives a
failed ACP probe:

- **ACP `authenticate`** (primary): `buildAcpAuthCommand(ctx)` returns
  `buildDevinCommand(detectProbeLocation(ctx), ["acp"], resolveAgentBinaryPath(location, "devin"))`.
  `dispatchAcpAuthenticate` spawns it and issues `authenticate` with the method id the probe
  advertised. Devin's `authenticate` reuses stored credentials or opens the browser flow; on WSL
  the dispatcher already injects the host-browser override.
- **Terminal login** (fallback): `loginCommand` on the spec returns
  `<quoted executablePath> auth login` (PowerShell `& '<path>' auth login` on Windows, using
  `quotePosixShellArg` / `quotePowerShellLiteral` as Kimi does). Export
  `devinTerminalAuthMethod: AgentTerminalAuthMethod = { id: "devin-terminal-login", name: "Login", type: "terminal" }`
  and include it in `authMethods` from `buildDevinProbeCapabilities`. Set
  `preferTerminalLogin: true` on the probe result only if Phase 0.3 shows ACP `authenticate`
  does not complete the browser flow.
- **Auth state** (`authProbes`, first `"authenticated"` wins):
  1. `envVarAuthProbe(["WINDSURF_API_KEY"])`.
  2. `configFileAuthProbe(resolveDevinCredentialsPath)` where the resolver returns
     `%APPDATA%\devin\credentials.toml` on Windows, `$XDG_DATA_HOME/devin/credentials.toml` or
     `~/.local/share/devin/credentials.toml` on posix, and `undefined` for WSL (WSL auth state
     comes from the ACP probe's `authState`).
     Optionally add a content check `hasDevinCredential(toml)` that requires a non-empty
     `windsurf_api_key` (mirrors `hasKimiCredential`), so an emptied file after logout reads as
     `missing`. Never log or surface the key.
- **Account display**: implement a `statusProbe` that runs `devin auth status` via
  `readCommandOutputAsync` and parses name/email/plan into `providerMetadata`
  (`AgentProviderMetadata`: `authenticatedAs`, `organization`, `plan`, `authMethod`). Parser
  lives in `devin/account.ts` with fixtures from Phase 0.2. If the output is not stable
  **[verify]**, skip `providerMetadata` rather than guessing; the card then shows auth state only.
- **Propagation**: every login path ends in `refreshAgentStatuses` for the acted-on env, which
  re-runs the auth probes. No extra work.

### 5.4 Logout

Path: Settings Logout button → `logoutAcpAgent` → `dispatchAcpLogout`
(`src/supervisor/agents/acp/dispatch.ts`). The button renders only when
`authState === "authenticated" && authLogoutSupported === true`.

- Set `authLogoutSupported: true` in `buildDevinProbeCapabilities` whenever the binary is
  installed (Devin has a real logout command even though ACP does not advertise `auth.logout`).
- `devinLogout.ts`: `buildDevinLogoutCommand(ctx)` returns the CLI logout command
  `buildDevinCommand(location, ["auth", "logout"], resolveAgentBinaryPath(location, "devin"))`.
  Prefer the CLI over deleting `credentials.toml` by hand so any server-side revocation the CLI
  performs still happens. Fall back to removing the credentials file only if Phase 0 shows
  `auth logout` needs a TTY.
- On the adapter: `buildAcpLogoutCommand: buildDevinLogoutCommand` and
  `preferAcpLogoutRpc: false` (no ACP logout RPC documented). Flip to `true` if Phase 0.3 shows
  `initialize` advertising `auth.logout`.
- After logout, the shared code refreshes statuses; the auth probes must return `missing`, which
  is why the credential-content check in §5.3 matters if Devin truncates rather than deletes the file.

### 5.5 Session management

Three distinct meanings, all covered:

- **Thread ↔ provider session (PTY)**: opaque ids discovered post-spawn (§4.4), stored on the
  Poracode thread as `providerSessionId`, resumed with `--resume <id>`; `--continue` fallback.
  Poracode threads stay the sole conversation list. Never surface `devin ls` as a picker and
  never import Devin transcripts.
- **Thread ↔ provider session (GUI)**: the shared ACP session stores the ACP session id and
  resumes through `session/load` when `initialize` advertises `loadSession` **[verify]**. If it
  is absent, GUI threads restart fresh after an app restart; record this in the providers table.
- **Auth session state**: cached in `AgentStatus` (`STATUS_CACHE_VERSION` in
  `src/supervisor/runtime/agentStatusService.ts`, bump only if a new `AgentStatus` field is
  added, which this plan does not require). Login, logout, install, and update all trigger a
  scoped `refreshAgentStatuses`. Mid-turn auth failures are not retried automatically; the
  next detection sweep flips `authState` to `missing` and re-surfaces Login. Devin tokens do
  not expire by default, so this is rare.
- **Workspace trust**: decided in Phase 0.6; either pre-write the trust marker in
  `rewriteLaunchArgsForConfig` or pass `--respect-workspace-trust false` on every Poracode
  launch. Prefer the marker so the user's own trust choices stay intact.
- **Cloud handoff**: `/handoff` ends the local process; the thread ends its turn normally.
  No attach support in this iteration (§8).

### 5.6 Usage bar

Architecture: `packages/agents-usage` (HTTP-only collectors keyed by provider id) plus a host
token resolver table in `src/supervisor/runtime/usageCredentials.ts`. The renderer enumerates
`allUsageProviderDescriptors()`; a provider with a descriptor but a failing collector shows in
Settings → Usage with its status and is hidden from the sidebar rail when `auth-missing` or
`unsupported`. A provider with no descriptor never appears, so usage can ship after chat.

Devin exposes no supported usage API. The CLI's own quota source is an undocumented
Connect-RPC call on legacy Windsurf infrastructure. Build the collector on it defensively.

Security note: the request carries the user's API key in the JSON body to the vendor's own
server (`api_server_url` from `credentials.toml`, default `https://server.codeium.com`). Only
ever send it to that host, never log the key or the raw body, and degrade to `error` on any
shape drift. This is the same trust level as the other collectors that post vendor tokens to
vendor endpoints.

Files:

1. `src/supervisor/runtime/devinCredentials.ts` (+ test): `resolveDevinToken()` returns
   `{ accessToken, baseUrl? }` from `WINDSURF_API_KEY` first, else from `credentials.toml`
   (`windsurf_api_key`, optional `api_server_url`) using the same platform path resolver as
   §5.3 (import it from the provider folder or duplicate the three-line path logic here; do not
   import supervisor agent code into the usage package). Add `devin: resolveDevinToken` to
   `tokenResolvers` in `usageCredentials.ts`.
2. `packages/agents-usage/src/collectors/devin.ts` (+ `devin.test.ts`): `collectDevinUsage(host, opts)`:
   - token via `host.credentials.getOAuthToken("devin")`; none → `{ status: "auth-missing" }`.
   - `POST {baseUrl}/exa.seat_management_pb.SeatManagementService/GetUserStatus`, headers
     `Content-Type: application/json`, `Connect-Protocol-Version: 1`, body `{ metadata: { apiKey } }`.
   - 401/403 → `auth-missing`; 429 → `rate-limited`; other non-2xx or unparseable → `error`.
   - Map: `weeklyQuotaRemainingPercent` → window `weekly` with `usedPercent = 100 - remaining`,
     `resetsAt = weeklyQuotaResetAtUnix * 1000`; `dailyQuotaRemainingPercent` → window `daily`
     unless `planStatus.planInfo.hideDailyQuota` is true or the plan is weekly-only;
     `overageBalanceMicros` → window `extra-usage` in `usd` (`micros / 1_000_000`) when non-zero;
     `planName` → snapshot plan label. `billingStrategy` → tooltip text only.
   - Parse with a zod schema kept in the collector; unknown extra fields are ignored.
3. `packages/agents-usage/src/providers.ts`: descriptor
   `devin: { id: "devin", label: "Devin", mechanism: "api-key", needsLogin: true, windowIds: ["daily", "weekly", "extra-usage"] }`.
4. `packages/agents-usage/src/registry.ts`: register `collectDevinUsage`.
5. `packages/agents-usage/src/types.ts`: add `"daily"` to `knownUsageWindowIdSchema` (additive).
   Audit `USAGE_CACHE_VERSION` in `src/supervisor/runtime/usageService.ts`: an additive enum
   value does not invalidate old snapshots, so no bump is required, but record the check in the
   PR description per `.agents/docs/versioning.md`. Check the renderer window-label map for
   `weekly`/`extra-usage` and add a `daily` label (localized) wherever window ids map to text.
6. `src/renderer/components/providers/usageProviders.ts`: `RENDERER_META.devin = { rings: { outer: ["daily"], inner: ["weekly"] } }`
   so the rail shows the fast window outside and the weekly quota inside (Kimi pattern).
7. Tests: collector fixtures for Pro (daily + weekly), Max (weekly only, `hideDailyQuota`),
   overage present, 401, malformed body. Credential resolver tests for env var, TOML with and
   without `api_server_url`, missing file.

Fallback if Phase 0.9 shows the endpoint rejects CLI tokens: ship the descriptor with a
collector that returns `unsupported`, so the provider lists in Settings → Usage with an honest
status, and open a follow-up. Do not scrape the TUI `/usage` panel; no collector in the codebase
spawns a CLI, and adding a process-exec capability to `HostPort` is a separate architectural change.

## 6. Shared registrations and tests

- `src/supervisor/agents/registry.ts`: `import { createDevinAdapter } from "./devin"` and append
  `builtIn(createDevinAdapter())` after `createFactoryAdapter()`.
- `src/supervisor/agents/registry.test.ts`: append `"devin"` to `EXPECTED_BUILT_IN_ORDER`; add
  `devin: "bypass"` to `EXPECTED_SUBAGENT_APPROVAL_POLICY` and `devin: "smart"` to
  `EXPECTED_DEFAULT_APPROVAL_POLICY`.
- `src/supervisor/agents/oneShotCapability.test.ts`: assert Devin advertises `supportsOneShot`
  with `buildOneShotCommand` and no `runOneShot`.
- Renderer provider folder `src/renderer/components/providers/devin/`:
  - `DevinIcon.tsx`: `createProviderIcon({ cssPrefix: "devin", path, viewBox })` from the official
    Devin mark, sized like `FactoryIcon.tsx`.
  - `manifest.ts`: `{ kind: "devin", label: msg\`Devin\`, order: 48 }`.
  - `index.tsx`: `registerProviderIcon`, `registerComposerControls(PROVIDER_KIND, (input) =>
standardPlanApprovalControls(input))` from `composerControlBuilders.tsx`, and
    `registerCommitGenDefaults` / `registerTitleGenDefaults` / `registerConflictResolverDefaults`
    with `{ label: "Devin", hint: "SWE-1.6 Fast", model: "swe-1-6-fast", effort: "" }`.
  - `index.test.tsx`: mirror `kimi/index.test.tsx`.
- `src/renderer/components/providers/providerManifest.test.ts`: insert `"devin"` after `"muse"`
  in `EXPECTED_PROVIDER_ORDER`; add a label assertion `"Devin"`.
- `tests/integration/providers-lifecycle.integration.test.ts`: `PREFERRED_MODEL.devin = "swe-1-6-fast"`;
  add a `DialogResponder` if Phase 0 shows a first-run dialog.
- `.agents/docs/agent-adapters.md`: add a row to the Current Providers table:
  `| Devin | swe-1-6-fast, opus/sonnet/gemini/codex aliases (probed via ACP / models list) | (runtime toggle, none via flag) | terminal | Yes (ACP, devin acp) |`.

## 7. i18n

New renderer strings: manifest label `Devin`, the registry description in §5.1, and any new
usage window label (`daily`). Run `pnpm i18n:extract`, fill `msgstr` in all 12 non-English
catalogs under `src/renderer/locales/*/messages.po` (keep `Devin`, `Poracode`, `ACP` literal;
grep the Kimi description entry for terminology), re-run extract and confirm 0 missing per
locale. Supervisor-side user-facing strings (if any) go through `src/shared/messages.ts` plus
`src/renderer/i18n/sharedMessages.ts`.

## 8. Deferred (record as follow-ups, do not build now)

- `sandboxModes` with `--sandbox` and the `autonomous` permission mode (posix only; hide on Windows).
- Cloud handoff attach (`/cloud-attach`) and any `api.devin.ai` integration (different product,
  remote VM execution model).
- Per-session token/cost (`/session-stats`): no machine-readable source.
- ACP registry alias (`createDevinAcpRegistryAdapter`) if an upstream ACP registry entry appears.
- Reasoning-effort picker: revisit if the ACP probe advertises efforts.
- TUI `/usage` scraping as a usage fallback: would need a process-exec capability in the usage host.

## 9. Verification checklist before handoff

1. `pnpm run typecheck`, `pnpm run lint`, `pnpm exec oxfmt --check` on touched files.
2. `pnpm exec vitest run src/supervisor/agents/devin src/supervisor/agents/registry.test.ts src/supervisor/agents/acp/providerIsolation.test.ts src/supervisor/agents/oneShotCapability.test.ts src/renderer/components/providers src/supervisor/runtime/devinCredentials.test.ts packages/agents-usage`.
3. `pnpm i18n:extract` reports 0 missing for all locales.
4. Install: on a machine without Devin, the Settings card installs via the card button and the
   card flips to installed with a version, without a manual refresh.
5. Update: with an older binary, "Update available" appears with the cask version; the update
   runs `devin update`, and the card shows the new version. Repeat with the binary current:
   no update offered.
6. Login: Login button opens the browser flow (ACP path); after completing, the card shows
   authenticated plus name/email/plan if the account parser shipped. Logged-out state shows
   Login again after `devin auth logout` in an external terminal plus a refresh.
7. Logout: Logout button signs out; `devin auth status` in a terminal confirms; the usage rail
   entry disappears (auth-missing) and Login returns.
8. Terminal thread: launch with prompt, status transitions idle → working → needs_approval →
   idle, resume after app restart lands in the same session, attachments resolve.
9. GUI thread: run the `provider-chat-smoke` skill against Devin (turn, steer, Stop, permission
   request, model switch, resume). Confirm Poracode's built-in HTTP MCP servers reach the agent.
10. Usage: rail ring and Settings → Usage row show daily/weekly percentages and reset times
    matching the TUI `/usage` panel; overage shows only when non-zero; Max plan hides daily.
11. WSL (if a Windows host is available): detection, PTY, ACP, login, and update all run through
    `wsl.exe -d <distro> --cd <linuxPath> --exec`.
12. `tests/integration/providers-lifecycle.integration.test.ts` passes on a host with Devin
    installed and authenticated.

## 10. Risks and open questions

- ACP surface details are inferred from the protocol spec, not Devin-specific docs. The
  Phase 0 handshake capture decides `assumedMcpCapabilities`, `acpFsTextCapability`, whether
  `session/load` backs GUI resume, and whether flags before `acp` are honored.
- The usage collector depends on an undocumented endpoint on legacy Windsurf infrastructure.
  It can change or reject CLI tokens at any time; the collector must fail closed to `error`.
- Session-id discovery for the PTY path depends on finding the on-disk store. If it is not
  stable, ship `--continue` fallback first and open a follow-up.
- Background self-update can swap the binary under a running session; monitor for breakage
  after Phase 0.7.
- `devin --version` and `devin auth status` output formats are undocumented; both parsers ship
  with fixtures captured in Phase 0 and must tolerate layout changes by returning `undefined`.
