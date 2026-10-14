# Agent Adapter Rules

How providers plug into Poracode: the isolation rules for shared code, the
`AgentAdapter` contract, and the checklists for adding a provider or a profile.
Per-provider behavior is in [Provider Notes](provider-notes.md); the shared ACP,
MCP, and hook-runtime subsystems are in [Provider Runtime](provider-runtime.md).

## Provider Isolation — Hard Rules

Shared code is code that is not inside a single `src/supervisor/agents/<kind>/` or
`src/renderer/components/providers/<kind>/` folder. It belongs to every provider
equally, so a change made there for one agent is a change made to all of them.

### The test for a violation

Ask: _would this line exist if that one provider did not?_ If not, it does not
belong in shared code. None of these may land in a shared file:

- A provider name in an identifier, string literal, or type — `antigravityBuffer`,
  `if (kind === "codex")`, `isGeminiShell`.
- A constant tuned for one agent's timing or output — an idle timeout, a retry
  count, a truncation width that only one CLI needs.
- A regex or parser for one vendor's payload format.
- A field on a shared state object that only one provider ever reads or writes.
- A conditional whose only purpose is to skip a step for one agent.

A provider name in a _comment_ is fine and often required — it documents the
real-world case that motivated an otherwise unexplainable generic behavior. The
rule is about control flow and data shape.

### The three escape hatches — use one, do not invent a fourth

1. **Declared capability.** The provider states a fact about itself in its
   `DetectionSpec` / `AgentAdapter` (`acpFsTextCapability`, `acpGoalCommands`,
   `acpOptimisticMcpTransports`, `acpClientCapabilitiesMeta`, `baseSpawnEnv`).
   Shared code reads the flag. A structured handle that positions per-turn
   client context itself declares `placesTurnContext` and reads
   `StartTurnOptions.turnContext`; undeclared handles receive that context at the
   front of `inlineInstructions`, except on a prompt whose leading `/token`
   exactly matches a non-skill command the session advertised in
   `slashCommands` — the provider dispatches that command itself, so the runtime
   withholds the context rather than corrupting the command's arguments.
2. **Behavior profile.** Lifecycle differences the transport must honor go in a
   named options object — for ACP, `AcpSessionBehavior`
   (`suppressOutputAfterInterrupt`, `suppressStderrLogging`). Each field is
   documented by the _condition_ it addresses, never the provider that hit it,
   and defaults must be safe for a provider that declares nothing.
3. **Supplied hook.** Parsing or event synthesis for a vendor format lives in the
   provider folder and plugs in through an interface: `AcpTextStreamExtension`
   (agent-text, background-task, and tool-lifecycle quirks),
   `acpSessionUpdateTransform` / `acpExtensionSessionUpdateTransform` (payload
   normalization), `acpExtensionNotificationHandler` (vendor JSON-RPC
   notifications), `permissionRequestTransform` (normalizes vendor
   permission/question requests before shared classification; reply option IDs
   remain transport IDs), `normalizeProbeResult` (discovered capabilities),
   `modelLabel` (fallback labels when the agent supplies no display name), and
   `skillSupport.invocationForSkill` (skill frontmatter rules). Probes whose
   per-model config snapshots are authoritative declare
   `preserveEmptyModelEfforts`: verified models with no effort choices record
   `[]`, while an unprobed model stays absent and eligible for catalog fallback.

Existing extension points built on the same pattern:

- Message payloads declare `turnIndependent: true` when a conversation stream
  publishes messages outside an agent turn. The renderer persists and renders
  them without reopening the agent's work timer. Providers own this
  classification.
- `AcpStructuredSessionOptions.configureOpenedSession` runs provider-owned setup
  after the native open response and options are adopted, before the shared
  launch configuration or first prompt. Its bounded detached response is opaque
  to shared code. Readers and echo-confirmed writes are fenced to one open
  generation and expire when the hook ends. Setup failure rejects the open while
  retaining the allocated session reference for failed-start custody. Absent
  hooks keep the ordinary open path.
- `allowUnlistedSelectValue` admits qualified compound select values: only a
  detached current select and a string rejected by ordinary membership reach
  it. Writer locks, owner checks, and echo confirmation still apply.
- `registerModelDescriptionFormatter` (renderer) lets a provider parse its own
  catalog text into a numeric hint plus a localized explanation; the shared
  picker never parses vendor pricing formats.

If none of the three fits, add a new hook with a capability-shaped name and
document it here — not a branch.

### Extensions own their state

A hook must not add fields to a shared state object. `AcpMapperState` exposes an
opaque `extensionStore`; the extension reaches its own slot through
`getExtensionStore(state, id, create)` and keeps the slot's type private to its
module. Shared code never learns the shape.

