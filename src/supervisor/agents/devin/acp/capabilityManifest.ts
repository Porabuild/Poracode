/**
 * Devin ACP capability and extension-contract manifest.
 *
 * Every entry distinguishes the evidence it rests on from the behavior
 * Poracode actually implements. Recognition of a flag on the wire is not
 * implementation of its operation semantics, so capabilities stay `disabled`
 * — and are never advertised to the agent — until the client-side behavior
 * exists and has been qualified.
 *
 * Evidence sources (tmp/devin/acp-contracts.md):
 *   confirmed-live  — observed on the wire against `devin acp` 3000.11.3
 *   inferred        — plausible from binary tokens/SDK schema, never observed
 *   unsupported-local — the agent answered -32601 on the local build
 *
 * The vendor wire namespace is `_cognition.ai/...` for methods and
 * `clientCapabilities._meta["cognition.ai/..."]` for flags; the leading
 * underscore is dispatch-only and never appears in `_meta` keys.
 */

export const DEVIN_ACP_VENDOR_META_PREFIX = "cognition.ai/";

export type DevinAcpContractEvidence = "confirmed-live" | "inferred" | "unsupported-local";

/** Whether Poracode's client currently advertises this capability. */
export type DevinAcpCapabilityState = "advertised" | "disabled";

export interface DevinAcpCapabilityEntry {
  /** Flag name in the agent's `ACP: client capabilities —` stderr line. */
  readonly flag: string;
  /** `clientCapabilities` wire location: standard field or `_meta` key. */
  readonly wireKey: string;
  /** Standard ACP v1 field (not under `_meta`). */
  readonly standard: boolean;
  readonly state: DevinAcpCapabilityState;
  readonly evidence: DevinAcpContractEvidence;
  /** Required before a `disabled` capability may be advertised. */
  readonly disabledReason?: string;
}

const meta = (suffix: string) => `${DEVIN_ACP_VENDOR_META_PREFIX}${suffix}`;

/**
 * All 29 negotiated client capability flags, exact wire names bisected live
 * (24 vendor `_meta` booleans + 5 standard fields).
 */
