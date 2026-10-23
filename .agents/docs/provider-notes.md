# Provider Notes

Per-provider behavior that the code alone does not explain. Read the section for
a provider before changing its adapter or renderer plugin. Rules that apply to
every provider are in [Agent Adapter Rules](agent-adapters.md).

## Finding provider facts

- **Built-in providers:** `builtIns` in `src/supervisor/agents/registry.ts`;
  each has a folder under `src/supervisor/agents/<kind>/`.
- **Models, efforts, modes:** the provider's `detection.ts`. Many providers
  declare empty lists and fill them from a runtime capabilities probe (ACP,
  SDK, app-server, or a CLI `--list-models`), so read the probe rather than
  trusting a static default.
- **GUI (structured) presentation:** supported exactly when the adapter
  implements `createStructuredSession`. The transport (ACP, SDK, stdio
  app-server, HTTP server) is visible in that provider's `acp.ts` or session
  code.

## Antigravity

One built-in agent and one registry card with two managed runtime
prerequisites: `agy` backs Terminal, and the official `antigravity-acp`
registry artifact backs Chat. Install reconciles whichever prerequisite is
missing; the registry alias is not exposed as a second provider (a
pre-adoption `installKind: "generic"` install keeps its own registry card so it
stays updatable and removable).

When detection finds the CLI in an environment where the artifact is missing,
the supervisor installs it there in the background (once per environment per
session). Removing the artifact records an opt-out in
`acpRegistryAutoInstallOptOuts`, so a deliberate removal is never undone; the
next explicit install clears it. Composer, registry-card, and provider-settings
update surfaces compare both installed versions with their independent latest
sources, and one action updates whichever runtimes are stale.