### Tests follow the code

A test named after a provider, or one that feeds a vendor-specific payload,
belongs in that provider's suite. Shared suites assert the generic contract with
neutral fixtures — a shared test that only passes because one provider's parser
is attached is a coupling the type system will not catch.

### Enforcement

`src/supervisor/agents/acp/providerIsolation.test.ts` fails the build when a
provider name appears in an identifier, type, regex, comparison literal, or
provider import anywhere under `acp/` or `acp-generic/`. It discovers provider
folders the same way the registry parity test does, so a new provider is covered
once its `detection.ts` lands. Comments and prose strings are ignored;
expressions inside template strings are checked. `AMBIGUOUS_KINDS` excludes kind
names that are also ordinary words (`cursor`); review covers those. The guard
covers only the shared ACP stack; the rule applies to all shared code and the
rest is enforced in review.

### Worked example

Antigravity streams background-task reports as XML/markdown blocks inside
assistant prose and ends turns without terminal `tool_call_update`s. The parser
and behavior profile live in `antigravity/acpTaskNotifications.ts` and
`ANTIGRAVITY_ACP_SESSION_BEHAVIOR`, reaching the shared session through
`createAcpGenericAdapter({ sessionBehavior, textStreamExtension })`. There is no
silence-drain deadline: a turn awaiting background reports waits for the report
or the user's Stop, never for a timeout that could complete it silently.

Its server also holds `session/prompt` unresolved while background tasks run, so
the stop reason arrives only when every task exits — never, for a dev server.
The only boundary it publishes is a stderr diagnostic, so the provider declares
`stderrTurnSignalParser` (`antigravity/acpTurnHold.ts`). The shared session reads
it as a capability — "this agent reports end-of-reply out of band while holding
the prompt" — completes the runtime turn at the signal, keeps still-running
command rows open as detached items for their late updates, and adopts the held
prompt's eventual resolution silently.

The block-shape primitives in `src/shared/taskNotificationText.ts` predate this
rule and are shared with the renderer's transcript rendering; they are a known
exception, not a license to add vendor formats there.

## Adapter Contract

Every agent implements `AgentAdapter` (`src/supervisor/agents/base.ts`).

### Required

- `kind` / `label` — provider identifier and display name.
- `capabilities` — models, efforts, modes, approval policies, sandbox modes,
  resume/direct-input support, live input mode (terminal | server), presentation
  mode (terminal | gui).
- `spawnEnv?` — `{ native?, wsl? }` env merged into the PTY spawn for one
  location (e.g. `BROWSER=/bin/true` under WSL for OAuth providers). Env that
  must ride every spawn belongs in `baseSpawnEnv`.
- `baseSpawnEnv?` — env applied to every Poracode-made spawn of the CLI in every
  lane (detection probes, terminal login, PTY launch, ACP session/auth/logout,
  one-shots, context extraction, subagent children), merged under lane-specific
  env. Declare it once on the `DetectionSpec` and re-expose it with
  `...inheritBaseSpawnEnv(spec)` so the two cannot drift; shared runtime fans it
  out, so never repeat it per command builder. It is deliberately not applied to
  `update` commands, so the user-driven update still reaches the CLI's own
  updater. Under WSL the shared merge only sets spawn-level env; env that must
  reach the distro is baked into the wsl.exe login-shell script by the command
  builder (`buildAgentCommand` does this) — pass the same map reference there.
- `detectInstall(ctx?)` — usually `return detectAgentInstall(ctx, spec)`. Declare
  a `DetectionSpec` (binary, capabilities, versionArgs?, authProbes?,
  capabilitiesProbe?, baseSpawnEnv?) and let the engine own WSL vs native
  probing, binary resolution, version, and auth/capability merge.
- `buildLaunchArgv()` / `buildResumeArgv()` — return an `AgentArgvSpec`
  (`{ binary, args, env?, sessionRef? }`). The runtime wraps it through
  `resolveLaunchSpec`, which owns WSL login-shell, Windows PowerShell encoding,
  and env injection. Adapters never call `buildAgentCommand` on the main launch
  path; the contract is argv-only.
- `createInitialSessionRef()` — a session ID for first launch, or `undefined`
  when the CLI generates its own.

### Optional

