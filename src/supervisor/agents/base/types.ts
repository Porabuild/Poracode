import type {
  AgentAuthMethod,
  AgentCapability,
  AgentKind,
  AgentProviderMetadata,
  AgentSlashCommand,
  AgentStatus,
  AgentUpdateInfo,
  AuthState,
  ProjectLocation,
  PromptSegment,
  RuntimeEvent,
  SessionRef,
  ThreadAttention,
  ThreadConfig,
  ThreadPresentationMode,
  ThreadServerRequestId,
  ThreadStatus,
  ThreadGoalControl,
  ResolvedMcpServer,
} from "@/shared/contracts";
import type { OscNotification, OscShellEvent, OscTitle } from "@/shared/osc";
import type { McpThreadIdentity } from "@/shared/browserMcpThread";

export interface CommandSpec {
  command: string;
  args: string[];
  cwd?: string;
  sessionRef?: SessionRef;
  /** Best-effort cleanup for per-launch resources such as temporary MCP configs. */
  cleanup?: () => void;
  /**
   * Environment variables that should be set for the agent process.
   * For WSL commands these are baked into the shell script as `export` statements
   * because `wsl.exe` does not forward Windows env vars into the distro.
   */
  env?: Record<string, string>;
}

export interface AgentEnvContext {
  envKind: "windows" | "wsl" | "posix";
  wslDistro?: string;
  /**
   * Provider-global settings for this adapter. Detection receives the same
   * snapshot launch receives, allowing a provider with multiple structured
   * runtimes to probe only the selected runtime.
   */
  agentSettings?: Record<string, boolean | string>;
  /**
   * Poracode data base dir for native (non-WSL) plugin staging. Populated by
   * the supervisor so dev runs (`~/.poracode-dev`) stage plugins separately
   * from prod (`~/.poracode`). WSL plugin installs ignore this and stage
   * into the distro's `$HOME/.poracode/` via `resolveWslHomeDirectoryAsync`.
   */
  baseDir?: string;
  mcpServers?: readonly ResolvedMcpServer[];
}

export interface AgentLaunchOptions {
  suppressResumeConfigOverrides?: boolean;
  resumeThreadId?: string;
  agentSettings?: Record<string, boolean | string>;
  mcpServers?: readonly ResolvedMcpServer[];
}

export interface StructuredSessionUpdate {
  status: ThreadStatus;
  attention: ThreadAttention;
  config?: ThreadConfig;
  sessionRef?: SessionRef;
  errorMessage?: string;
  slashCommands?: AgentSlashCommand[];
}

export interface StructuredSessionListener {
  onClose(): void;
  onError(errorMessage: string): void;
  onUpdate(update: StructuredSessionUpdate): void;
  onRuntimeEvent?(event: RuntimeEvent): void;
}

export interface StartTurnOptions {
  userMessageItemId?: string;
  /**
   * Portable-skills fallback: inline SKILL.md instructions for invoked skills
   * the provider cannot load natively. Appended to the outgoing provider
   * payload only — never painted into the chat's user_message item.
   */
  inlineInstructions?: string;
}

export interface ThreadHistoryEntry {
  messageId: string;
  role: "user" | "assistant";
  parts: ReadonlyArray<unknown>;
  info: unknown;
}

export interface ThreadHistory {
  providerSessionId: string;
  messages: ReadonlyArray<ThreadHistoryEntry>;
}

