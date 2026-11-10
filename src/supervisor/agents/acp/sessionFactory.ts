import {
  injectWslEnv,
  withCommandBaseSpawnEnv,
  type CommandSpec,
  type CreateStructuredSessionInput,
} from "../base";
import { directMcpProxyBypassEnv } from "./mcpProxyBypass";
import {
  AcpStructuredSession,
  buildAcpInitializeRequest,
  type AcpStructuredSessionOptions,
} from "./session";
import { acquireSharedAcpProcess, type AcpSharedProcessOptions } from "./sharedProcess";

/**
 * Decide whether `createAcpStructuredSession` should actually spawn the ACP
 * agent for this thread launch. Pulled out as a pure predicate so adapters
 * (and tests) can audit the contract without instantiating a real process.
 *
 *   - **Terminal resume** → `false`. The TUI re-attaches via its native flag
 *     (`--resume <id>`, `--session <id>`, etc.) and a parallel ACP session
 *     would just waste a process and confuse the renderer.
 *   - **GUI resume** → `true`. The structured session IS the chat surface,
 *     so it must stay live for the thread's whole lifetime; `openThread`
 *     calls `loadSession` to re-attach.
 *   - **Initial launch (any presentation)** → `true`. Even terminal threads
 *     use a short-lived ACP session to allocate the provider session id
 *     before the TUI takes over.
 */
export function shouldSpawnAcpSession(input: CreateStructuredSessionInput): boolean {
  if (input.sessionRef && input.presentationMode !== "gui") {
    return false;
  }
  return true;
}

export type AcpSessionOverrides = Pick<
  AcpStructuredSessionOptions,
  | "assumedMcpCapabilities"
  | "behavior"
  | "textStreamExtension"
  | "stderrTurnSignalParser"
  | "resolveMode"
  | "permissionRequestTransform"
  | "promptErrorReason"
  | "resolveModelConfig"
  | "configureOpenedSession"
  | "allowUnlistedSelectValue"
  | "promptSteering"
>;

/**
 * Resolve the spawn command shared by both ACP factories: the provider's
 * `baseSpawnEnv` lands on `command.env` (the one seam every location shares —
 * an ACP adapter must not have to repeat it on its own launch argv), command
 * env wins, the direct-MCP proxy bypass is applied where it can reach the
 * agent, and WSL exports ride inside the distro script.
 */
function resolveAcpLaunchCommand(
  acpCommand: CommandSpec,
  input: CreateStructuredSessionInput,
): CommandSpec {
  const mergedCommand = withCommandBaseSpawnEnv(acpCommand, input.baseSpawnEnv);
  // Direct HTTP/SSE MCP endpoints must bypass an HTTP proxy. For WSL the
  // bypass has to ride `command.env` so `injectWslEnv` exports it inside the
  // distro — vars on the `wsl.exe` process itself never cross. The proxy
  // check therefore sees only the env that actually reaches the agent:
  // `command.env` for WSL (Windows `process.env` does not cross either),
  // `process.env` merged with `command.env` for native locations.
  const bypassEnv = directMcpProxyBypassEnv(
    input.projectLocation.kind === "wsl"
      ? (mergedCommand.env ?? {})
      : { ...process.env, ...(mergedCommand.env ?? {}) },
    input.mcpServers,
  );
  const command = bypassEnv
    ? { ...mergedCommand, env: { ...(mergedCommand.env ?? {}), ...bypassEnv } }
    : mergedCommand;
  return command.env ? injectWslEnv(command, input.projectLocation, command.env) : command;
}

