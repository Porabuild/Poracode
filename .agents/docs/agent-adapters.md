# Agent Adapter Rules

## Adapter Contract

Every supported agent implements the `AgentAdapter` interface (`src/supervisor/agents/base.ts`):

### Required

- `kind` / `label` — Provider identifier and display name.
- `capabilities` — Declares models, efforts, modes, approval policies, sandbox modes, resume/direct-input support, live input mode (terminal | server), presentation mode (terminal | gui).
- `detectInstall(ctx?)` — Check CLI installation and auth state per environment (Windows or WSL distro).
- `buildLaunchCommand()` / `buildResumeCommand()` — Shell command specs for spawning the agent.
- `createInitialSessionRef()` — Generate a session ID on first launch (or `undefined` if the CLI generates its own).

### Optional — Terminal Heuristics

- `isReadyForInitialPrompt?(text)` — True when the TUI is ready to receive the first user prompt.
- `detectTerminalStatus?(text)` — Derive `ThreadStatus` + `ThreadAttention` from rolling terminal output (8192-char window, ANSI-stripped).
- `detectInvalidSessionRef?(text)` — True if the CLI reports a stale/invalid session ID.
- `detectAutoResponse?(text)` — Returns input string to auto-dismiss known TUI prompts (e.g. rate-limit).
- `discoverSessionRef?(location)` — Poll the CLI for its session ID after spawn (e.g. `gemini --list-sessions`).
- `syncConfigFromTerminalState?(input)` — Reconcile config when the TUI changes state (e.g. Claude plan-mode exit clears mode flag).

### Optional — Structured Sessions

- `createStructuredSession?(input)` — Start a server-controlled session (Codex App Server: WebSocket JSON-RPC, rollout file coordination with PTY).

### Optional — Input

- `buildDirectInput?(prompt)` — Split a prompt into terminal-safe chunks with delays for TUI pasting.

### Optional — Commit Generation

- `defaultOneShotModel?` — Default model for one-shot CLI calls (commit messages).
- `buildOneShotCommand?(model, effort?)` — CLI command for piped-stdin generation.

## Current Providers

| Provider | Adapter File                                      | Models                                                              | Efforts                  | Live Input | Structured Session |
| -------- | ------------------------------------------------- | ------------------------------------------------------------------- | ------------------------ | ---------- | ------------------ |
| Claude   | `agents/claude.ts`                                | opus-4-6[1m], sonnet, haiku                                         | low, medium, high, max   | terminal   | No                 |
| Codex    | `agents/codex.ts`                                 | gpt-5.4, gpt-5.4-mini, gpt-5.3-codex, gpt-5.2-codex, etc.           | low, medium, high, xhigh | server     | Yes (WebSocket)    |
| Gemini   | `agents/gemini/adapter.ts` + `gemini/terminal.ts` | auto, gemini-3.1-pro-preview, gemini-2.5-pro/flash/flash-lite, etc. | (none)                   | terminal   | No                 |

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

## Capability-Based UI

The UI only shows controls that the agent's `capabilities` object declares. Do not show fake controls for features a CLI cannot support (e.g. no effort selector for Gemini, no sandbox modes for Claude).