export const DEVIN_ACP_CLIENT_CAPABILITY_MANIFEST: readonly DevinAcpCapabilityEntry[] = [
  {
    flag: "terminal",
    wireKey: "terminal",
    standard: true,
    state: "advertised",
    evidence: "confirmed-live",
  },
  {
    flag: "terminal_auth",
    wireKey: "auth.terminal",
    standard: true,
    state: "disabled",
    evidence: "confirmed-live",
    disabledReason:
      "Recognized by the CLI probe, but the production ACP initialize payload does not advertise auth.terminal. App-managed terminal login remains a separate path.",
  },
  {
    flag: "fs.read",
    wireKey: "fs.readTextFile",
    standard: true,
    state: "advertised",
    evidence: "confirmed-live",
  },
  {
    flag: "fs.write",
    wireKey: "fs.writeTextFile",
    standard: true,
    state: "advertised",
    evidence: "confirmed-live",
  },
  {
    flag: "elicitation",
    wireKey: "elicitation",
    standard: true,
    state: "advertised",
    evidence: "confirmed-live",
  },
  {
    flag: "subagents",
    wireKey: meta("subagentSupport"),
    standard: false,
    state: "advertised",
    evidence: "confirmed-live",
  },
  {
    flag: "subagent_control",
    wireKey: meta("subagentControl"),
    standard: false,
    state: "disabled",
    evidence: "confirmed-live",
    disabledReason:
      "The known background/foreground/cancel methods returned -32601 locally with a live child and subagentControl advertised, and on cloud (E3 receipts). No callable child-control contract is available on this build.",
  },
  {
    flag: "partial_content",
    wireKey: meta("partialContent"),
    standard: false,
    state: "advertised",
    evidence: "confirmed-live",
    // Qualified with messageGrouping on 3000.11.3: production transform/mapper
    // consumed 384 assistant chunks as two native messages and two thoughts.
    // partialContent alone did not provide message IDs; do not attribute that
    // metadata to this flag independently (tmp/devin/partial-stream-audit.md).
  },
  {
    flag: "multi_root",
    wireKey: meta("multiRootWorkspace"),
    standard: false,
    state: "disabled",
    evidence: "confirmed-live",
    disabledReason:
      "Standard additionalDirectories new/load, replacement, empty/omitted clearing and distinct-root FS callbacks are native-qualified without this vendor flag. Host-owned saved grants, UI, complete launch wiring and authorization remain required before advertising the vendor capability.",
  },
  {
    flag: "grouped_options",
    wireKey: meta("groupedSessionConfigOptions"),
    standard: false,
    state: "advertised",
    evidence: "confirmed-live",
    // Live 3000.11.3 qualification captured 54 groups/123 values, projected
    // through standard subProviders/modelSubProvider fields, and confirmed an
    // exact native model write plus prompt. Existing shared picker sections
    // consume these fields; probe and session flags use this same manifest.
  },
  {
    flag: "client_models",
    wireKey: meta("clientProvidedModels"),
    standard: false,
    state: "disabled",
    evidence: "confirmed-live",
    disabledReason: "No Poracode client-side model source exists.",
  },
  {
    flag: "windsurf_config",
    wireKey: meta("windsurfConfigBridge"),
    standard: false,
    state: "disabled",
    evidence: "confirmed-live",
    disabledReason: "Legacy Windsurf config bridge; not applicable to Poracode.",
  },
  {
    flag: "message_grouping",
    wireKey: meta("messageGrouping"),
    standard: false,
    state: "advertised",
    evidence: "confirmed-live",
    // With partialContent, the CLI emits streamingMessageId on assistant and
    // thought chunks. The cloud relay also sends overwrite:true final text
    // snapshots (qualified on two turns, 3000.11.3). Native parsing stays in
    // the provider; the shared mapper receives opaque correlation/replace
    // declarations. Legacy chunks retain owner-scoped boundaries.
  },
  {
    flag: "raw_ref_tags",
    wireKey: meta("refTagsRaw"),
    standard: false,
    state: "disabled",
    evidence: "confirmed-live",
    disabledReason: "Raw @ref passthrough behavior unobserved.",
  },
  {
    flag: "revert",
    wireKey: meta("revert"),
    standard: false,
    state: "disabled",
    evidence: "confirmed-live",
    disabledReason:
      "No revert adapter is implemented, and the whole token-derived revert surface is UPSTREAM-ABSENT on the local CLI build: _cognition.ai/revert/{listSteps, preview, execute, resume, historyRewound, forkFromStep, stepsUpdated} all answered -32601 on 3000.11.3 local (E4 targeted battery, tmp/devin/e4/results/local-flags-turn.json — mutation-shaped verbs probed with {} only). Cloud revert routes remain unqualified, not proven unavailable.",
  },
  {
    flag: "load_stats",
    wireKey: meta("loadStats"),
    standard: false,
    state: "disabled",
    evidence: "confirmed-live",
    disabledReason:
      "Payloads are now live-captured and typed in acp/notifications.ts: _cognition.ai/turn_stats {sessionId, turnClientMessageId, responseDimensions[{uid, groupTitle, label, kind{metric|cumulativeMetric, value, prefix, tail, pluralTail}}]} and _cognition.ai/agent_stopped {cause:'complete', stats{toolCalls, filesChanged, commandsRun, tokens, ttftMs, tokensPerSec, totalTimeMs, modelLabel, ...}} (tmp/devin/e4/results/local-notifications.json). Advertisement stays gated on the shared transform actually routing them to a host surface (root seam) — typed leaf parsers alone do not render stats.",
  },
  {
    flag: "wiki",
    wireKey: meta("wiki"),
    standard: false,
    state: "disabled",
    evidence: "unsupported-local",
    disabledReason:
      "Only _cognition.ai/wiki/status was probed (-32601 on the local CLI build); wiki/contents and any cloud wiki route are unqualified, not confirmed unsupported.",
  },
  {
    flag: "request_diagnostics",
    wireKey: meta("requestDiagnostics"),
    standard: false,
    state: "disabled",
    evidence: "confirmed-live",
    disabledReason:
      "Contract fully qualified (E6 pull shape + E7 populated result schema, tmp/devin/lane-e7-result.md) and a typed adapter ships (acp/diagnostics.ts). Still opt-in only: the flag is advertised solely when the launch wires a readHostDiagnostics host bridge (CreateStructuredSessionInput) together with the createDevinDiagnosticsRequestHandler handler — devinAcpClientCapabilitiesMeta({requestDiagnostics:true}). The default advertised set stays disabled while no host diagnostics source is bound.",
  },
  {
    flag: "editor_context",
    wireKey: meta("editorContext"),
    standard: false,
    state: "disabled",
    evidence: "confirmed-live",
    disabledReason:
      "E6 observed no client polling; native handlers register even without flags. Client-pushed editor context is still unqualified and has no producer.",
  },
  {
    flag: "terminal_context",
    wireKey: meta("terminalContext"),
    standard: false,
    state: "disabled",
    evidence: "confirmed-live",
    disabledReason:
      "E6 observed no client polling; native handlers register even without flags. Client-pushed terminal context is still unqualified and has no producer.",
  },
  {
    flag: "mcp",
    wireKey: meta("mcp"),
    standard: false,
    state: "disabled",
    evidence: "confirmed-live",
    disabledReason:
      "Agent-side MCP injection is separately proven live (stdio + spec-exact http/sse over session/new, real tool round trips on 3000.11.3 — see fixtures/contracts/mcp-injection.json). This flag is the opposite direction: the agent asking the CLIENT to host/relay MCP servers (_cognition.ai/mcp/ connect|message|disconnect), and that client-side surface is unimplemented.",
  },
  {
    flag: "plugins",
    wireKey: meta("plugins"),
    standard: false,
    state: "disabled",
    evidence: "confirmed-live",
    disabledReason: "No native plugin-management host integration exists.",
  },
  {
    flag: "fast_context",
    wireKey: meta("fastContext"),
    standard: false,
    state: "disabled",
    evidence: "confirmed-live",
    disabledReason:
      "E6 observed no qualified ACP request, notification, or update metadata for this flag. A native fast-context tool is not evidence of a client bridge.",
  },
  {
    flag: "workspace_dir_commands",
    wireKey: meta("workspaceDirCommands"),
    standard: false,
    state: "disabled",
    evidence: "confirmed-live",
    disabledReason:
      "Discovered add-dir, undo-add-dir and remove-dir commands are native-qualified on owned fixtures. Production host grant reconciliation, persistence and idle scope-change custody remain required before exposing these mutation commands.",
  },
  {
    flag: "chains",
    wireKey: meta("chains"),
    standard: false,
    state: "disabled",
    evidence: "confirmed-live",
    disabledReason: "Chain update payloads unobserved.",
  },
  {
    flag: "browser_preview",
    wireKey: meta("browserPreview"),
    standard: false,
    state: "disabled",
    evidence: "inferred",
    disabledReason:
      "This is the client-to-agent capture producer (DOM/console), separate from opening previews. E6 qualified the direction, but capture payloads and host production remain unqualified.",
  },
  {
    flag: "browser_preview_open",
    wireKey: meta("browserPreviewOpen"),
    standard: false,
    state: "disabled",
    evidence: "confirmed-live",
    disabledReason:
      "E6 captured _cognition.ai/browserPreview/opened {sessionId, previewId, previewUrl, targetUrl}. A scoped host preview opener is still unimplemented. Without this flag native code may attempt a system-browser fallback; the no-open control must not be repeated.",
  },
  {
    flag: "clipboard_write",
    wireKey: meta("clipboardWrite"),
    standard: false,
    state: "disabled",
    evidence: "confirmed-live",
    disabledReason:
      "E6 found no ACP-reachable clipboard tool or /copy command. /share, which may publish data, was not invoked; the clipboard payload and client bridge remain unqualified.",
  },
  {
    flag: "local_tools",
    wireKey: meta("localTools"),
    standard: false,
    state: "disabled",
    evidence: "confirmed-live",
    disabledReason: "Cloud/local tool boundary is unqualified.",
  },
];

