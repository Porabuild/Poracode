# Agent Adapter Rules

## Provider Isolation — Hard Rules

Shared code is code that is not inside a single `src/supervisor/agents/<kind>/` or
`src/renderer/components/providers/<kind>/` folder. It belongs to every provider
equally, so a change made there for one agent is a change made to all of them.

### The test for a violation

Ask: _would this line exist if that one provider did not?_ If the answer is no,
it does not belong in shared code. Concretely, none of these may land in a shared
file:

- A provider name in an identifier, string literal, or type — `antigravityBuffer`,
  `if (kind === "codex")`, `isGeminiShell`.
- A constant tuned for one agent's timing or output — an idle timeout, a retry
  count, a truncation width that only one CLI needs.
- A regex or parser for one vendor's payload format.
- A field on a shared state object that only one provider ever reads or writes.
- A conditional whose only purpose is to skip a step for one agent.

A provider name in a _comment_ is fine and often required — it documents the
real-world case that motivated an otherwise unexplainable generic behavior. The
rule is about control flow and data shape, not about erasing history.

### The three escape hatches — use one, do not invent a fourth

1. **Declared capability.** The provider states a fact about itself in its
   `DetectionSpec` / `AgentAdapter` (`acpFsTextCapability`, `acpGoalCommands`,
   `acpOptimisticMcpTransports`, `baseSpawnEnv`). Shared code reads the flag.
2. **Behavior profile.** Lifecycle differences the transport must honor go in a
   named options object — for ACP, `AcpSessionBehavior`
   (`suppressOutputAfterInterrupt`, `suppressStderrLogging`). Each field is
   documented in terms of the _condition_ it addresses, never the provider that
   hit it, and defaults must be safe for a provider that declares nothing.
3. **Supplied hook.** Parsing or event synthesis for a vendor format lives in the
   provider folder and plugs in through an interface: `AcpTextStreamExtension`
   (agent-text and background-task quirks), `acpSessionUpdateTransform` /
   `acpExtensionSessionUpdateTransform` (payload normalization),
   `acpExtensionNotificationHandler` (vendor JSON-RPC notifications).

If none of the three fits, the right move is to add a new hook with a
capability-shaped name and document it here — not to add a branch.

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

`acp/providerIsolation.test.ts` fails the build when a provider name appears in
an identifier, type, or regex anywhere under `acp/` or `acp-generic/`. It
discovers provider folders the same way the registry parity test does, so a new
provider is covered the moment its `detection.ts` lands. Comments and string
literals are exempt — shared code legitimately documents the case it was written
for and matches vendor wire text.

Two escape valves, both deliberately uncomfortable:

- `AMBIGUOUS_KINDS` — kind names that are also ordinary words (`cursor`), where a
  segment match proves nothing. Review covers these.
- `KNOWN_EXCEPTIONS` — provider knowledge that predates the boundary, each entry
  carrying the reason and the intended fix. The list may only shrink: a stale
  entry fails the test exactly like a new violation, so paying the debt is what
  removes it.

The guard covers the shared ACP stack, which is where the pressure is highest.
The rule applies to all shared code; the rest is on review.

### Worked example

Antigravity streams background-task reports as XML/markdown blocks inside
assistant prose, and ends turns without terminal `tool_call_update`s. Both were
once shared: a 607-line parser in `acp/canonicalMapping/`, two Antigravity-shaped
fields on `AcpMapperState`, plus a hardcoded silence-drain deadline in
`acp/session.ts`. The parser and behavior profile now live in
`antigravity/acpTaskNotifications.ts` and `ANTIGRAVITY_ACP_SESSION_BEHAVIOR`,
reaching the shared session through
`createAcpGenericAdapter({ sessionBehavior, textStreamExtension })`; the drain
deadline was removed outright — a turn awaiting background reports waits for
the report or the user's Stop, never for a silence timeout that could complete
it silently. Shared ACP code no longer knows the provider exists; every other
ACP agent streams assistant text untouched.