export interface StructuredSessionHandle {
  launchOptions: AgentLaunchOptions;
  /** Whether a provider-native root or child session belongs to this thread. */
  ownsProviderSession?(providerSessionId: string): boolean;
  activate?(): Promise<void>;
  openThread?(config: ThreadConfig, sessionRef?: SessionRef): Promise<string>;
  ensureResumeArtifacts?(): Promise<void>;
  waitForRolloutFile?(timeoutMs?: number): Promise<void>;
  startTurn?(
    prompt: string,
    config: ThreadConfig,
    segments?: PromptSegment[],
    options?: StartTurnOptions,
  ): Promise<void>;
  /**
   * Steer the in-flight turn: enqueue a new user message onto the running
   * turn WITHOUT interrupting it (no subagents killed, no error result). The
   * message either steers the current turn or is answered in the next one.
   * Providers that expose this let the runtime skip the interrupt-drain steer
   * path. When no turn is in flight, implementations fall back to `startTurn`
   * semantics so turn accounting stays correct.
   */
  steerTurn?(
    prompt: string,
    config: ThreadConfig,
    segments?: PromptSegment[],
    options?: StartTurnOptions,
  ): Promise<void>;
  /**
   * Best-effort provider preparation immediately before the shared runtime
   * interrupts an in-flight turn for steering. Providers can preserve work
   * that should survive the turn boundary (for example, by backgrounding
   * foreground tasks). The runtime still owns the interrupt, watchdog, staged
   * prompt, and fresh `startTurn` accounting.
   */
  prepareSteerInterrupt?(): Promise<void>;
  interruptTurn?(): Promise<void>;
  controlGoal?(control: ThreadGoalControl): Promise<void>;
  /**
   * Close the provider's current canonical turn locally before a forced
   * process disposal. Implementations should complete any open items and mark
   * the turn cancelled without waiting for the provider transport.
   */
  forceCompleteTurn?(): void;
  resolveServerRequest?(requestId: ThreadServerRequestId, response: unknown): Promise<void>;
  /**
   * Swap the live session onto a new resolved MCP set (provider-level MCP
   * settings changed). Implementations restart or re-sync their backing
   * server; sessions without this hook pick the new set up on next launch.
   */
  updateMcpServers?(mcpServers: readonly ResolvedMcpServer[]): Promise<void>;
  readThread?(): Promise<ThreadHistory>;
  rollbackThread?(numTurns: number, config?: ThreadConfig): Promise<ThreadHistory>;
  setListener(listener: StructuredSessionListener): void;
  dispose(): Promise<void>;
}

export type ResolveExecutablePath = (command: string) => string | undefined;

export interface CreateStructuredSessionInput {
  threadId: string;
  projectLocation: ProjectLocation;
  config: ThreadConfig;
  agentSettings?: Record<string, boolean | string>;
  env?: Record<string, string>;
  mcpIdentity?: McpThreadIdentity;
  mcpServers?: readonly ResolvedMcpServer[];
  sessionRef?: SessionRef;
  presentationMode?: ThreadPresentationMode;
  loadSessionErrorRewriter?: (error: unknown, sessionId: string) => Error;
  /**
   * Provider-boundary guard for ACP agents that can incorrectly return a
   * successful `end_turn` without emitting any agent activity.
   */
  acpEmptyResponseErrorResolver?: AcpEmptyResponseErrorResolver;
  /**
   * Per-adapter hook to normalize a provider's ACP `session/update` wire
   * payload before the shared generic mapper consumes it. Use only to bridge
   * provider-specific quirks (e.g. Cursor's near-empty tool_call payloads) —
   * the shared mapper must remain provider-agnostic.
   */
  acpSessionUpdateTransform?: AcpSessionUpdateTransform;
  /**
   * Enable canonical goal lifecycle events for providers whose ACP server
   * implements the `/goal` command family. Kept opt-in so unsupported ACP
   * providers do not paint an optimistic goal dock for an unknown command.
   */
  acpGoalCommands?: boolean;
  /**
   * Translate a vendor ACP extension notification into a standard
   * `session/update` before canonical mapping. This is for providers that put
   * lifecycle boundaries on an extension method instead of the ACP stream.
   */
  acpExtensionSessionUpdateTransform?: AcpExtensionSessionUpdateTransform;
  /**
   * Handle vendor ACP extension notifications (e.g. Cursor's `cursor/task`)
   * that carry metadata absent from the standard `session/update` stream.
   */
  acpExtensionNotificationHandler?: AcpExtensionNotificationHandler;
}

export type AcpEmptyResponseErrorResolver = (input: {
  stopReason: string;
  stderr: readonly string[];
}) => Error | undefined;

export type AcpSessionUpdateTransform = (
  notification: import("@agentclientprotocol/sdk").SessionNotification,
) => import("@agentclientprotocol/sdk").SessionNotification;

export type AcpExtensionSessionUpdateTransform = (
  method: string,
  params: Record<string, unknown>,
) => import("@agentclientprotocol/sdk").SessionNotification | undefined;

export type AcpExtensionNotificationHandler = (
  method: string,
  params: Record<string, unknown>,
  ctx: {
    threadId: string;
    resolveToolCallItemId: (toolCallId: string) => string | undefined;
  },
) => import("@/shared/contracts").RuntimeEvent[];