- Terminal heuristics: `isReadyForInitialPrompt?(text)`,
  `detectTerminalStatus?(text)` (derives `ThreadStatus` + `ThreadAttention` from
  an 8192-char ANSI-stripped rolling window), `detectInvalidSessionRef?(text)`,
  `detectAutoResponse?(text)` (input that auto-dismisses known TUI prompts),
  `discoverSessionRef?(location)` (poll the CLI for its session ID after spawn),
  `syncConfigFromTerminalState?(input)` (reconcile config when the TUI changes
  state, e.g. leaving plan mode).
- Structured sessions: `createStructuredSession?(input)` starts a
  server-controlled session and is what enables `"gui"` presentation.
- Input: `buildDirectInput?(prompt)` splits a prompt into terminal-safe chunks
  with delays for TUI pasting.
- Commit/one-shot generation: `defaultOneShotModel?`,
  `buildOneShotCommand?(model, effort?)` (piped-stdin generation).
- Session import: `sessionImport?: SessionImportSource`
  (`base/sessionImport.ts`) declares existing CLI transcripts the user can import
  from Settings → Import — transcript `roots`, an `acceptFile` filter,
  `summarize` (id, cwd, model, first prompt from the bounded `headLines()` /
  `tailLines()` readers), optional `readTitles`, and `readTranscript`. Identity
  must be the id the provider's own resume uses; profiles declare their own
  store. The shared `src/supervisor/sessionImport/` scanner owns enumeration,
  bounds, the mtime/size summary cache, and request supersession; it reads only
  inside declared roots, writes nothing to provider homes, and replays text
  through `thread-runtime-events`. Imported threads are created `inactive` with
  a `sessionRef`, so opening one resumes through the normal reopen path. The
  import procedures are desktop-local (not remote-routable) and the scan cache is
  in-memory.

### Provider folder layout

Every provider is a folder under `src/supervisor/agents/<kind>/` with the same
layout, so two folders side by side show what differs by file name alone:

- `index.ts` — composes the adapter; holds closure state (capabilities,
  pre-spawn snapshots).
- `argv.ts` — `build<Kind>Args` and argv helpers.
- `detection.ts` — `DetectionSpec`, default capabilities, auth/capability probes.
- `terminal.ts` — hint table, `detect<Kind>TerminalStatus`, related parsers.
- `session.ts` — optional session ID discovery, rollout scanning, watch paths.
- `acp.ts` — optional structured-session / ACP wiring.
- `*.test.ts` — colocated.

## Plugin Architecture

Each provider is a self-contained plugin; no provider-specific `if/else` lands in
shared runtime, UI, or layout code.

- **Supervisor:** all provider logic (heuristics, commands, detection, parsing)
  lives in the adapter folder. `SupervisorRuntime` calls adapter methods
  generically. The factory list in `src/supervisor/agents/registry.ts` is
  explicit and guarded by a directory-parity test.
- **Renderer:** each provider has `src/renderer/components/providers/<kind>/`
  with a lightweight `manifest.ts` (localized label, ordering) and an
  `index.tsx` that registers its UI: `registerProviderIcon`,
  `registerComposerControls`, `registerCommitGenDefaults` /
  `registerTitleGenDefaults` / `registerConflictResolverDefaults`.
  `providerManifest.ts` eagerly discovers manifests; `bootstrap.ts` separately
  discovers the UI modules and is loaded explicitly by the renderer entry. The
  providers barrel does not bootstrap, which keeps utility imports and Node
  tests free of provider TSX side effects. Do not add provider barrel exports or
  shared model/utility ordering arrays.
- **Shared renderer provider modules** (import these leaf modules directly; they
  stay side-effect-free until a provider registers): `ProviderIcon.tsx` (icon
  registry + lookup), `StatusIcon.tsx`, `statusTone.ts`, `providerComposer.ts`
  (composer controls and config normalizers), `providerSlashCommands.ts` (GUI
  slash commands), `utilityTask.ts` (utility-task ranking and registry), and the
  feature-owned `commitGen.ts`, `titleGen.ts`, `conflictResolver.ts`.
- **Native install metadata** stays an explicit renderer registry
  (`agentRegistryNative.ts`).

## Capability-Based UI

The UI shows only controls the agent's `capabilities` declare. Do not render
controls for features a CLI cannot support (no effort selector where the
provider has no efforts, no sandbox modes where it has none).

## WSL Routing

- WSL projects are detected via `ProjectLocation.kind === "wsl"`.
- Agent commands are wrapped:
  `wsl.exe -d <distro> --cd <linuxPath> --exec <command>`.
- `batchWslCommandsAsync()` combines commands into one `wsl.exe` invocation;
  each spawn costs roughly a second.
- `resolveWslShellPath` is cached per distro and falls back to `/bin/bash`
  (not `/bin/sh`) so rc files — nvm/fnm/asdf — are still sourced.