Antigravity's background-task text and held-prompt handling are the worked
example in [Provider Isolation](agent-adapters.md#worked-example). Subagent
launches (`invoke_subagent` and `browser_subagent`) are bridged in
`src/supervisor/agents/antigravity/acpSubagents.ts`: `agy_acp_server` strips
`invoke_subagent` arguments and omits child/completion updates on the ACP wire,
so the adapter tails `~/.gemini/antigravity-acp/brain/<conversationId>/.system_generated/logs/transcript_full.jsonl`
through `AcpExternalSessionUpdateSource` and `AcpSubagentCoordinator`.
Interception requires a title-identical, fresh planner call in the transcript
(never a positional or stale match), replayed `session/load` history is left
untouched, and cards settle on turn end: immediately on cancel/failure, or
after `turnEndSettleMs` of transcript quiet once the turn completed — late
reports genuinely land after `end_turn`, so the wait is bounded, not zero.

## Devin

- Terminal uses Smart permissions; structured Chat uses Bypass (Plan still
  selects the ACP plan mode). Signed-in ACP also advertises Smart; Bypass
  remains the requested GUI policy. The adapter declares a `resolveMode` hook
  for this mapping; shared ACP code has no provider-specific mode rules.
- ACP runs only for GUI threads, because `session/new` alone does not persist a
  native session. Terminal launches use native SQLite ID discovery without
  reading transcript content; overlapping discoveries in the same cwd stay
  unresolved on purpose.
- Devin advertises only stdio MCP (verified on 3000.10.21), so remote MCP
  servers are relayed through the existing tool-filter stdio worker. A
  per-session configuration overlay makes injected servers visible to its
  native MCP discovery tools while preserving existing config and durable
  session storage.
- Terminal MCP injection is not supported: the CLI has no verified per-thread
  MCP override, and shared user/project config is left untouched.
- Usage comes from the private CLI quota endpoint. Accounts without quota
  windows report unsupported; overage shows as a remaining credit balance.
  Account metadata is not parsed from undocumented CLI output.

## OpenCode 2 (`opencode2`)

A separate built-in provider from OpenCode 1. It installs `@opencode/cli` with
npm `--prefix "$HOME/.opencode2"` (Windows: `$env:USERPROFILE/.opencode2`) so the
V1 executable is preserved. The real binary is `bin/opencode.exe`;
`opencode2.cjs` is only a migration notice, which the resolver unwraps before
validating the version. The minimum CLI is `OPENCODE2_MIN_VERSION`
(`src/supervisor/agents/opencode2/binary.ts`), kept in step with the
`@opencode/client` version in `package.json` and the install commands in
`src/renderer/components/providers/opencode2/installCommands.ts`.

- **Native accounts and sessions:** uses the CLI's normal database selection,
  including a user-supplied `OPENCODE_DB`. OpenCode stores credentials in
  SQLite alongside sessions, so forcing a separate database hides native
  accounts and splits the login command and runtime across stores. Poracode
  never copies, renames, or migrates OpenCode databases; OpenCode owns its
  schema migrations. Older Poracode sessions in `opencode-v2.db` stay
  resumable: only a matching native `SessionNotFoundError` selects that legacy
  sidecar, and terminal attachment uses the same selected database. Key/external
  credentials from older sessions migrate through the credential API with a
  versioned, atomic compatibility journal; sign-out records revocation before
  deleting the credential ID from both stores. OAuth grants stay in their
  original database so independently running sidecars cannot duplicate a
  rotating refresh token. Settings keeps legacy OAuth accounts visible and
  removable, explains that new native threads need a fresh sign-in, and does
  not let them satisfy the native status probe. Key sync preserves each
  integration's selected legacy OAuth account.
- **Server:** the pooled runtime starts
  `serve --hostname=127.0.0.1 --port=0 --print-logs`, reads its URL and
  generated Basic-auth password, and redacts readiness credentials from
  diagnostics. Catalog reads wait for the first published plugin inventory.
  Client types live behind `clientTypes.ts`; the ESM-only client is dynamically
  imported by the supervisor.
- **Events:** `event.subscribe` is live-tail only. Admission waits for the first
  connection. Reconnection reconciles message snapshots, outstanding forms and
  permissions, and active-session state before admitting another prompt.
  Completed provider message IDs prevent duplicate rows, and authoritative final
  text replaces divergent partial text. Child sessions attach through native
  subagent tool metadata and do not change the parent turn's lifecycle.
- **GUI controls:** model and variant selection, built-in Plan mode, primary
  agent commands, native commands and skills, attachment URI references,
  structured forms and permissions, Stop and native steering, compaction,
  rollback, and resume all use the V2 API. Permission policy is applied per
  session before a turn, without separate server processes per policy.
- **Terminal:** model, variant, agent, and permissions are persisted through the
  API before attaching the real PTY with `--session` and `--server`. The PTY
  retains a lease on the configured supervisor server and receives its password
  through `OPENCODE_PASSWORD`, so the native background service cannot replace
  its MCP set. Terminal pools are isolated by directory and resolved MCP config
  because their credentials can identify one thread. Existing native and legacy
  databases remain valid; only in-memory process ownership changes. Resume waits
  for the preceding terminal's interruption and disposal, keeping late cleanup
  from interrupting its successor. The default TUI command has no model/agent
  flags. Status uses terminal heuristics (no V2 hook plugin).
  GUI cross-agent MCP calls use trusted provider-session routing.
- **MCP and generation:** provider settings manage the directory-scoped MCP set.
  Utility generation uses `session.generate` without a tool loop, then removes
  its temporary session. Both one-shot capability flags are supported.
- **Compatibility:** provider discovery changes invalidate both the supervisor
  status cache and the renderer's persisted capability cache. Runtime
  `content.delta.replace` carries authoritative stream snapshots, and the remote
  protocol version gate stops older peers from appending them as deltas. Wire
  compatibility is enforced at detection and server acquisition.

## Command Code

Command Code loads Poracode's MCP tools through a session-local `--mod` using
its v1 ModApi. The adapter passes a versioned environment envelope; the bundled
`commandcode-mcp-mod.mjs` (source: `src/supervisor/agents/commandcode/mcpMod.ts`)
connects the enabled stdio, HTTP, or SSE servers and registers their tools.
Native MCP settings remain owned by Command Code. The mod stays alive across
native session switches. Tool names and JSON schemas are normalized at this
provider boundary for the CLI's model/input validation. The helper is bundled
with its MCP SDK dependencies and ships through the shared helpers resource
pipeline, including WSL and SSH deployments. It shares the SDK connection
implementation with Pi extensions (see
[Provider Runtime](provider-runtime.md#terminal-mcp-launch-integration)).

`commandcode/` is also the reference template for a TUI-only, non-ACP CLI.
