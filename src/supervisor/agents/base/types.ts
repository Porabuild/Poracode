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
} from "@/shared/contracts";
import type { OscNotification, OscShellEvent, OscTitle } from "@/shared/osc";
import type { BrowserMcpHttpConfig } from "@/supervisor/agents/browserMcp";

export interface CommandSpec {
  command: string;
  args: string[];
  cwd?: string;
  sessionRef?: SessionRef;
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
   * Lightcode data base dir for native (non-WSL) plugin staging. Populated by
   * the supervisor so dev runs (`~/.lightcode-dev`) stage plugins separately
   * from prod (`~/.lightcode`). WSL plugin installs ignore this and stage
   * into the distro's `$HOME/.lightcode/` via `resolveWslHomeDirectoryAsync`.
   */
  baseDir?: string;
  browserMcpEnabled?: boolean;
  browserMcp?: BrowserMcpHttpConfig;
}

export interface AgentLaunchOptions {
  suppressResumeConfigOverrides?: boolean;
  resumeThreadId?: string;
  agentSettings?: Record<string, boolean | string>;
  browserMcp?: BrowserMcpHttpConfig;
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
  interruptTurn?(): Promise<void>;
  resolveServerRequest?(requestId: ThreadServerRequestId, response: unknown): Promise<void>;
  readThread?(): Promise<ThreadHistory>;
  rollbackThread?(numTurns: number): Promise<ThreadHistory>;
  setListener(listener: StructuredSessionListener): void;
  dispose(): Promise<void>;
}

export type ResolveExecutablePath = (command: string) => string | undefined;

export interface CreateStructuredSessionInput {
  threadId: string;
  projectLocation: ProjectLocation;
  config: ThreadConfig;
  agentSettings?: Record<string, boolean | string>;
  browserMcp?: BrowserMcpHttpConfig;
  sessionRef?: SessionRef;
  presentationMode?: ThreadPresentationMode;
  loadSessionErrorRewriter?: (error: unknown, sessionId: string) => Error;
  /**
   * Per-adapter hook to normalize a provider's ACP `session/update` wire
   * payload before the shared generic mapper consumes it. Use only to bridge
   * provider-specific quirks (e.g. Cursor's near-empty tool_call payloads) —
   * the shared mapper must remain provider-agnostic.
   */
  acpSessionUpdateTransform?: AcpSessionUpdateTransform;
}

export type AcpSessionUpdateTransform = (
  notification: import("@agentclientprotocol/sdk").SessionNotification,
) => import("@agentclientprotocol/sdk").SessionNotification;

export interface AgentArgvSpec {
  binary: string;
  args: string[];
  env?: Record<string, string>;
  sessionRef?: SessionRef;
  preferShell?: boolean;
}

export interface DetectProbeCtx {
  location: ProjectLocation;
  executablePath: string | undefined;
  version?: string | undefined;
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
};

export interface DetectionSpec {
  kind: AgentKind;
  label: string;
  binary: string;
  loginCommand?: string | ((ctx: DetectProbeCtx) => string | undefined);
  capabilities: AgentCapability;
  update?: AgentUpdateInfo;
  versionArgs?: string[];
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
}

export interface AgentDetector {
  detectInstall(ctx?: AgentEnvContext): Promise<AgentStatus>;
}

/**
 * Optional contract implemented by ACP-speaking adapters so the supervisor can
 * spawn the agent in ACP mode for `authenticate()` / `unstable_logout()` calls
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
  shouldApplyTerminalStatusWhileHookActive?(hint: TerminalStatusHint): boolean;
  detectInvalidSessionRef?(text: string): boolean;
  detectAutoResponse?(text: string): string | null;
  workingSilenceTimeoutMs?: number | null;
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
  prompt: string;
  signal?: AbortSignal | undefined;
}

export interface AgentOneShotRunner {
  defaultOneShotModel?: string;
  buildOneShotCommand?(
    model: string,
    effort?: string,
    prompt?: string,
  ):
    | { command: string; args: string[]; stdin?: string; isolateCwd?: boolean; pty?: boolean }
    | undefined;
  runOneShot?(input: RunOneShotInput): Promise<string>;
  buildContextExtractionCommand?(
    sessionRef: SessionRef,
    location: ProjectLocation,
    model?: string,
  ): { command: string; args: string[]; stdin?: string } | undefined;
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
    Partial<AgentCliHookPluginSupport> {}

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