- Install detection runs per environment (Windows and each active WSL distro
  independently).

## Adding a New Provider — Full Checklist

A provider spans a supervisor adapter and a renderer plugin. Renderer metadata
is discovered automatically; the supervisor registry is explicit, with a parity
test that fails when a `detection.ts` has no registered factory. Items marked
**often missed** are the ones that silently break a feature.

### 1. Supervisor adapter — `src/supervisor/agents/<kind>/`

- `detection.ts` — `DetectionSpec`: `kind`, `label`, `binary`, `capabilities`
  (models, modes, approvalPolicies, `defaultApprovalPolicy`,
  `bypassPermissions`), `versionArgs`.
  - **Often missed — `update`:** set `builtIn` for a CLI self-updater
    (`x update`) and `npm: "<pkg>"` when the CLI ships on npm. `npm` powers the
    registry "outdated?" badge (`getNpmPackageNameForUpdate`) and the fallback
    when the built-in updater fails; `builtIn` alone means no version detection.
  - **Often missed — auth:** `loginCommand` alone is inert; the Login button
    renders only when `status.authMethods` is non-empty. For a non-ACP CLI, add
    a cheap `capabilitiesProbe` returning
    `{ authMethods: [{ id, name: "Login", type: "terminal" }] }` when installed
    (`type: "terminal"` routes to `runTerminalLogin` → `loginCommand`). Pair it
    with an `authProbes` entry that reads the credential artifact the login
    writes (a token, an `auth.json` with a key), not config-dir presence — the
    per-user dir is usually created on first run, so keying off it reports
    "Signed in" for a user who never signed in. Return `authenticated` when the
    credential exists, else `missing`. Providers that only authenticate on first
    TUI launch may skip this.
  - **Often missed — `baseSpawnEnv`:** if the CLI runs a background
    self-updater (or another opt-out-able side effect) on spawn, declare the
    opt-out env once here.
- `argv.ts` — `build<Kind>Args(config, prompt, …)`. Map
  `config.mode`/`approvalPolicy`/`sandboxMode` to flags and pass a
  trust/skip-prompt flag so the PTY never blocks.
- `terminal.ts` — `detect<Kind>TerminalStatus` hint table
  (working/needs_approval/idle).
- `session.ts` — credential-file auth probe and invalid-session regex;
  session-id discovery only if the CLI exposes stable ids (otherwise resume via
  `--continue`/`--last` with a synthetic `sessionRef` minted in
  `buildLaunchArgv`).
- `index.ts` — `create<Kind>Adapter()`: `buildLaunchArgv`/`buildResumeArgv`,
  `buildDirectInput`, `formatPromptSegments`, `detectTerminalStatus`,
  `detectInvalidSessionRef`, `defaultOneShotModel` + `buildOneShotCommand`,
  `spawnEnv`, and `...inheritBaseSpawnEnv(spec)` when the spec declares
  `baseSpawnEnv` (never re-declare the literal).
  - **Often missed:** re-expose `update` on the adapter:
    `...(spec.update ? { update: spec.update } : {})`. The registry card's
    latest-version probe (`getLatestVersionForAdapter`) reads `adapter.update`
    only, so without this a not-installed card shows no version.
- `<kind>.test.ts` — argv, adapter shape, terminal heuristics, detection/auth.

### 2. Supervisor registry

- `src/supervisor/agents/registry.ts` — import the factory and add it to
  `builtIns`.
- `src/supervisor/agents/registry.test.ts` — keep the built-in order assertion
  current. Directory parity, unique kinds, and identity fields are checked
  automatically.

### 3. Renderer provider — `src/renderer/components/providers/<kind>/`

- `<Kind>Icon.tsx` — `createProviderIcon({ cssPrefix, path, viewBox })`.
- `manifest.ts` — a `RendererProviderManifest` with the canonical `kind`,
  localized `label`, discovery/model-picker `order`, and optional
  `utilityOrder`.
- `index.tsx` — use the manifest's `kind` for `registerProviderIcon`,
  `registerComposerControls` (plan/work toggle + approval control), and the
  commit/title/conflict-resolver defaults if the provider should appear in
  "auto" utility-task selection.
- A new or changed manifest label needs `pnpm i18n:extract` and translations in
  every catalog ([i18n](i18n.md)).

### 4. Renderer native install registration

- **Often missed:** add a `NATIVE_AGENT_REGISTRY_ENTRIES` entry in
  `src/renderer/views/SettingsOverlay/parts/agentRegistryNative.ts`
  (per-platform install command, `docsUrl`, any ACP registry aliases). Without
  it there is no in-app install. Browser-MCP scope belongs in the supervisor
  `DetectionSpec`, not a renderer map.