Antigravity's server also holds `session/prompt` unresolved while background
tasks run (`STATE_WAITING_FOR_TASKS`): the model's reply is finished, but the
stop reason only arrives when every task exits — never, for a dev server. The
only boundary the server publishes is a glog diagnostic on stderr, so the
provider declares `stderrTurnSignalParser` (`antigravity/acpTurnHold.ts`)
through the same options object. The shared session reads it as a capability —
"this agent reports end-of-reply out of band while holding the prompt" —
completes the runtime turn at the signal, keeps the still-running command rows
open as detached items for their late terminal updates, and adopts the held
prompt's eventual resolution silently. (The block-shape primitives in
`src/shared/taskNotificationText.ts` predate this rule and are shared with the
renderer's transcript rendering; they are a known exception, not a license to
add vendor formats there.)

## Adapter Contract

Every supported agent implements the `AgentAdapter` interface (`src/supervisor/agents/base.ts`):

### Required

- `kind` / `label` — Provider identifier and display name.
- `capabilities` — Declares models, efforts, modes, approval policies, sandbox modes, resume/direct-input support, live input mode (terminal | server), presentation mode (terminal | gui).
- `spawnEnv?` — Optional `{ native?, wsl? }` env records the runtime merges into the PTY spawn (e.g. `BROWSER=/bin/true` under WSL for OAuth-flow providers). Location-specific only — env that must ride EVERY spawn of the CLI belongs in `baseSpawnEnv` instead.
- `baseSpawnEnv?` — Env applied to every Poracode-made spawn of this CLI in every lane (detection probes, terminal login, PTY launch, ACP session/auth/logout, one-shots, context extraction, subagent children), merged UNDER lane-specific env. Declare it once on the `DetectionSpec`; the adapter re-exposes it via `...inheritBaseSpawnEnv(spec)` so the two can never drift. Shared runtime fans it out — never repeat it per command builder. Deliberately NOT applied to `update` commands so the user-driven "update agent" action still reaches the CLI's own updater. WSL caveat: the shared merge sets spawn-level env; env that must reach the distro still has to be baked into the wsl.exe login-shell script by the command builder (`buildAgentCommand` does this) — keep the same map reference there, as factory does.
- `detectInstall(ctx?)` — Typically one line: `return detectAgentInstall(ctx, spec)`. Declare a `DetectionSpec` (binary, capabilities, versionArgs?, authProbes?, capabilitiesProbe?, baseSpawnEnv?) and let the engine own the WSL vs native probe + binary resolution + version + auth/capability merge.
- `buildLaunchArgv()` / `buildResumeArgv()` — Return an `AgentArgvSpec` (`{ binary, args, env?, sessionRef? }`). The runtime wraps it through `resolveLaunchSpec` which owns WSL login-shell, Windows PowerShell encoding, and env injection. **Adapters must never call `buildAgentCommand` on the main launch path** — the contract is structurally argv-only.
- `createInitialSessionRef()` — Generate a session ID on first launch (or `undefined` if the CLI generates its own).

### Optional — Terminal Heuristics

- `isReadyForInitialPrompt?(text)` — True when the TUI is ready to receive the first user prompt.
- `detectTerminalStatus?(text)` — Derive `ThreadStatus` + `ThreadAttention` from rolling terminal output (8192-char window, ANSI-stripped).
- `detectInvalidSessionRef?(text)` — True if the CLI reports a stale/invalid session ID.
- `detectAutoResponse?(text)` — Returns input string to auto-dismiss known TUI prompts (e.g. rate-limit).
- `discoverSessionRef?(location)` — Poll the CLI for its session ID after spawn (e.g. `gemini --list-sessions`).
- `syncConfigFromTerminalState?(input)` — Reconcile config when the TUI changes state (e.g. Claude plan-mode exit clears mode flag).

### Optional — Structured Sessions

- `createStructuredSession?(input)` — Start a server-controlled session (for example Codex app-server JSON-RPC over stdio for GUI presentation).

### Optional — Input

- `buildDirectInput?(prompt)` — Split a prompt into terminal-safe chunks with delays for TUI pasting.

### Optional — Commit Generation

- `defaultOneShotModel?` — Default model for one-shot CLI calls (commit messages).
- `buildOneShotCommand?(model, effort?)` — CLI command for piped-stdin generation.

## Current Providers