/** Vendor `_meta` keys Poracode's client genuinely implements. */
export const DEVIN_ACP_ADVERTISED_META_KEYS = DEVIN_ACP_CLIENT_CAPABILITY_MANIFEST.filter(
  (entry) => !entry.standard && entry.state === "advertised",
).map((entry) => entry.wireKey);

/** Explicit opt-ins for extending the advertised `_meta` flag set. */
export interface DevinAcpClientCapabilitiesMetaOptions {
  /**
   * Advertise `cognition.ai/requestDiagnostics` (client-hosted diagnostics
   * pull). Only for launches that bind BOTH halves of the bridge: a
   * `readHostDiagnostics` host source on `CreateStructuredSessionInput` AND
   * the `createDevinDiagnosticsRequestHandler` extension handler. Default
   * `false` — without the handler the agent's pulls would fall to `-32601`
   * while the flag claimed the capability exists.
   */
  readonly requestDiagnostics?: boolean;
}

/**
 * The `_meta` object to send in `initialize.clientCapabilities`. Never send
 * blanket `cognition.ai/*: true`: every advertised flag changes what the
 * agent sends mid-turn, and each entry here must keep a per-key smoke turn
 * before shipping to users.
 */
export function devinAcpClientCapabilitiesMeta(
  options?: DevinAcpClientCapabilitiesMetaOptions,
): Record<string, true> {
  const keys = options?.requestDiagnostics
    ? [...DEVIN_ACP_ADVERTISED_META_KEYS, meta("requestDiagnostics")]
    : DEVIN_ACP_ADVERTISED_META_KEYS;
  return Object.fromEntries(keys.map((key) => [key, true]));
}

