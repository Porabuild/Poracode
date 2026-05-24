# Agent Adapter Rules

## Adapter Contract

Every supported agent implements the `AgentAdapter` interface (`src/supervisor/agents/base.ts`):

### Required

- `kind` / `label` — Provider identifier and display name.
- `capabilities` — Declares models, efforts, modes, approval policies, sandbox modes, resume/direct-input support, live input mode (terminal | server), presentation mode (terminal | gui).
- `spawnEnv?` — Optional `{ native?, wsl? }` env records the runtime merges into the PTY spawn (e.g. `BROWSER=/bin/true` under WSL for OAuth-flow providers). Runtime owns no provider-specific env.
- `detectInstall(ctx?)` — Typically one line: `return detectAgentInstall(ctx, spec)`. Declare a `DetectionSpec` (binary, capabilities, versionArgs?, authProbes?, capabilitiesProbe?) and let the engine own the WSL vs native probe + binary resolution + version + auth/capability merge.
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

| Provider | Models                                                              | Efforts                  | Live Input            | Structured Session     |
| -------- | ------------------------------------------------------------------- | ------------------------ | --------------------- | ---------------------- |
| Claude   | opus-4-7, opus-4-6[1m], sonnet, haiku                               | low, medium, high, max   | terminal              | No                     |
| Codex    | gpt-5.4, gpt-5.4-mini, gpt-5.3-codex, gpt-5.2-codex, etc.           | low, medium, high, xhigh | terminal / GUI server | Yes (stdio app-server) |
| Gemini   | auto, gemini-3.1-pro-preview, gemini-2.5-pro/flash/flash-lite, etc. | (none)                   | terminal              | No                     |
| Copilot  | (probed via ACP)                                                    | low, medium, high, xhigh | terminal              | Yes (ACP)              |
| Cursor   | auto, composer-\*, GPT/Opus/Sonnet variants                         | (embedded in model name) | terminal              | No                     |
| Grok     | grok-build (probed via ACP)                                         | (none)                   | terminal              | Yes (ACP)              |

## Plugin Architecture

The codebase is provider-agnostic by design (targeting 5-10 providers). Each provider is a fully self-contained plugin:

- **Supervisor side:** All provider-specific logic (heuristics, commands, detection, parsing) lives in the adapter's own file(s) under `src/supervisor/agents/`. The `SupervisorRuntime` calls adapter methods generically — no provider-specific if/else chains in runtime code.
- **Renderer side:** Each provider has its own directory under `src/renderer/components/providers/<kind>/` containing icons, status components, and registration calls. Shared provider utilities (`statusTone.ts`, `StatusIcon.tsx`, `ProviderIcon.tsx`, `commitGen.ts`) live at the `providers/` root and are provider-agnostic.
- **Registry pattern:** The agent registry (`agents/registry.ts`) and the renderer provider registries (`registerProviderIcon`, `registerModelLabels`, `registerCommitGenDefaults`) are the only integration points. Adding a new provider should require zero changes to existing shared files — just implement the adapter, create a provider component directory, and register.

## WSL Routing

- WSL projects are detected via `ProjectLocation.kind === "wsl"`.
- Commands are wrapped: `wsl.exe -d <distro> --cd <linuxPath> -- <command>`.
- `batchWslCommandsAsync()` combines multiple commands into one `wsl.exe` invocation to avoid ~800-1000ms per-spawn overhead.
- Shell detection (`resolveWslShellPath`) is cached per distro with `/bin/sh` fallback.
- Agent install detection runs per-environment (Windows and each active WSL distro independently).

## Hook Runtime Resolution

Hooks (Claude/Codex/Gemini `forward.mjs` + the WSL `bridge.mjs`) need a Node binary they can invoke by absolute path. `/bin/sh -c` doesn't source nvm, so a bare `node` token in a hook command fails for nvm-only users. Both runtimes (native + WSL) resolve to an absolute Node path before staging the wrapper.

Pinned LTS version + SHA256 checksums for every target live in `src/supervisor/runtime/pinnedNode.ts`. Both resolvers import from there.

### Native (mac / linux / win32) — `src/supervisor/native/runtime/index.ts`

Three layers, in order of cost:

1. **Managed runtime fast path.** Single `existsSync` on `~/.lightcode/runtime/node-v<x>-<target>/{bin/node,node.exe}`. Zero shell spawn — answers in microseconds when a previous boot installed it.
2. **Login-shell probe.** macOS GUI apps don't inherit the user's interactive PATH (no Homebrew, no nvm) — so on POSIX we spawn `$SHELL -lic` with sentinel markers (`__LC_NODE_PATH__:`, `__LC_NODE_VERSION__:`) to extract the user's `node` past any rc-file noise. On Windows, Electron inherits PATH from the registry already, so `where.exe node` is enough. If the binary version is ≥ `MIN_ACCEPTED_NODE_MAJOR`, that's our pick.
3. **Background install.** When 1 + 2 both miss, the resolver fires `installNativeRuntime` (download → SHA256-verify → `tar -xJf` for `.tar.xz` / `tar.exe -xf` for `.zip`) and immediately returns null. The current install pass falls back to `ELECTRON_RUN_AS_NODE=1`; next supervisor boot picks up the managed runtime via the fast path.

Result is memoized for the supervisor lifetime (one promise shared across all 5 providers) and cleared on restart. `resolveNativeNode` is the public entry point; `managedNodePath` is exported for tests.

### WSL — `src/supervisor/wsl/runtime/index.ts`

- **Probe first:** `resolveNodeForDistro(distro)` runs `command -v node && node --version` through the user's login shell (`batchWslCommandsAsync` already does `-l -i`). ≥ Node 22 wins.
- **Install fallback:** Downloads the pinned LTS tarball, verifies SHA256 against `NODE_TARBALL_CHECKSUMS`, extracts inside the distro via `tar -xJf`. Glibc only — Alpine/musl users surface their own node via probe (`apk add nodejs`).

### Hook wrapper

`installerBase.writeNativeHookWrapper(pluginDir, { nodePath? })` writes `lightcode-hook.{sh,cmd}` next to `forward.mjs`. Two shapes:

- **With nodePath (preferred):** wrapper exec's the bare Node binary directly. ~30–50 ms cold start.
- **Without:** wrapper sets `ELECTRON_RUN_AS_NODE=1` and exec's `process.execPath` (lightcode's bundled Electron). ~150 ms cold start. Always works.

Adapters' `installPlugin` calls `resolveInstallNodePath(ctx)` from `installerBase`, which routes to the WSL or native resolver as appropriate. Provider install code passes the result through `options.resolvedNodePath` to `installXPlugin(ctx, options)`, which threads it into `writeNativeHookWrapper`. The wrapper is rewritten on every install pass — when a user installs Node between launches, the next boot detects it and upgrades the wrapper transparently.

### Bumping pinned Node

Edit `LIGHTCODE_PINNED_NODE_VERSION` in `src/supervisor/runtime/pinnedNode.ts`, then run `pnpm tsx scripts/refresh-node-checksums.mjs`. The script walks the `NODE_TARBALL_CHECKSUMS` block and replaces every target's SHA256 from the official `nodejs.org/dist/v<x>/SHASUMS256.txt`. Covers `linux-{x64,arm64}` (.tar.xz), `darwin-{x64,arm64}` (.tar.xz), `win-{x64,arm64}` (.zip).

## Capability-Based UI

The UI only shows controls that the agent's `capabilities` object declares. Do not show fake controls for features a CLI cannot support (e.g. no effort selector for Gemini, no sandbox modes for Claude).