Every provider is a folder under `src/supervisor/agents/<kind>/` with the same internal layout:

- `index.ts` — composes the adapter; holds closure state (capabilities, pre-spawn snapshots).
- `argv.ts` — `buildXxxArgs` and any argv helpers.
- `detection.ts` — `DetectionSpec`, default capabilities, auth/capability probes.
- `terminal.ts` — hint table + `detectXxxTerminalStatus` + related parsers.
- `session.ts` — (optional) session ID discovery, rollout scanning, watch-path resolution.
- `acp.ts` — (optional) structured-session / ACP wiring.
- `*.test.ts` — colocated.

Opening two provider folders side-by-side answers "what does this provider do differently" by file-name alignment alone.

Model/effort lists below are the **statically declared defaults**. Several providers ship `models: []` / `efforts: []` and fill them at runtime from a capabilities probe (Codex/Gemini/Copilot/Grok/OpenCode/Pi, and Cursor via its CLI `--list-models`) — the listed values are illustrative, not authoritative. Read the provider's `detection.ts` for the live source of truth.

The **Structured Session** column reflects whether the adapter implements `createStructuredSession` (i.e. supports a `"gui"` presentation mode); it is not a model-list default and is authoritative.

| Provider     | Models                                                                   | Efforts                                  | Live Input            | Structured Session                 |
| ------------ | ------------------------------------------------------------------------ | ---------------------------------------- | --------------------- | ---------------------------------- |
| Claude       | opus-4-8, fable-5, opus-4-7, opus-4-6, sonnet, haiku                     | low, medium, high, xHigh, max, ultracode | terminal              | Yes (SDK)                          |
| Codex        | (probed dynamically via app-server)                                      | (probed dynamically)                     | terminal / GUI server | Yes (stdio app-server)             |
| Gemini       | (probed dynamically via ACP)                                             | (probed dynamically)                     | terminal              | Yes (ACP)                          |
| Copilot      | (probed via ACP)                                                         | (probed via ACP)                         | terminal              | Yes (ACP)                          |
| Cursor       | auto, composer-\*, GPT/Opus/Sonnet variants (probed via `--list-models`) | (embedded in model name)                 | terminal              | Yes (ACP)                          |
| Grok         | grok-build (probed via ACP)                                              | (none)                                   | terminal              | Yes (ACP)                          |
| OpenCode     | (probed dynamically via SDK)                                             | (probed dynamically)                     | terminal / GUI server | Yes (SDK server)                   |
| Pi           | (authenticated models probed via SDK)                                    | off…max, per model                       | terminal              | Yes (native SDK)                   |
| Antigravity  | auto (`agy` CLI) / ACP registry probe for Chat                           | ACP registry probe                       | terminal / GUI server | Yes (official `antigravity-acp`)   |
| Command Code | Kimi/Claude/GPT/Gemini/GLM/… (static, `--list-models`)                   | (none)                                   | terminal              | No                                 |
| Muse Code    | muse-spark-1.2 / 1.1 / 1.2-contributor                                   | none…ultra                               | terminal              | No (no ACP mode yet; GUI deferred) |

Antigravity is one built-in agent and one registry card with two managed runtime
prerequisites: `agy` backs Terminal, while the official `antigravity-acp` registry
artifact backs Chat. Install reconciles whichever prerequisite is missing; the
registry alias is not exposed as a second provider (a pre-adoption
`installKind: "generic"` install keeps its own registry card so it stays
updatable and removable). When detection finds the CLI
in an environment where the artifact is missing, the supervisor installs it for
that environment in the background (once per environment per session), so chat
works without a manual second install. Removing the artifact records an opt-out
in `acpRegistryAutoInstallOptOuts`, so a deliberate removal is never undone; the
next explicit install clears it. Composer, registry-card, and
provider-settings update surfaces compare both installed versions with their
independent latest sources, then one action updates whichever runtimes are stale.

### ACP session ownership

Poracode's persisted threads are the sole conversation list and source of truth.
Do not call or expose provider-native ACP `session/list`, and do not import a
provider's independent conversation history, even when the agent advertises the
capability. This is an intentional product boundary, not missing provider support.