/** Map the launch input (plus adapter-declared overrides) onto session options. */
function buildAcpSessionOptions(
  input: CreateStructuredSessionInput,
  overrides?: AcpSessionOverrides,
): AcpStructuredSessionOptions {
  return {
    ...(input.additionalDirectories ? { additionalDirectories: input.additionalDirectories } : {}),
    ...(input.loadSessionErrorRewriter
      ? { loadSessionErrorRewriter: input.loadSessionErrorRewriter }
      : {}),
    ...(input.acpEmptyResponseErrorResolver
      ? { emptyResponseErrorResolver: input.acpEmptyResponseErrorResolver }
      : {}),
    ...(input.acpSessionUpdateTransform
      ? { sessionUpdateTransform: input.acpSessionUpdateTransform }
      : {}),
    ...(input.acpGoalCommands ? { goalCommands: true } : {}),
    ...(input.acpExtensionSessionUpdateTransform
      ? { extensionSessionUpdateTransform: input.acpExtensionSessionUpdateTransform }
      : {}),
    ...(input.acpInitializeMeta ? { initializeMeta: input.acpInitializeMeta } : {}),
    ...(input.acpClientCapabilitiesMeta
      ? { clientCapabilitiesMeta: input.acpClientCapabilitiesMeta }
      : {}),
    ...(input.acpExtensionNotificationHandler
      ? { extensionNotificationHandler: input.acpExtensionNotificationHandler }
      : {}),
    ...(input.acpExtensionRequestHandler
      ? { extensionRequestHandler: input.acpExtensionRequestHandler }
      : {}),
    ...(input.acpExtensionRequestTimeoutMs !== undefined
      ? { extensionRequestTimeoutMs: input.acpExtensionRequestTimeoutMs }
      : {}),
    ...(input.acpSessionActions ? { sessionActions: input.acpSessionActions } : {}),
    ...(input.acpBooleanConfigOptions ? { booleanConfigOptions: true } : {}),
    ...(input.acpConfigOptionsNormalizer
      ? { configOptionsNormalizer: input.acpConfigOptionsNormalizer }
      : {}),
    ...(input.mcpServers !== undefined ? { mcpServers: input.mcpServers } : {}),
    ...(input.acpOptimisticMcpTransports
      ? { optimisticMcpTransports: input.acpOptimisticMcpTransports }
      : {}),
    ...(input.acpFsAgentHomeDirs ? { fsAgentHomeDirs: input.acpFsAgentHomeDirs } : {}),
    ...(input.acpFsTextCapability !== undefined
      ? { fsTextCapability: input.acpFsTextCapability }
      : {}),
    ...(input.acpTerminalCapability !== undefined
      ? { terminalCapability: input.acpTerminalCapability }
      : {}),
    ...(input.acpLocalResourceResolution !== undefined
      ? { localResourceResolution: input.acpLocalResourceResolution }
      : {}),
    ...(input.acpElicitationPresentation
      ? { projectElicitationPresentation: input.acpElicitationPresentation }
      : {}),
    ...(overrides?.assumedMcpCapabilities
      ? { assumedMcpCapabilities: overrides.assumedMcpCapabilities }
      : {}),
    ...(overrides?.resolveMode ? { resolveMode: overrides.resolveMode } : {}),
    ...(overrides?.permissionRequestTransform
      ? { permissionRequestTransform: overrides.permissionRequestTransform }
      : {}),
    ...(overrides?.resolveModelConfig ? { resolveModelConfig: overrides.resolveModelConfig } : {}),
    ...(overrides?.behavior ? { behavior: overrides.behavior } : {}),
    ...(overrides?.textStreamExtension
      ? { textStreamExtension: overrides.textStreamExtension }
      : {}),
    ...(overrides?.stderrTurnSignalParser
      ? { stderrTurnSignalParser: overrides.stderrTurnSignalParser }
      : {}),
    ...(overrides?.configureOpenedSession
      ? { configureOpenedSession: overrides.configureOpenedSession }
      : {}),
    ...(overrides?.allowUnlistedSelectValue
      ? { allowUnlistedSelectValue: overrides.allowUnlistedSelectValue }
      : {}),
    ...(overrides?.promptSteering ? { promptSteering: overrides.promptSteering } : {}),
    ...(overrides?.promptErrorReason ? { promptErrorReason: overrides.promptErrorReason } : {}),
  };
}

/**
 * Create an ACP structured session for the given adapter command.
 *
 * Agent adapters call this from their `createStructuredSession()` method,
 * passing the ACP-mode command (e.g. `gemini --acp`, `copilot --acp --stdio`).
 *
 * The factory owns the resume/presentation gating via {@link shouldSpawnAcpSession}
 * so every ACP-speaking provider behaves identically. Adapters should NOT add
 * their own `if (input.sessionRef) return undefined` gate — that's what
 * produced the Copilot GUI-resume regression. Just call this factory
 * unconditionally and trust the shared decision.
 *
 * `overrides` carries the few session options an adapter states about its own
 * agent rather than reading off the launch input.
 */
export function createAcpStructuredSession(
  acpCommand: CommandSpec,
  input: CreateStructuredSessionInput,
  overrides?: AcpSessionOverrides,
): AcpStructuredSession | undefined {
  // The TUI handoff has no approved-root argv contract. Do not silently lose grants.
  if (input.additionalDirectories?.length && input.presentationMode !== "gui") {
    throw new Error("Additional workspace directories require a structured GUI session.");
  }
  if (!shouldSpawnAcpSession(input)) {
    return undefined;
  }
  return AcpStructuredSession.create(
    resolveAcpLaunchCommand(acpCommand, input),
    input.projectLocation,
    input.threadId,
    buildAcpSessionOptions(input, overrides),
  );
}

/**
 * Create an ACP structured session on a pooled shared agent process. Threads
 * whose launch identity (scope, command, env, initialize request, and
 * `shared.prepare.key`) matches an already-running process attach to it as a
 * new ACP session instead of spawning another agent.
 *
 * Only native local launches may share: WSL commands embed per-thread env in
 * their argv and cloud relays are single-session, so both keep the dedicated
 * {@link createAcpStructuredSession} path.
 */
export async function createSharedAcpStructuredSession(
  acpCommand: CommandSpec,
  input: CreateStructuredSessionInput,
  shared: AcpSharedProcessOptions,
  overrides?: AcpSessionOverrides,
): Promise<AcpStructuredSession | undefined> {
  if (input.projectLocation.kind === "wsl") {
    throw new Error("Shared ACP agent processes require a native project location.");
  }
  // The TUI handoff has no approved-root argv contract. Do not silently lose grants.
  if (input.additionalDirectories?.length && input.presentationMode !== "gui") {
    throw new Error("Additional workspace directories require a structured GUI session.");
  }
  if (!shouldSpawnAcpSession(input)) {
    return undefined;
  }
  const command = resolveAcpLaunchCommand(acpCommand, input);
  const options = buildAcpSessionOptions(input, overrides);
  const lease = await acquireSharedAcpProcess({
    options: shared,
    command,
    initializeRequest: buildAcpInitializeRequest({
      fsTextCapability: options.fsTextCapability !== false,
      terminalCapability: options.terminalCapability !== false,
      booleanConfigOptions: options.booleanConfigOptions === true,
      ...(options.clientCapabilitiesMeta
        ? { clientCapabilitiesMeta: options.clientCapabilitiesMeta }
        : {}),
      ...(options.initializeMeta ? { initializeMeta: options.initializeMeta } : {}),
    }),
    suppressStderrLogging: options.behavior?.suppressStderrLogging === true,
  });
  try {
    return AcpStructuredSession.createShared(lease, input.projectLocation, input.threadId, options);
  } catch (error) {
    await lease.release();
    throw error;
  }
}