export interface AgentArgvSpec {
  binary: string;
  args: string[];
  env?: Record<string, string>;
  sessionRef?: SessionRef;
  preferShell?: boolean;
  cleanup?: () => void;
}

export interface DetectProbeCtx {
  location: ProjectLocation;
  executablePath: string | undefined;
  version?: string | undefined;
  agentSettings?: Record<string, boolean | string>;
  /** {@link DetectionSpec.probeEnv}, so `capabilitiesProbe`/`statusProbe` can forward it. */
  probeEnv?: Record<string, string> | undefined;
}

export type AuthProbe = (ctx: DetectProbeCtx) => Promise<AuthState | undefined>;

export interface StatusProbeResult {
  authState?: AuthState;
  providerMetadata?: AgentProviderMetadata;
}

export type StatusProbe = (ctx: DetectProbeCtx) => Promise<StatusProbeResult | undefined>;

/**
 * Return shape for {@link DetectionSpec.capabilitiesProbe}. Bundles the
 * capability partial with optional ACP auth bits so a single ACP probe can
 * surface both `models/efforts/modes` and `authMethods/authLogoutSupported`
 * without round-tripping the agent twice.
 *
 * `authState` is the ACP-protocol-native auth signal: `"authenticated"` when
 * the probe's `newSession` call succeeded, `"missing"` when it returned the
 * `auth_required` JSON-RPC error. When set, `detectAgentInstall` honors it
 * over the spec's heuristic `authProbes` so post-logout state is reflected
 * without depending on env-var or config-dir checks the agent doesn't clear.
 */
export type CapabilitiesProbeResult = Partial<AgentCapability> & {
  authMethods?: AgentAuthMethod[];
  authLogoutSupported?: boolean;
  authState?: AuthState;
  providerMetadata?: AgentProviderMetadata;
  /** Prefer the terminal `loginCommand` over agent-owned auth methods in login UIs. */
  preferTerminalLogin?: boolean;
};

export interface DetectionSpec {
  kind: AgentKind;
  label: string;
  binary: string;
  /**
   * Optional WSL home used by providers whose official installer does not put
   * the binary on PATH. Detection checks `<home>/bin/<binary>` after
   * `command -v`, honoring the provider's distro-side home override.
   */
  wslBinaryHome?: {
    env: string;
    defaultSubpath: string;
  };
  loginCommand?: string | ((ctx: DetectProbeCtx) => string | undefined);
  capabilities: AgentCapability;
  update?: AgentUpdateInfo;
  versionArgs?: string[];
  /**
   * Env merged onto the `--version` probe spawn. Used to neutralize a CLI's own
   * background self-updater during detection — e.g. `command-code` spawns a
   * detached npm install on every invocation unless `COMMANDCODE_SKIP_UPDATES`
   * is set, which otherwise surfaces as a stray terminal window on app launch.
   * Also exposed to `capabilitiesProbe`/`statusProbe` via `DetectProbeCtx.probeEnv`
   * so they can forward it to their own `readAgentCommandOutput` calls.
   */
  probeEnv?: Record<string, string>;
  /** Provider-specific version probe for CLIs whose Windows shim cannot be spawned safely. */
  versionProbe?: (ctx: DetectProbeCtx) => Promise<string | undefined>;
  statusProbe?: StatusProbe;
  authProbes?: AuthProbe[];
  capabilitiesProbe?: (ctx: DetectProbeCtx) => Promise<CapabilitiesProbeResult | undefined>;
}

export interface AgentMetadata {
  kind: AgentKind;
  label: string;
  binary?: string;
  capabilities: AgentCapability;
  update?: AgentUpdateInfo;
  spawnEnv?: {
    native?: Record<string, string>;
    wsl?: Record<string, string>;
  };
}