export interface DevinAcpExtensionMethodEntry {
  /** Full wire method name including the dispatch underscore. */
  readonly method: string;
  readonly direction: "client-to-agent" | "agent-to-client" | "client-to-agent-notification";
  readonly evidence: DevinAcpContractEvidence;
  /** Whether Poracode ships a typed adapter for this method today. */
  readonly status: "implemented" | "not-implemented";
  readonly request: readonly string[];
  readonly response: readonly string[];
  readonly notes?: string;
}

/**
 * Extension methods with recorded contracts. The confirmed host→agent RPCs
 * have typed adapters (`sessionActions.ts`: rename, command/revise,
 * rules/list, hooks/list, and the cloud-only session/archive); the captured
 * agent→client notifications have typed parsers (`notifications.ts`);
 * everything confirmed unsupported stays unimplemented and must keep failing
 * -32601 — never a fake `{}` success.
 */
export const DEVIN_ACP_EXTENSION_METHOD_MANIFEST: readonly DevinAcpExtensionMethodEntry[] = [
  {
    method: "_cognition.ai/session/rename",
    direction: "client-to-agent",
    evidence: "confirmed-live",
    status: "implemented",
    request: ["sessionId", "title"],
    response: ["{}"],
    notes: "Agent echoes session_info_update.title afterwards; only Poracode-owned sessions.",
  },
  {
    method: "_cognition.ai/command/revise",
    direction: "client-to-agent",
    evidence: "confirmed-live",
    status: "implemented",
    request: ["sessionId", "command", "note?"],
    response: ["command"],
    notes:
      "Revision output is variable; review before permission acceptance — success is not execution.",
  },
  {
    method: "_cognition.ai/rules/list",
    direction: "client-to-agent",
    evidence: "confirmed-live",
    status: "implemented",
    request: ["sessionId"],
    response: ["rules[]"],
    notes: "Preserve extra rule fields; validate bounds.",
  },
  {
    method: "_cognition.ai/hooks/list",
    direction: "client-to-agent",
    evidence: "confirmed-live",
    status: "implemented",
    request: ["sessionId"],
    response: ["hooks[]"],
    notes: "Empty list proves the route; populated hook entries stay opaque until observed.",
  },
  {
    method: "_cognition.ai/mcp/serversChanged",
    direction: "agent-to-client",
    evidence: "confirmed-live",
    status: "not-implemented",
    request: [],
    response: ["{}"],
    notes:
      "Unsolicited notification observed with empty params. A leaf parser exists; no production handler refreshes a host surface, so this is not implemented behavior.",
  },
  {
    method: "_cognition.ai/subagent/background",
    direction: "client-to-agent",
    evidence: "unsupported-local",
    status: "not-implemented",
    request: [],
    response: [],
    notes:
      "Absent on CLI ACP 3000.11.3: -32601 locally with a live child present AND with clientCapabilities._meta['cognition.ai/subagentControl'] advertised (tmp/devin/e3/results/local-subagent.json + local-subagent-control-flag.json), and -32601 on the cloud relay (cloud-archive.json). Docs describe background/foreground as the AGENT's own spawn choice (subagent_started.isBackground), not a client RPC. Mid-run control while a child executes remains untested; the flag stays disabled either way.",
  },
  {
    method: "_cognition.ai/subagent/foreground",
    direction: "client-to-agent",
    evidence: "unsupported-local",
    status: "not-implemented",
    request: [],
    response: [],
    notes:
      "See subagent/background: -32601 local (live child, subagentControl advertised) and cloud.",
  },
  {
    method: "_cognition.ai/subagent/cancel",
    direction: "client-to-agent",
    evidence: "unsupported-local",
    status: "not-implemented",
    request: [],
    response: [],
    notes:
      "See subagent/background: -32601 local (live child, subagentControl advertised) and cloud.",
  },
  {
    method: "_cognition.ai/revert/listSteps",
    direction: "client-to-agent",
    evidence: "unsupported-local",
    status: "not-implemented",
    request: [],
    response: [],
    notes:
      "Answered -32601 on the local 3000.11.3 build. This is the only revert route ever probed; no other revert/Desktop/cloud route is qualified either way.",
  },
  {
    method: "_cognition.ai/repos/list",
    direction: "client-to-agent",
    evidence: "unsupported-local",
    status: "not-implemented",
    request: [],
    response: [],
    notes:
      "-32601 on the local 3000.11.3 build, but the CLOUD relay registers it: -32602 requires `org_id` (ReposListParams; tmp/devin/e3/results/cloud-archive.json). The org repo list is already visible as the `repos` config option on cloud session/new.",
  },
  {
    method: "_cognition.ai/wiki/status",
    direction: "client-to-agent",
    evidence: "unsupported-local",
    status: "not-implemented",
    request: [],
    response: [],
    notes:
      "-32601 on the local 3000.11.3 build, but the CLOUD relay registers it: -32602 'repo_name is required' for an owned session (tmp/devin/e3/results/cloud-archive.json). Params/response schema still unobserved — a param error proves registration, not the payload shape.",
  },
  {
    method: "_cognition.ai/repos/list",
    direction: "client-to-agent",
    evidence: "unsupported-local",
    status: "not-implemented",
    request: [],
    response: [],
    notes:
      "-32601 on the local 3000.11.3 build, but the CLOUD relay registers it: -32602 requires `org_id` (ReposListParams; tmp/devin/e3/results/cloud-archive.json). The org repo list is already visible as the `repos` config option on cloud session/new.",
  },
  {
    method: "_cognition.ai/session/archive",
    direction: "client-to-agent",
    evidence: "confirmed-live",
    status: "implemented",
    request: ["sessionId"],
    response: ["sessionId", "status", "is_archived:true"],
    notes:
      "Typed adapter (sessionActions.archiveSession) resolves ONLY on is_archived:true AND an echoed sessionId identical to the requested owned id (foreign/missing/malformed echo fails typed, never published). Declared as the neutral `devin.session.archive` action descriptor for target:\"cloud\" sessions ONLY — the local build answers -32601, so the default local descriptor set excludes it. Cloud gate: -32002 'Access denied' for a pendingSession (never-activated), including on its own creating connection (tmp/devin/e3/results/cloud-creator-archive.json); rename + archive both succeed only AFTER first-prompt activation (results/cloud-activate-archive.json). Explicit user action only — never wired to dispose/Stop/pane-close; the adapter performs no retries after an uncertain mutation.",
  },
  {
    method: "_cognition.ai/request_diagnostics",
    direction: "agent-to-client",
    evidence: "confirmed-live",
    status: "implemented",
    request: ["{}"],
    response: ["items[]?", "truncated?"],
    notes:
      "Typed adapter (acp/diagnostics.ts createDevinDiagnosticsRequestHandler) serves the E7-earned result: items[{id,uri,message,range{start,end{line,character}},severity,source}] with all six fields required strings and 0-based positions; truncated passes the host snapshot flag through. id is synthesized (deterministic hash of uri/range/message/source/severity/code, duplicate occurrences -N suffixed) — no LSP equivalent; host code feeds the id only (not a native wire field); a missing host source falls back to the document languageId. LSP numeric severity 1-4 maps to error|warning|info|hint strings (E7: wire severity is an unconstrained string; only 'error' rendering is display-qualified). Malformed params, no current session, malformed/oversized host data (>512KiB) all fail visibly (-32602/-32603, proven graceful) — never a fabricated empty success; an unavailable host source declines to the honest -32601. Wiring is opt-in: advertised only with the readHostDiagnostics host bridge (see the request_diagnostics capability row).",
  },
  {
    method: "_cognition.ai/browserPreview/opened",
    direction: "agent-to-client",
    evidence: "confirmed-live",
    status: "not-implemented",
    request: ["sessionId", "previewId", "previewUrl", "targetUrl"],
    response: [],
    notes:
      "E6 captured this NOTIFICATION from the native preview tool. previewUrl is the agent's own loopback proxy of targetUrl. The browserPreviewOpen flag routes it to the client; the scoped host opener is not implemented.",
  },
  {
    method: "_cognition.ai/browserPreview/capture",
    direction: "client-to-agent",
    evidence: "inferred",
    status: "not-implemented",
    request: [],
    response: [],
    notes:
      "E6 direction inference from primary Desktop capture flow, native DomElement/ConsoleOutput structs, and agent behavior: the CLIENT sends user-captured DOM/console context to the agent. No live payload has been synthesized or qualified; do not advertise a capture producer.",
  },
  {
    method: "_cognition.ai/clipboard/write",
    direction: "agent-to-client",
    evidence: "inferred",
    status: "not-implemented",
    request: [],
    response: [],
    notes:
      "Client-operation direction is agent-to-client. A client-to-agent -32601 probe does not establish absence in that direction. The agent-initiated request schema and host operation remain unqualified; do not advertise this capability.",
  },
  {
    method: "_cognition.ai/plan/isImplRequest",
    direction: "client-to-agent",
    evidence: "unsupported-local",
    status: "not-implemented",
    request: [],
    response: [],
    notes:
      "Token-derived plan-actions trigger path; probed with the owned sessionId on the local build: -32601 (E4 battery, tmp/devin/e4/results/local-flags-turn.json). Upstream-absent on CLI ACP 3000.11.3 — plan actions are a Desktop-client feature surface the CLI does not register.",
  },
  {
    method: "_cognition.ai/revert/preview",
    direction: "client-to-agent",
    evidence: "unsupported-local",
    status: "not-implemented",
    request: [],
    response: [],
    notes:
      "Read-shaped probe with the owned sessionId: -32601 locally (E4 battery). See the `revert` capability row.",
  },
  {
    method: "_cognition.ai/revert/execute",
    direction: "client-to-agent",
    evidence: "unsupported-local",
    status: "not-implemented",
    request: [],
    response: [],
    notes:
      "Mutation-shaped verb probed with {} ONLY: -32601 locally (E4 battery). Never probed with real parameters.",
  },
  {
    method: "_cognition.ai/revert/resume",
    direction: "client-to-agent",
    evidence: "unsupported-local",
    status: "not-implemented",
    request: [],
    response: [],
    notes: "Mutation-shaped verb probed with {} ONLY: -32601 locally (E4 battery).",
  },
  {
    method: "_cognition.ai/revert/historyRewound",
    direction: "client-to-agent",
    evidence: "unsupported-local",
    status: "not-implemented",
    request: [],
    response: [],
    notes:
      "Mutation-shaped verb probed with {} ONLY: -32601 locally (E4 battery); likely an agent→client notification by name — direction unconfirmed.",
  },
  {
    method: "_cognition.ai/revert/forkFromStep",
    direction: "client-to-agent",
    evidence: "unsupported-local",
    status: "not-implemented",
    request: [],
    response: [],
    notes: "Mutation-shaped verb probed with {} ONLY: -32601 locally (E4 battery).",
  },
  {
    method: "_cognition.ai/revert/stepsUpdated",
    direction: "client-to-agent",
    evidence: "unsupported-local",
    status: "not-implemented",
    request: [],
    response: [],
    notes:
      "Probed with {} ONLY: -32601 locally (E4 battery); likely an agent→client notification by name — direction unconfirmed.",
  },
  {
    method: "_cognition.ai/wiki/contents",
    direction: "client-to-agent",
    evidence: "unsupported-local",
    status: "not-implemented",
    request: [],
    response: [],
    notes:
      "Read-shaped probe with the owned sessionId: -32601 locally (E4 battery). wiki/status is separately cloud-registered (-32602 repo_name required, lane E3); contents stays absent locally and unqualified on cloud.",
  },
  {
    method: "_cognition.ai/thinking_complete",
    direction: "agent-to-client",
    evidence: "confirmed-live",
    status: "not-implemented",
    request: [],
    response: [],
    notes:
      "Notification flowing on every turn, live-captured: {durationMs, blockIndex, sessionId} (tmp/devin/e4/results/local-notifications.json). Typed parser in acp/notifications.ts; consumption/rendering is the shared transform seam (root). Malformed payloads parse as unknown, never error the stream.",
  },
  {
    method: "_cognition.ai/turn_stats",
    direction: "agent-to-client",
    evidence: "confirmed-live",
    status: "not-implemented",
    request: [],
    response: [],
    notes:
      "Per-turn stats notification, live-captured with loadStats advertised: {sessionId, turnClientMessageId, responseDimensions[{uid, groupTitle, label, kind}]} — self-describing dimension rows for host rendering. Typed bounded parser in acp/notifications.ts (dimensions capped, malformed → unknown).",
  },
  {
    method: "_cognition.ai/agent_stopped",
    direction: "agent-to-client",
    evidence: "confirmed-live",
    status: "not-implemented",
    request: [],
    response: [],
    notes:
      "Turn-settlement notification, live-captured: {cause:'complete', stats{toolCalls, filesChanged, commandsRun, input/outputTokens, ttftMs, tokensPerSec, totalTimeMs, modelLabel, responseDimensions…}}. Arrives ALONGSIDE the standard session/prompt stop reason — it must never replace or delay the stop-reason truth (plan rule: preserve timer truth). Typed bounded parser in acp/notifications.ts.",
  },
  {
    method: "_cognition.ai/processMemory",
    direction: "agent-to-client",
    evidence: "confirmed-live",
    status: "not-implemented",
    request: [],
    response: [],
    notes:
      "Observed flowing once across two qualification turns (params not yet captured — intermittent). Parses as unknown (safely ignored with a bounded diagnostic). Capture its payload in a future probe before typing.",
  },
  {
    method: "_cognition.ai/plugins/changed",
    direction: "agent-to-client",
    evidence: "confirmed-live",
    status: "not-implemented",
    request: [],
    response: [],
    notes:
      "Observed flowing once across two qualification turns (params not yet captured — intermittent; the plugins client flag was NOT advertised in either run). Parses as unknown; plugin-management host integration stays a root seam.",
  },
];

/**
 * Extension requests Poracode does not implement must keep the SDK's honest
 * -32601 answer. This helper exists so call sites assert the policy instead
 * of accidentally answering `{}`.
 */
export function isImplementedDevinAcpExtensionMethod(method: string): boolean {
  return DEVIN_ACP_EXTENSION_METHOD_MANIFEST.some(
    (entry) => entry.method === method && entry.status === "implemented",
  );
}