ACP `session/resume` and legacy `session/load` are used only with a provider
session ID already associated with a Poracode thread. Provider detection may
advertise resume support, but it must not turn provider session discovery into a
second thread index.

## Adding a New Provider — Full Checklist

A provider is split across a supervisor adapter and a renderer plugin. Lightweight
renderer metadata is discovered automatically; the supervisor registry remains
explicit, with a parity test that discovers every adjacent `detection.ts` and fails
when a factory is omitted. Work this list top to bottom; the ⚠️ items are the ones
most often forgotten.

### 1. Supervisor adapter — `src/supervisor/agents/<kind>/`

- [ ] `detection.ts` — `DetectionSpec`: `kind`, `label`, `binary`, `capabilities`
      (models, modes, approvalPolicies, `defaultApprovalPolicy`, `bypassPermissions`),
      `versionArgs`.
  - [ ] ⚠️ `update` — set **`builtIn`** for a CLI self-updater (`x update`) **and**
        `npm: "<pkg>"` when the CLI ships on npm. `npm` is what powers the registry
        "outdated?" badge (`getNpmPackageNameForUpdate`) **and** the auto-fallback
        when the built-in updater fails. `builtIn`-only ⇒ no version detection.
  - [ ] ⚠️ Auth — set `loginCommand` (e.g. `"x login"`) **and** advertise a login
        method, or the Login button never renders. `loginCommand` alone is inert:
        the Settings button only shows when `status.authMethods` is non-empty. For a
        non-ACP CLI, add a cheap `capabilitiesProbe` that returns
        `{ authMethods: [{ id, name: "Login", type: "terminal" }] }` when installed
        (the renderer routes `type: "terminal"` → `runTerminalLogin` → `loginCommand`).
        Pair it with an `authProbes` entry that reads the actual **credential
        artifact** the login writes (e.g. a token / `auth.json` with an API key),
        **not** mere config-dir presence: the per-user dir (`~/.x`) is usually
        created on first run, so keying off it falsely reports "Signed in" /
        "Re-login" for a never-signed-in user (and the inverse if you then drop
        the probe). Return `authenticated` when the credential exists, else
        `missing`. (Providers that only auth on first TUI launch may skip this.)
  - [ ] ⚠️ `baseSpawnEnv` — if the CLI runs a background self-updater (or other
        opt-out-able side effect) on spawn, declare the opt-out env ONCE here.
        Shared runtime applies it to every spawn lane except the explicit
        `update` command; never repeat it per command builder. Re-expose it on
        the adapter via `...inheritBaseSpawnEnv(spec)` (see the `index.ts` item).
- [ ] `argv.ts` — `build<Kind>Args(config, prompt, …)`. Map `config.mode`/`approvalPolicy`/
      `sandboxMode` to flags. Pass a trust/skip-prompt flag so the PTY never blocks.
- [ ] `terminal.ts` — `detect<Kind>TerminalStatus` hint table (working/needs_approval/idle).
- [ ] `session.ts` — credential-file auth probe + invalid-session regex; session-id
      discovery/watch **only if** the CLI exposes stable ids (else resume via
      `--continue`/`--last` with a synthetic `sessionRef` minted in `buildLaunchArgv`).
- [ ] `index.ts` — `create<Kind>Adapter()`: `buildLaunchArgv`/`buildResumeArgv`,
      `buildDirectInput`, `formatPromptSegments`, `detectTerminalStatus`,
      `detectInvalidSessionRef`, `defaultOneShotModel` + `buildOneShotCommand`,
      `spawnEnv` (`BROWSER=/bin/true` under WSL for OAuth providers), and
      `...inheritBaseSpawnEnv(spec)` when the spec declares `baseSpawnEnv`
      (derive it — never re-declare the literal on the adapter).
  - [ ] ⚠️ Re-expose `update` on the returned adapter object:
        `...(spec.update ? { update: spec.update } : {})`. The shared updater reads
        `status.update ?? adapter.update`, but the registry card's latest-version
        probe (`getLatestVersionForAdapter`) reads **`adapter.update` only** — omit
        this and a not-installed card shows no version even though the spec has `npm`.