export interface AgentLauncher {
  buildLaunchArgv(
    location: ProjectLocation,
    config: ThreadConfig,
    prompt: string,
    sessionRef?: SessionRef,
    launchOptions?: AgentLaunchOptions,
  ): AgentArgvSpec;
  buildResumeArgv(
    location: ProjectLocation,
    config: ThreadConfig,
    prompt: string,
    sessionRef: SessionRef,
    launchOptions?: AgentLaunchOptions,
  ): AgentArgvSpec;
  /**
   * Index at which hook-launch extra CLI args are inserted into the argv.
   * Omit to append at the end. Adapters whose CLIs read trailing tokens as
   * positionals (session id, prompt) return an index before them so
   * `--enable <feature>`-style flags stay in the option section.
   */
  extraArgsPosition?(args: string[], prompt: string, sessionRef?: SessionRef): number;
  /**
   * Rewrite the launch argv for per-thread config flags that must be folded
   * into an existing flag's payload instead of appended — e.g. Claude merges
   * ultracode / fast-mode into the hook plugin's `--settings` file because
   * the CLI keeps only the first `--settings` it sees. Return `args`
   * unchanged when nothing applies.
   */
  rewriteLaunchArgsForConfig?(
    args: string[],
    config: ThreadConfig,
    projectLocation: ProjectLocation,
  ): Promise<string[]>;
}

export interface AgentDetector {
  detectInstall(ctx?: AgentEnvContext): Promise<AgentStatus>;
  /**
   * Resolve the provider's signed-in account when it isn't part of the
   * detected status (e.g. Antigravity's credential sits in the OS keyring
   * behind its language server). `status` is the provider's freshest native
   * detection result (undefined when not installed). Implementations must
   * never trigger an interactive auth flow.
   */
  resolveAccount?(input: {
    status?: AgentStatus;
    wslDistros: string[];
  }): Promise<AgentProviderMetadata | undefined>;
}

/**
 * Optional contract implemented by ACP-speaking adapters so the supervisor can
 * spawn the agent in ACP mode for `authenticate()` / `logout()` calls
 * (separate from the long-running structured session). Each adapter knows the
 * exact flags + executable path resolution for its own binary; returning the
 * same CommandSpec used during `probeAcpCapabilities` keeps the auth handshake
 * consistent with detection.
 */
export interface AgentAcpAuth {
  buildAcpAuthCommand(ctx?: AgentEnvContext): Promise<CommandSpec | undefined>;
  buildAcpLogoutCommand?(ctx?: AgentEnvContext): Promise<CommandSpec | undefined>;
}

export interface AgentPromptFormatter {
  shouldDeferPromptToTerminal?(config: ThreadConfig): boolean;
  buildTerminalPreInputs?(config: ThreadConfig): string[][] | undefined;
  /** Translate a canonical goal control into the provider's native prompt command. */
  buildGoalControlPrompt?(control: ThreadGoalControl): string | undefined;
  buildDirectInput?(
    prompt: string,
    segments?: PromptSegment[],
    config?: ThreadConfig,
    projectLocation?: ProjectLocation,
  ): string[];
  formatPromptSegments?(segments: PromptSegment[]): string;
}

export interface AgentTerminalObserver {
  isReadyForInitialPrompt?(text: string): boolean;
  detectTerminalStatus?(text: string): TerminalStatusHint | null;
  /**
   * Spoof `TERM_PROGRAM=iTerm.app` in the agent PTY so the CLI emits iTerm2
   * OSC 9;4 progress sequences for L2 status detection. Suppressed while the
   * CLI hook plugin owns status (hook env injected and not disabled).
   * Partial-L1 adapters (`partialL1`) keep the spoof on unconditionally —
   * their hooks never emit a turn-finished event, so OSC stays load-bearing.
   */
  readonly spoofsIterm2StatusEnv?: boolean;
  shouldApplyTerminalStatusWhileHookActive?(hint: TerminalStatusHint): boolean;
  detectInvalidSessionRef?(text: string): boolean;
  detectAutoResponse?(text: string): string | null;
  workingSilenceTimeoutMs?: number | null;
  /**
   * Set `working` optimistically the moment the user submits a prompt to a live
   * terminal session, instead of waiting for a status signal. Command Code (and
   * any CLI whose hooks/OSC emit no turn-START event — it only has
   * PreToolUse/Stop) has no reliable `working` edge for a pure-text turn
   * otherwise; the authoritative `Stop` hook clears it back to `idle`. Only
   * honored while a CLI hook plugin is active (`cliHookEnvInjected`) so a
   * missing turn-finished signal can never strand the thread in `working`.
   */
  optimisticWorkingOnSubmit?: boolean;
  handleOscNotification?(notification: OscNotification): TerminalStatusHint | null;
  handleOscTitle?(title: OscTitle): TerminalStatusHint | null;
  handleOscShellEvent?(event: OscShellEvent): TerminalStatusHint | null;
  oscHintsDeferToHookPlugin?: boolean;
  syncConfigFromTerminalState?(input: SyncConfigFromTerminalStateInput): ThreadConfig | undefined;
}