### 5. Tests and verification

- `tests/integration/providers-lifecycle.integration.test.ts` — add a
  `PREFERRED_MODEL` entry, or use its detected-model fallback when no model is
  universally available (the test skips when the CLI is not installed).
- Run `pnpm run typecheck`, `pnpm run lint`, targeted `pnpm exec vitest run`, and
  `pnpm exec oxfmt --check <changed paths>`.

### Capability-specific

- ACP/structured GUI session → `createStructuredSession` +
  `buildAcpAuthCommand`/`buildAcpLogoutCommand` (see Grok, Copilot, Cursor).
- ACP lifecycle quirks → a `sessionBehavior` (`AcpSessionBehavior`), an
  `AcpTextStreamExtension`, or (for agents that hold `session/prompt` open
  during detached background work) a `stderrTurnSignalParser`, all from the
  provider folder. See
  [Provider Isolation — Hard Rules](#provider-isolation--hard-rules).
- L1 hook plugin → `pluginId`/`installPlugin`/`pluginLaunchExtras` plus a
  `plugin/` dir containing `plugin.json` and exactly one staged runtime
  (`forward.mjs`, or OpenCode's `poracode-status.mjs`). Packaging discovers
  these automatically; `prepareAgentPlugins.test.ts` pins the provider set and
  staged asset shape. Hook Node resolution:
  [Provider Runtime](provider-runtime.md#hook-runtime-resolution).
- OSC status (title spinner / iTerm2 progress) → `handleOscTitle` /
  `handleOscNotification` (see Grok). Only when the CLI actually emits OSC.
- Skills → `skillSupport` with `roots` and a default `invocation`. When some
  skills cannot take that form, supply `skillSupport.invocationForSkill`; the
  skill scan passes it each SKILL.md's scalar frontmatter and records the
  returned form (see Claude: `user-invocable: false` skills keep the request
  form). The supervisor reapplies the rule to every incoming skill segment, so
  an older paired client still sends a valid form.

Reference template for a TUI-only, non-ACP CLI: `commandcode/` (multi-model, npm
install/update, synthesized terminal Login method).

## Giving a Provider Multiple Profiles

A profile is a second account or configuration of an existing built-in provider
(a second Claude account, a Cursor key for another org). Each profile is an
`AgentInstanceConfig` whose `driver` is the provider id; it surfaces as the
instance-scoped kind `<driver>:<instanceId>` with its own adapter, sidebar
entry, model-picker group, and settings page.

Generic code already handles profiles (sealing settings writer,
`createProfile` / `setProfileEnvironment` IPC, sidebar nesting, instance badge,
profile list UI, `removeAgentInstance` cleanup). Adding profiles is four
declarations:

- **Register the driver** — add `{ driver: "<id>" }` (plus `credentialEnvVar`
  when the provider authenticates with a single secret) to
  `AGENT_PROFILE_DRIVERS` in `src/shared/contracts/agentProfiles.ts`.
- **Supervisor adapter factory** — export `create<Provider>ProfileAdapter(instance)`
  and add it to `profileAdapterFactories` in `src/supervisor/agents/registry.ts`.
  Build it from the normal factory with an overridden `kind`/`label` and the
  profile's credential in `baseSpawnEnv`, so probes and every launch lane use it
  (see `cursor/index.ts`). Throw when the profile is unusable; the registry
  skips it with a warning.
- **Profile descriptor** — set `profiles: <provider>ProfileSupport` on the
  provider's `NATIVE_AGENT_REGISTRY_ENTRIES` entry. It supplies only what
  differs: the extra add-form field, row subtitle component, removal-consequence
  copy, and `createPayload`. Optional `onCreated` pins provider settings that
  must exist before the first detection pass. A per-profile unique default (a
  config/home directory) comes from the allocated id passed to
  `field.placeholderFor(name, id)`, never from the name — distinct names can
  slugify alike, and a shared home shares credentials.
- **Profile page** — the provider's `settingsPanel` already receives
  instance-scoped kinds; branch on your own
  `extract<Provider>ProfileInstanceId(agentKind)` to render the per-profile
  editor.

Do not add per-provider profile branches to `mergeManagedSharedSettings`,
`ProviderIcon`, `SettingsSidebar`, `SingleAgentSettings`, or the IPC surface.
Reference implementations: `cursor` (single sealed credential), `claude`
(free-form environment plus an opaque per-profile `config`), `codex` (per-profile
`CODEX_HOME` with its own hook overlay, skill root, native-plugin discovery, and
pooled app-server).