- [ ] `<kind>.test.ts` — argv, adapter shape, terminal heuristics, detection/auth.

### 2. Supervisor registry

- [ ] `src/supervisor/agents/registry.ts` — import the factory + add it to `builtIns`.
- [ ] `src/supervisor/agents/registry.test.ts` — keep the intentional built-in order
      assertion current. Directory parity, unique kinds, and populated identity
      fields are checked automatically.

### 3. Renderer provider — `src/renderer/components/providers/<kind>/`

- [ ] `<Kind>Icon.tsx` — `createProviderIcon({ cssPrefix, path, viewBox })`.
- [ ] `manifest.ts` — export a lightweight `RendererProviderManifest` with the
      canonical `kind`, localized `label`, discovery/model-picker `order`, and an
      optional `utilityOrder` override. Manifests are discovered automatically;
      do not add shared provider-order arrays.
- [ ] `index.tsx` — import the manifest and use its `kind` for
      `registerProviderIcon`, `registerComposerControls` (plan/work toggle +
      approval control), and
      `registerCommitGenDefaults` / `registerTitleGenDefaults` /
      `registerConflictResolverDefaults` if the provider should appear in "auto"
      utility-task selection. The renderer bootstrap discovers `index.tsx`
      automatically; no provider-barrel export is needed.
- [ ] If `manifest.ts` adds or changes its user-facing label, run
      `pnpm i18n:extract` and translate it in all 12 non-English catalogs.

### 4. Renderer native install registration

- [ ] ⚠️ `…/SettingsOverlay/parts/agentRegistryNative.ts` — add a
      `NATIVE_AGENT_REGISTRY_ENTRIES` entry (per-platform install command +
      `docsUrl`, plus any ACP registry aliases). Without this there is **no in-app
      install** for the provider. Browser-MCP scope belongs in the supervisor
      `DetectionSpec` capability instead of a renderer provider map.

### 5. Tests & verification

- [ ] `tests/integration/providers-lifecycle.integration.test.ts` — add a
      `PREFERRED_MODEL` entry, or explicitly use its detected-model fallback when
      the provider has no universally available model (auto-skips when the CLI is
      not installed).
- [ ] Run green: `pnpm run typecheck`, `pnpm run lint`, targeted `pnpm exec vitest run`,
      and `pnpm exec oxfmt --check <changed paths>`.

### Capability-specific (only when the provider supports it)

- [ ] ACP/structured GUI session → `createStructuredSession` + `buildAcpAuthCommand`/
      `buildAcpLogoutCommand` (see Grok/Copilot/Cursor).