export interface AgentSessionTracker {
  createInitialSessionRef(): SessionRef | undefined;
  createStructuredSession?(
    input: CreateStructuredSessionInput,
  ): Promise<StructuredSessionHandle | undefined>;
  discoverSessionRef?(location: ProjectLocation): Promise<SessionRef | undefined>;
  initialSessionRefDiscoveryDelayMs?: number;
  watchSessionRef?(location: ProjectLocation, onChanged: () => void): (() => void) | undefined;
}

export interface RunOneShotInput {
  location: ProjectLocation;
  model: string;
  effort?: string | undefined;
  /** Opus-only fast-mode session flag. Adapters that don't support it ignore it. */
  fast?: boolean | undefined;
  /** Allow only filesystem read/search/list tools inside the supplied workspace. */
  readOnlyWorkspace?: boolean | undefined;
  prompt: string;
  signal?: AbortSignal | undefined;
}

/** Input for {@link AgentOneShotRunner.buildSubagentOneShotCommand}. */
export interface SubagentOneShotCommandInput {
  model: string;
  effort?: string | undefined;
  prompt: string;
  /** Parent thread's project location — the child runs in this cwd (WSL-aware). */
  location: ProjectLocation;
}

export interface OneShotCommand {
  command: string;
  args: string[];
  stdin?: string;
  pty?: boolean;
  env?: Record<string, string>;
}

/**
 * A CLI invocation for a one-shot subagent child. Deliberately omits
 * `isolateCwd` (used by title/commit generation to avoid clobbering the session
 * cache): a subagent child MUST run in the parent's real project directory to do
 * useful work. Providers append their unlocked/bypass-permissions flag here (the
 * child has no interactive approval channel — it must never block waiting for
 * input).
 */
export type OneShotChildCommand = OneShotCommand;

export interface OneShotGenerationCommand extends OneShotCommand {
  isolateCwd?: boolean;
}

export interface OneShotGenerationOptions {
  /** The cwd is an isolated artifact workspace that must remain read-only. */
  readOnlyWorkspace?: boolean | undefined;
}

export interface AgentOneShotRunner {
  defaultOneShotModel?: string;
  /**
   * Build a bypass-permissions CLI invocation so an agent WITHOUT a structured
   * (GUI) runtime can still be spawned as a one-shot subagent child. Implemented
   * only by CLI-only providers (e.g. Command Code, Antigravity). Distinct from
   * {@link buildOneShotCommand} — that lane is read-only title/commit generation
   * and may isolate the cwd; this one runs real work in the project cwd with
   * permissions unlocked.
   */
  buildSubagentOneShotCommand?(input: SubagentOneShotCommandInput): OneShotChildCommand | undefined;
  buildOneShotCommand?(
    model: string,
    effort?: string,
    prompt?: string,
    location?: ProjectLocation,
    fast?: boolean,
    options?: OneShotGenerationOptions,
  ): OneShotGenerationCommand | undefined;
  runOneShot?(input: RunOneShotInput): Promise<string>;
  /**
   * Build a provider-enforced text-only one-shot invocation. Unlike the
   * general one-shot lane, this must disable every tool, MCP, plugin, and hook
   * surface rather than relying on prompt instructions or approval policy.
   */
  buildTextOnlyOneShotCommand?(
    model: string,
    effort?: string,
    prompt?: string,
    location?: ProjectLocation,
    fast?: boolean,
  ): OneShotGenerationCommand | undefined;
  /** Run a provider-enforced text-only one-shot through a structured runtime. */
  runTextOnlyOneShot?(input: RunOneShotInput): Promise<string>;
  buildContextExtractionCommand?(
    sessionRef: SessionRef,
    location: ProjectLocation,
    model?: string,
  ): { command: string; args: string[]; stdin?: string; env?: Record<string, string> } | undefined;
}

/**
 * Optional per-adapter contract for updating the installed agent binary in a
 * given environment (Windows / WSL distro). Adapters that wrap a CLI with a
 * built-in self-updater (e.g. `claude update`, `opencode upgrade`) return that
 * spec; others may return `undefined` to let the supervisor fall back to
 * package-manager detection (npm / brew / winget) or a re-run of the install
 * script.
 *
 * Commands are executed by the supervisor via the standard agent command
 * runner, so they inherit the same login-shell / WSL routing used for detection.
 */
