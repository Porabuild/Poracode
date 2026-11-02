# Provider Runtime

Shared subsystems that every provider plugs into: ACP sessions, MCP
integration, and the Node runtime for hook plugins. Read the relevant section
before changing `src/supervisor/agents/acp/`, MCP launch or settings code, or
hook installation. The isolation rules in
[Agent Adapter Rules](agent-adapters.md#provider-isolation--hard-rules) apply
to all of it.

## ACP

### Session ownership

Poracode's persisted threads are the only conversation list and source of
truth. Do not call or expose provider-native ACP `session/list`, and do not
import a provider's conversation history automatically, even when the agent
advertises the capability — this is a product boundary, not missing support.
The one sanctioned path is the explicit, user-initiated session import (see
`sessionImport` in [Adapter Contract](agent-adapters.md#optional)).

ACP `session/resume` and legacy `session/load` are used only with a provider
session ID already associated with a Poracode thread. Advertised resume support
must not turn provider session discovery into a second thread index.

### Composer behavior

- Inline file mentions stay text-first, then serialize to structured segments.
  `MentionInput` and `serializeMentions.ts` (`serializeToSegments` /
  `flattenSegments`) accept raw `@path` tokens, so repo-relative references
  become `{ kind: "file" }` prompt segments on submit without a picker chip.
- ACP resource paths resolve from the active project root. Relative mentions
  and attachments are normalized before ACP conversion so Windows, WSL, spaces,
  and `file://` URIs stay valid.
- GUI ACP follow-ups use the negotiated native steering path below when available. Otherwise, interrupt-and-drain interrupts the active turn, queues the follow-up as structured `{ prompt, segments, config }`, and drains it through the existing turn coordinator once the active turn settles.
- An adapter can declare `promptSteering` (`acp/promptSteering.ts`) for an
  agent that accepts a marked second `session/prompt` during a turn. The
  session then exposes `steerTurn` once `initialize` advertises support: a
  text steer joins the running turn without a cancel, and the turn closes only
  after the agent answers every steer. A rejected steer, or one with non-text
  content, is sent as an ordinary prompt within the same turn. An agent whose
  reply always starts a new assistant item sets `repliesInNewAssistantItem` so
  the steer row is painted without closing the in-flight message.
- Terminal presentation stays PTY-owned. Do not add queueing or fake
  stop/steering UI to terminal-native threads.

### Text streams

Providers whose ACP text messages have stable identities and authoritative
snapshots normalize them into `poracodeTextStream` metadata through
`acp/canonicalMapping/textStreamSnapshots.ts`. The declaration carries only an
opaque message `id` and `mode: "append" | "replace"`; native event types and
overwrite flags stay inside the provider. The shared mapper correlates by
session, owner, and text stream, and uses `content.delta.replace` to update the
same canonical item even after a tool or another stream closed it. Annotated
chunks are explicitly plain assistant or reasoning text. Do not infer snapshots
from repeated prose, suppress equal deltas, or reuse one owner's identity for
another. Unannotated messages keep the ordinary mapping path.

Known child correlations stay addressable after their parent finishes via the
neutral parent-tool declaration. An unknown or evicted declared owner must never
replace a root or sibling stream with the same native id.

A late replacement of an existing canonical item is a history correction, not a
new autonomous turn: a nonempty batch of only replacing text deltas must neither
reopen work nor extend an orphan turn's idle window. New items, appends, and
other lifecycle events keep the ordinary activity rules.

### Command tool calls and client terminals

Command execution tools may stream `rawInput.command` and `rawInput.cwd` after
the call opens; the shared mapper refreshes those fields as they arrive.
`AcpSessionBehavior.unreferencedTerminalCorrelation` controls client-hosted
terminals that are not referenced from tool content: the default `lookup`
matches output by command text, while `attribute-on-create` binds a newly
created terminal to the oldest open command call with the exact normalized
command. Providers may declare `poracodeCommandStatus` metadata when a command
tool's text content is a completion status line rather than command output.
The provider parses its own status format; the shared mapper composes the
terminal output with that line and applies a declared `exitCode`.
Search calls that report matches as resource links use decoded file targets or
their URI/name when no text result exists. Windows client-terminal wrappers
propagate native exit codes because PowerShell otherwise reports `1` for any
failing native command.

### Prompt usage and notifications

Prompt usage semantics are declared through `AcpSessionBehavior`.
`promptUsageCounterKind` defaults to `cumulative`; `per-call` counts each
accepted prompt with its own stable `acp-prompt-v1` sample ID, including equal
or decreasing totals. Set `promptUsageReportsContext: false` when the payload
measures consumption rather than context-window occupancy. Standard
`usage_update` notifications report context independently; do not count a
vendor notification again when it echoes the standard prompt reply. Qualify the
declared semantics against multiple turns and each runtime target.

An extension notification handler receives the current native `sessionId` and
the canonical foreground `turnId`, when present. Providers validate their
payload's owner before emitting events. Replayed, disposed, and closed
transports do not deliver extension notifications. A vendor stop notification
must not complete the foreground turn a second time; the standard prompt result
owns completion.

## MCP

### Terminal MCP launch integration

Composer `mcpScope.terminal` declares whether the selected MCP set can be
supplied at launch. Providers with per-launch config flags stage private files
and attach cleanup to both launch and resume argv. Native Windows ACLs and
in-distro Linux permissions protect credential-bearing files before they are
written.

Providers that ignore a stdio server's `cwd` declare
`mcpRequiresStdioCwdProxy`. The launch pipeline then uses the standalone stdio
launcher, which applies cwd/env and preserves raw MCP traffic, including
resources and prompts. Servers with disabled tools still use the filtering
proxy.

Command Code mods and Pi extensions share the SDK connection implementation;
each provider maps schemas/results and owns its extension lifecycle. Pi closes
connections on reload/quit and keeps them across native session switches. The
standalone helpers and their versioned launch envelopes must ship together.

### Native MCP setup and consent

CLI availability is independent of Poracode MCP integration. A provider without
session-local MCP support stays available in CLI mode and does not advertise
per-thread MCP selection.

Providers with `nativeMcpConfig(ctx)` expose optional native configuration
setup in Provider Settings. The user explicitly selects saved user MCP servers
and clicks Install after reviewing the destination and provider-wide scope. This
copies native definitions, not a traffic proxy; it never runs on detection or
thread launch, and changes are not synchronized automatically. Removal preserves
unrelated servers and user-edited entries. Unsupported native options are shown
as unavailable rather than silently dropped. Native host environments are
supported; WSL setup stays unavailable until its paths and permissions are
verified.

The `native-mcp-config/<config-path-hash>.json` ownership journal (version 1)
stores hashes, not credentials. It records old and proposed entry hashes before
atomic configuration writes, so interrupted updates can be retried. The settings
revision covers both native configuration and saved server definitions.

## Hook Runtime Resolution

Hook plugins (`forward.mjs` and the WSL `bridge.mjs`) need a Node binary they
can invoke by absolute path: `/bin/sh -c` does not source nvm, so a bare `node`
fails for nvm-only users. Both runtimes resolve an absolute Node path before
staging the wrapper. The pinned Node version and per-target SHA256 checksums
live in `src/supervisor/runtime/pinnedNode.ts`.

**Native** (`src/supervisor/native/runtime/index.ts`), cheapest first:

1. Managed runtime fast path — one `existsSync` on
   `~/.poracode/runtime/node-v<x>-<target>/{bin/node,node.exe}`.
2. Login-shell probe — macOS GUI apps do not inherit the interactive PATH, so
   POSIX spawns `$SHELL -lic` with sentinel markers to read `node` past rc-file
   noise; Windows uses `where.exe node`. Accepted when the major version is at
   least `MIN_ACCEPTED_NODE_MAJOR`.
3. Background install — download, verify SHA256, extract, and return null for
   this pass, which falls back to `ELECTRON_RUN_AS_NODE=1`; the next supervisor
   boot takes the fast path.

The result is memoized per base dir for the supervisor lifetime.
`resolveNativeNode` is the public entry point.

**WSL** (`src/supervisor/wsl/runtime/index.ts`): probe `command -v node` through
the login shell first; otherwise download the pinned tarball, verify it against
`NODE_TARBALL_CHECKSUMS`, and extract inside the distro. glibc only —
Alpine/musl users must provide their own node.

**Wrapper:** `writeNativeHookWrapper(pluginDir, { nodePath? })` in
`src/supervisor/agents/plugin/installerBase.ts` writes `poracode-hook.{sh,cmd}`
next to `forward.mjs`. With a `nodePath` it execs Node directly (faster cold
start); without one it sets `ELECTRON_RUN_AS_NODE=1` and execs the bundled
Electron, which always works. `installPlugin` calls `resolveInstallNodePath(ctx)`,
which routes to the WSL or native resolver, and threads the result through
`options.resolvedNodePath`. The wrapper is rewritten on every install pass, so a
Node installed between launches is picked up on the next boot.

**Bumping pinned Node:** edit `PORACODE_PINNED_NODE_VERSION` in `pinnedNode.ts`,
then run `node scripts/refresh-node-checksums.mjs`, which refreshes every
target's SHA256 from the official `SHASUMS256.txt`.