- [ ] ACP lifecycle quirks → declare a `sessionBehavior` (`AcpSessionBehavior`),
      supply an `AcpTextStreamExtension`, or (for agents that hold
      `session/prompt` open during detached background work) a
      `stderrTurnSignalParser` from the provider folder; never branch in shared
      ACP code. See
      [Provider Isolation — Hard Rules](#provider-isolation--hard-rules).
- [ ] L1 hook plugin → `pluginId`/`installPlugin`/`pluginLaunchExtras` + a
      `plugin/` dir containing `plugin.json` and exactly one staged runtime
      (`forward.mjs` or OpenCode's `poracode-status.mjs`). Packaging discovers
      these directories automatically; `prepareAgentPlugins.test.ts` pins the
      current provider set and staged asset shape.
- [ ] OSC status (title spinner / iTerm2 progress) → `handleOscTitle`/
      `handleOscNotification` (see Grok). Only wire when the CLI actually emits OSC.

> Reference template for a **TUI-only, no-ACP, no-plugin** CLI: `commandcode/`
> (multi-model + npm install/update + a synthesized terminal Login method).

## Giving a Provider Multiple Profiles

A **profile** is a second account or configuration of a provider that already
exists as a built-in agent (a second Claude account, a Cursor key for another
org). Each profile is an `AgentInstanceConfig` whose `driver` is the provider
id; it surfaces as the instance-scoped agent kind `<driver>:<instanceId>` and
gets its own adapter, sidebar entry, model-picker group, and settings page.

Everything generic already handles profiles — the sealing settings writer, the
`createProfile` / `setProfileEnvironment` IPC, the sidebar nesting, the instance
badge on the provider icon, the profile list UI, and `removeAgentInstance`'s
cleanup of profile-scoped settings. Adding profiles to a provider is four
declarations, none of which is a new branch in shared code:

- [ ] **Register the driver** — add `{ driver: "<id>" }` (plus
      `credentialEnvVar` when the provider authenticates with a single secret)
      to `AGENT_PROFILE_DRIVERS` in `src/shared/contracts/agentProfiles.ts`.
      This is what makes shared code treat `<id>:<instance>` kinds as profiles.
- [ ] **Supervisor adapter factory** — export `create<Provider>ProfileAdapter(instance)`
      from the provider's module and add it to `profileAdapterFactories` in
      `src/supervisor/agents/registry.ts`. Build it from your normal adapter
      factory with an overridden `kind`/`label` and the profile's credential in
      `baseSpawnEnv`, so detection probes and every launch lane use that
      credential (see `cursor/index.ts`). Throw when the profile is unusable:
      the registry skips it with a warning instead of failing.
- [ ] **Profile descriptor** — set `profiles: <provider>ProfileSupport` on the
      provider's `NATIVE_AGENT_REGISTRY_ENTRIES` entry. The descriptor supplies
      only what differs: the one extra add-form field, the row subtitle
      component, the removal-consequence copy, and `createPayload`. Optional
      `onCreated` pins provider settings that must exist before the first
      detection pass (Cursor pins its GUI runtime there).
- [ ] **Profile page** — the provider's `settingsPanel` already receives
      instance-scoped kinds; branch on your own
      `extract<Provider>ProfileInstanceId(agentKind)` to render the per-profile
      editor instead of the base page.

Do NOT add per-provider profile branches to `mergeManagedSharedSettings`,
`ProviderIcon`, `SettingsSidebar`, `SingleAgentSettings`, or the IPC surface —
they are all driven by the registry above. Reference implementations:
`cursor` (single sealed credential) and `claude` (free-form environment plus an
opaque per-profile `config`).

## Plugin Architecture

The codebase is provider-agnostic by design (targeting 5-10 providers). Each provider is a fully self-contained plugin. What that forbids in practice, and the sanctioned ways to vary behavior, are in [Provider Isolation — Hard Rules](#provider-isolation--hard-rules); the structure it produces is:

- **Supervisor side:** All provider-specific logic (heuristics, commands, detection, parsing) lives in the adapter's own file(s) under `src/supervisor/agents/`. The `SupervisorRuntime` calls adapter methods generically — no provider-specific if/else chains in runtime code.
- **Renderer side:** Each provider has its own directory under `src/renderer/components/providers/<kind>/` containing a lightweight manifest, icons, status components, and registration calls. `providerManifest.ts` eagerly discovers metadata while `bootstrap.ts` independently loads UI registrations at the desktop/mobile entrypoints. Leaf registries (`ProviderIcon.tsx`, `providerComposer.ts`, `providerSlashCommands.ts`) and feature-owned utility modules (`commitGen.ts`, `titleGen.ts`, `conflictResolver.ts`) stay side-effect-free until a provider module registers with them; the providers barrel does not bootstrap.
- **Registry pattern:** Provider behavior is fully self-contained. The supervisor factory list is explicit and guarded by directory-parity tests; renderer metadata and UI modules are filesystem-discovered; native install metadata remains an explicit renderer registry. No provider-specific `if/else` lands in shared runtime or layout logic. See [Adding a New Provider — Full Checklist](#adding-a-new-provider--full-checklist) for the remaining integration points.

## WSL Routing

- WSL projects are detected via `ProjectLocation.kind === "wsl"`.
- Agent commands are wrapped: `wsl.exe -d <distro> --cd <linuxPath> --exec <command>`.
- `batchWslCommandsAsync()` combines multiple commands into one `wsl.exe` invocation to avoid ~800-1000ms per-spawn overhead.
- Shell detection (`resolveWslShellPath`) is cached per distro with a `/bin/bash` fallback (chosen over `/bin/sh` so rc files — nvm/fnm/asdf — still get sourced).
- Agent install detection runs per-environment (Windows and each active WSL distro independently).

## Hook Runtime Resolution

Hooks (Claude/Codex/Gemini `forward.mjs` + the WSL `bridge.mjs`) need a Node binary they can invoke by absolute path. `/bin/sh -c` doesn't source nvm, so a bare `node` token in a hook command fails for nvm-only users. Both runtimes (native + WSL) resolve to an absolute Node path before staging the wrapper.

Pinned LTS version + SHA256 checksums for every target live in `src/supervisor/runtime/pinnedNode.ts`. Both resolvers import from there.

### Native (mac / linux / win32) — `src/supervisor/native/runtime/index.ts`

Three layers, in order of cost:

1. **Managed runtime fast path.** Single `existsSync` on `~/.poracode/runtime/node-v<x>-<target>/{bin/node,node.exe}`. Zero shell spawn — answers in microseconds when a previous boot installed it.
2. **Login-shell probe.** macOS GUI apps don't inherit the user's interactive PATH (no Homebrew, no nvm) — so on POSIX we spawn `$SHELL -lic` with sentinel markers (`__LC_NODE_PATH__:`, `__LC_NODE_VERSION__:`) to extract the user's `node` past any rc-file noise. On Windows, Electron inherits PATH from the registry already, so `where.exe node` is enough. If the binary version is ≥ `MIN_ACCEPTED_NODE_MAJOR`, that's our pick.
3. **Background install.** When 1 + 2 both miss, the resolver fires `installNativeRuntime` (download → SHA256-verify → `tar -xJf` for `.tar.xz` / `tar.exe -xf` for `.zip`) and immediately returns null. The current install pass falls back to `ELECTRON_RUN_AS_NODE=1`; next supervisor boot picks up the managed runtime via the fast path.

Result is memoized for the supervisor lifetime (one promise per base dir, shared across whatever providers resolve against that dir) and cleared on restart. `resolveNativeNode` is the public entry point; `managedNodePath` is exported for tests.

### WSL — `src/supervisor/wsl/runtime/index.ts`

- **Probe first:** `resolveNodeForDistro(distro)` runs `command -v node && node --version` through the user's login shell (`batchWslCommandsAsync` already does `-l -i`). ≥ Node 22 wins.
- **Install fallback:** Downloads the pinned LTS tarball, verifies SHA256 against `NODE_TARBALL_CHECKSUMS`, extracts inside the distro via `tar -xJf`. Glibc only — Alpine/musl users surface their own node via probe (`apk add nodejs`).

### Hook wrapper

`installerBase.writeNativeHookWrapper(pluginDir, { nodePath? })` writes `poracode-hook.{sh,cmd}` next to `forward.mjs`. Two shapes:

- **With nodePath (preferred):** wrapper exec's the bare Node binary directly. ~30–50 ms cold start.
- **Without:** wrapper sets `ELECTRON_RUN_AS_NODE=1` and exec's `process.execPath` (poracode's bundled Electron). ~150 ms cold start. Always works.

Adapters' `installPlugin` calls `resolveInstallNodePath(ctx)` from `installerBase`, which routes to the WSL or native resolver as appropriate. Provider install code passes the result through `options.resolvedNodePath` to `installXPlugin(ctx, options)`, which threads it into `writeNativeHookWrapper`. The wrapper is rewritten on every install pass — when a user installs Node between launches, the next boot detects it and upgrades the wrapper transparently.

### Bumping pinned Node

Edit `PORACODE_PINNED_NODE_VERSION` in `src/supervisor/runtime/pinnedNode.ts`, then run `pnpm tsx scripts/refresh-node-checksums.mjs`. The script walks the `NODE_TARBALL_CHECKSUMS` block and replaces every target's SHA256 from the official `nodejs.org/dist/v<x>/SHASUMS256.txt`. Covers `linux-{x64,arm64}` (.tar.xz), `darwin-{x64,arm64}` (.tar.xz), `win-{x64,arm64}` (.zip).

## Capability-Based UI

The UI only shows controls that the agent's `capabilities` object declares. Do not show fake controls for features a CLI cannot support (e.g. no effort selector for Gemini, no sandbox modes for Claude).