export interface AgentUpdaterCommand {
  /** Executable name or absolute path (e.g. "claude", "npm", "brew"). */
  binary: string;
  args: string[];
  /** Optional environment overrides merged onto the parent process env. */
  env?: Record<string, string>;
  /** Strategy label surfaced to the renderer for telemetry / messaging. */
  strategy:
    | "built-in"
    | "npm-global"
    | "pnpm-global"
    | "bun-global"
    | "brew"
    | "winget"
    | "installer";
}

export interface AgentUpdater {
  /**
   * Build the update command for a given (env, installed-status) pair. Return
   * `undefined` to defer to the shared package-manager fallback.
   *
   * Implementations should be cheap — only synchronous probing or path
   * inspection. Heavy work (network, version comparison) lives in detect /
   * status probes.
   */
  buildUpdateCommand?(ctx: AgentEnvContext, status: AgentStatus): AgentUpdaterCommand | undefined;
}

export interface AgentCliHookPluginSupport {
  readonly pluginId: string;
  readonly pluginVersion: string;
  readonly minProtocolVersion: number;
  readonly partialL1?: boolean;
  isPluginSupported?(ctx: AgentEnvContext): Promise<boolean>;
  isPluginInstalled(ctx: AgentEnvContext): Promise<{ installed: boolean; version?: string }>;
  installPlugin(
    ctx: AgentEnvContext,
  ): Promise<{ ok: true; version: string } | { ok: false; reason: string }>;
  uninstallPlugin?(ctx: AgentEnvContext): Promise<void>;
  pluginLaunchExtras?(
    ctx: AgentEnvContext,
  ): Promise<{ args?: string[]; env?: Record<string, string> } | undefined>;
}

export interface AgentSkillRootSpec {
  readonly id: string;
  readonly label: string;
  readonly globalPath?: string;
  readonly projectPath?: string;
  /** Read-only provider-owned skills below this root, such as Codex `.system`. */
  readonly builtInPath?: string;
  /** Adapter-specific config root, such as a named Claude profile directory. */
  readonly globalBasePath?: string;
  readonly globalOverride?: {
    readonly env: string;
    readonly path: string;
  };
  /**
   * Minimum provider version that can follow a linked skill directory at this
   * projection root. Older or unknown versions receive a copied projection.
   */
  readonly linkProjectionFromVersion?: string;
}

export interface AgentSkillSupport {
  /** Provider-owned roots discovered by the Skills manager. `.agents/skills` is canonical. */
  readonly roots: readonly AgentSkillRootSpec[];
  /** Provider roots that need a Poracode-owned copy of canonical skills. */
  readonly projectionRoots?: readonly AgentSkillRootSpec[];
  /** How the provider invokes a named skill from its composer. */
  readonly invocation: "slash" | "dollar" | "prompt" | "skill";
  /** Provider-native duplicate resolution, using root ids plus canonical `agents`. */
  readonly precedence?: {
    readonly scopeOrder?: readonly ("global" | "project")[];
    readonly global?: readonly string[];
    readonly project?: readonly string[];
  };
}

export interface AgentAdapter
  extends
    AgentMetadata,
    AgentLauncher,
    AgentDetector,
    AgentPromptFormatter,
    AgentTerminalObserver,
    AgentSessionTracker,
    AgentOneShotRunner,
    AgentUpdater,
    Partial<AgentAcpAuth>,
    Partial<AgentCliHookPluginSupport> {
  readonly skillSupport?: AgentSkillSupport;
}

export interface TerminalStatusHint {
  status: ThreadStatus;
  attention: ThreadAttention;
  planMode?: boolean | undefined;
  approvalPolicy?: string | undefined;
  model?: string | undefined;
  effort?: string | undefined;
  corroborated?: boolean | undefined;
}

export interface SyncConfigFromTerminalStateInput {
  config: ThreadConfig;
  previousStatus: ThreadStatus;
  previousAttention: ThreadAttention;
  hint: TerminalStatusHint;
}

export interface HintEntry {
  re: RegExp;
  strong?: boolean;
}

export interface FindBestHintOptions {
  weakTailWindow?: number;
}
