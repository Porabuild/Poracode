/**
 * Generic ACP driver — any user-registered binary that speaks standard ACP.
 *
 * Composes `AcpStructuredSession` (which talks ACP via stdio) with the shared
 * `acp/canonicalMapping.ts` mapper. **No new ACP code lives here** — this file
 * is purely configuration glue between an `AgentInstanceConfig` and the
 * existing ACP plumbing used by Copilot today.
 *
 * `createAcpGenericAdapter(instance)` returns an `AgentAdapter` the supervisor
 * can register directly or compose behind a first-class provider alias. ACP
 * Registry installs supply these instances through the shared installer.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import {
  acpGenericCommandForEnvironment,
  acpGenericKind,
  parseAcpGenericInstanceConfig,
  type AcpGenericCommandConfig,
  type AgentInstanceConfig,
  type AcpGenericInstanceConfig,
  type AgentCapability,
  type AgentStatus,
  type AuthState,
  type ProjectLocation,
} from "@/shared/contracts";
import {
  authenticateAcpAgent,
  createAcpStructuredSession,
  dedupeAcpAuthMethods,
  isAcpAgentAuthMethod,
  isAcpEnvVarAuthMethod,
  isAcpTerminalAuthMethod,
  logoutAcpAgent,
  probeAcpCapabilities,
  type AcpSessionBehavior,
  type AcpTextStreamExtension,
  type AcpProbeResult,
} from "../acp";
import {
  buildAgentCommand,
  batchWslCommandsAsync,
  quotePosixShellArg,
  type AgentAdapter,
  type AgentEnvContext,
  type CommandSpec,
  type CreateStructuredSessionInput,
} from "../base";
import { getAgentProbeCwd, resolveProbeSpawnCwd } from "../probeCwd";
import { applyAcpRegistryNpxArgsOverride } from "../acpRegistryNpx";
import { normalizeFactoryModels } from "../factory/detection";

/** First-time `npx` installs can exceed the default probe budget. */
export const REGISTRY_INSTALL_PROBE_TIMEOUT_MS = 90_000;

const GENERIC_ACP_DEFAULT_CAPABILITIES: AgentCapability = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: ["agent"],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: false,
  supportsDirectInput: true,
  liveInputMode: "server",
  presentationMode: "gui",
  presentationModes: ["gui"],
  settingDefs: [],
};

export interface AcpGenericAdapterOptions {
  kind?: string;
  label?: string;
  probeTimeoutMs?: number;
  normalizeProbeResult?: (result: AcpProbeResult) => AcpProbeResult;
  synthesizeApprovalPolicies?: boolean;
  sessionBehavior?: AcpSessionBehavior;
  /** Provider parser for agent-text quirks the shared canonical mapper must not own. */
  textStreamExtension?: AcpTextStreamExtension;
  /**
   * Provider parser for stderr diagnostics from agents that hold
   * `session/prompt` open while detached background work runs — see
   * `AcpStructuredSessionOptions.stderrTurnSignalParser`.
   */
  stderrTurnSignalParser?: (line: string) => "background-wait" | undefined;
}

export function createAcpGenericAdapter(
  instance: AgentInstanceConfig,
  options: AcpGenericAdapterOptions = {},
): AgentAdapter {
  const cfg = parseAcpGenericInstanceConfig(instance.config);
  const kind = options.kind ?? acpGenericKind(instance.id);
  const label = options.label ?? instance.displayName ?? cfg.binary;

  const capabilities: AgentCapability = {
    ...GENERIC_ACP_DEFAULT_CAPABILITIES,
    ...(cfg.capabilities?.models?.length
      ? { models: cfg.capabilities.models.map((m) => ({ id: m, label: m })) }
      : {}),
    ...(cfg.capabilities?.modes?.length
      ? { modes: cfg.capabilities.modes as AgentCapability["modes"] }
      : {}),
  };

  const adapter: AgentAdapter = {
    kind,
    label,
    binary: cfg.binary,
    capabilities,
    async detectInstall(ctx?: AgentEnvContext): Promise<AgentStatus> {
      const commandConfig = commandConfigForContext(cfg, ctx);
      const installed = commandConfig
        ? cfg.environmentCommands
          ? await isGenericCommandInstalled(commandConfig.binary, ctx)
          : isProbablyInstalled(commandConfig.binary)
        : false;
      const rawProbe = installed
        ? await probeGenericCapabilities(ctx, cfg, instance, label, options.probeTimeoutMs)
        : undefined;
      const normalizedProbe =
        rawProbe && options.normalizeProbeResult
          ? options.normalizeProbeResult(rawProbe)
          : rawProbe;
      const probeResult = normalizedProbe
        ? {
            ...normalizedProbe,
            ...(normalizedProbe.authMethods
              ? { authMethods: dedupeAcpAuthMethods(normalizedProbe.authMethods) }
              : {}),
          }
        : undefined;
      const authState: AuthState = resolveGenericAuthState(cfg, instance, probeResult, ctx);
      const loginCommand = commandConfig
        ? resolveGenericLoginCommand(commandConfig, probeResult)
        : undefined;
      const providerMetadata = resolveGenericProviderMetadata(probeResult);
      return {
        kind,
        label,
        installed,
        ...(instance.icon ? { icon: instance.icon } : {}),
        ...((commandConfig?.version ?? instance.version)
          ? { version: commandConfig?.version ?? instance.version }
          : {}),
        authState,
        ...(probeResult?.sessionEstablished ? { acpSessionEstablished: true } : {}),
        ...(loginCommand ? { loginCommand } : {}),
        ...(providerMetadata ? { providerMetadata } : {}),
        ...(probeResult?.authMethods ? { authMethods: probeResult.authMethods } : {}),
        ...(probeResult?.authLogoutSupported ? { authLogoutSupported: true } : {}),
        capabilities: mergeAcpProbeCapabilities(capabilities, probeResult, instance, {
          synthesizeApprovalPolicies: options.synthesizeApprovalPolicies !== false,
        }),
      };
    },
    buildLaunchArgv() {
      // Generic ACP is chat-only — there is no PTY launch path. Return an
      // argv that would fail loudly if invoked by the terminal-mode runtime,
      // but normal flow uses createStructuredSession instead.
      return { binary: cfg.binary, args: cfg.args ?? [] };
    },
    buildResumeArgv() {
      return { binary: cfg.binary, args: cfg.args ?? [] };
    },
    createInitialSessionRef() {
      return undefined;
    },
    async createStructuredSession(input: CreateStructuredSessionInput) {
      const command = buildGenericCommand(input.projectLocation, cfg, instance);
      return createAcpStructuredSession(command, input, {
        ...(options.sessionBehavior ? { behavior: options.sessionBehavior } : {}),
        ...(options.textStreamExtension
          ? { textStreamExtension: options.textStreamExtension }
          : {}),
        ...(options.stderrTurnSignalParser
          ? { stderrTurnSignalParser: options.stderrTurnSignalParser }
          : {}),
      });
    },
    async buildAcpAuthCommand(ctx?: AgentEnvContext) {
      const location = detectProbeLocation(ctx);
      return buildGenericCommand(location, cfg, instance);
    },
  };

  return adapter;
}

export async function authenticateAcpGenericInstance(
  instance: AgentInstanceConfig,
  methodId: string,
  ctx?: AgentEnvContext,
): Promise<void> {
  const cfg = parseAcpGenericInstanceConfig(instance.config);
  const location = detectProbeLocation(ctx);
  const command = buildGenericCommand(location, cfg, instance, authBrowserEnv(location));
  const processCwd = resolveProbeSpawnCwd(location, command.cwd);
  await authenticateAcpAgent(command.command, command.args, methodId, {
    ...(processCwd ? { processCwd } : {}),
    ...(command.env ? { env: command.env } : {}),
    label: instance.displayName ?? cfg.binary,
  });
}

export async function verifyAcpGenericAuthentication(
  instance: AgentInstanceConfig,
  ctx?: AgentEnvContext,
): Promise<boolean> {
  const cfg = parseAcpGenericInstanceConfig(instance.config);
  const result = await probeGenericCapabilities(
    ctx,
    cfg,
    instance,
    instance.displayName ?? cfg.binary,
  );
  return result?.authState === "authenticated";
}

export async function logoutAcpGenericInstance(
  instance: AgentInstanceConfig,
  ctx?: AgentEnvContext,
): Promise<void> {
  const cfg = parseAcpGenericInstanceConfig(instance.config);
  const location = detectProbeLocation(ctx);
  const command = buildGenericCommand(location, cfg, instance);
  const processCwd = resolveProbeSpawnCwd(location, command.cwd);
  await logoutAcpAgent(command.command, command.args, {
    ...(processCwd ? { processCwd } : {}),
    ...(command.env ? { env: command.env } : {}),
    label: instance.displayName ?? cfg.binary,
  });
}

function detectProbeLocation(ctx: AgentEnvContext | undefined): ProjectLocation {
  if (ctx?.envKind === "wsl" && ctx.wslDistro) {
    return {
      kind: "wsl",
      distro: ctx.wslDistro,
      linuxPath: "/",
      uncPath: "\\\\wsl$",
    };
  }
  if (process.platform === "win32") {
    return { kind: "windows", path: homedir() };
  }
  return { kind: "posix", path: homedir() };
}

export async function probeAcpGenericInstance(
  instance: AgentInstanceConfig,
  ctx?: AgentEnvContext,
  options?: { timeoutMs?: number },
): Promise<AcpProbeResult | undefined> {
  const cfg = parseAcpGenericInstanceConfig(instance.config);
  return probeGenericCapabilities(
    ctx,
    cfg,
    instance,
    instance.displayName ?? cfg.binary,
    options?.timeoutMs,
  );
}

async function probeGenericCapabilities(
  ctx: AgentEnvContext | undefined,
  cfg: AcpGenericInstanceConfig,
  instance: AgentInstanceConfig,
  label: string,
  timeoutMs?: number,
): Promise<AcpProbeResult | undefined> {
  const location = detectProbeLocation(ctx);
  const command = buildGenericCommand(location, cfg, instance);
  // On posix, route into the contained probe dir (TCC-safe); on WSL the linux
  // path is required by the agent; on Windows, keep the project's native path.
  const sessionCwd =
    location.kind === "wsl"
      ? location.linuxPath
      : location.kind === "windows"
        ? location.path
        : getAgentProbeCwd(location);
  const processCwd = resolveProbeSpawnCwd(location, command.cwd);
  return probeAcpCapabilities(command.command, command.args, sessionCwd, {
    ...(processCwd ? { processCwd } : {}),
    ...(command.env ? { env: command.env } : {}),
    label,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(ctx?.signal ? { signal: ctx.signal } : {}),
  });
}

function mergeAcpProbeCapabilities(
  capabilities: AgentCapability,
  probeResult: AcpProbeResult | undefined,
  instance: AgentInstanceConfig,
  options: { synthesizeApprovalPolicies: boolean },
): AgentCapability {
  if (!probeResult) return capabilities;
  const merged: AgentCapability = {
    ...capabilities,
    ...(probeResult.models
      ? { models: normalizeProviderModels(instance, probeResult.models) }
      : {}),
    ...(probeResult.efforts ? { efforts: probeResult.efforts } : {}),
    ...(probeResult.defaultEffort ? { defaultEffort: probeResult.defaultEffort } : {}),
    ...(probeResult.modelEfforts ? { modelEfforts: probeResult.modelEfforts } : {}),
    ...(probeResult.modelDefaultEfforts
      ? { modelDefaultEfforts: probeResult.modelDefaultEfforts }
      : {}),
    ...(probeResult.thinkingModels ? { thinkingModels: probeResult.thinkingModels } : {}),
    ...(probeResult.modes ? { modes: probeResult.modes } : {}),
    ...(probeResult.approvalPolicies ? { approvalPolicies: probeResult.approvalPolicies } : {}),
    ...(probeResult.slashCommands ? { slashCommands: probeResult.slashCommands } : {}),
    ...(probeResult.supportsResume !== undefined
      ? { supportsResume: probeResult.supportsResume }
      : {}),
  };
  const hasBypassApprovalPolicy = merged.approvalPolicies.some((policy) => policy.id === "never");
  const hasOnlyDefaultApprovalPolicy =
    merged.approvalPolicies.length === 1 && merged.approvalPolicies[0]?.id === "default";

  // Synthetic supervised/auto-approve policies when the ACP probe leaves us
  // without a real bypass mode. A protocol default mode can arrive here as a
  // single provider-named "default" policy; normalize it to Poracode's
  // two-state UI instead of showing a one-item dropdown.
  if (
    options.synthesizeApprovalPolicies &&
    !hasBypassApprovalPolicy &&
    (merged.approvalPolicies.length === 0 || hasOnlyDefaultApprovalPolicy) &&
    merged.modes.includes("agent")
  ) {
    merged.approvalPolicies = [
      { id: "default", label: "Supervised" },
      { id: "never", label: "Auto Approve" },
    ];
    merged.defaultApprovalPolicy = "never";
  }
  return merged;
}

function normalizeProviderModels(
  instance: AgentInstanceConfig,
  models: NonNullable<AcpProbeResult["models"]>,
): NonNullable<AcpProbeResult["models"]> {
  if (instance.id !== "factory-droid") {
    return models;
  }
  return normalizeFactoryModels(models);
}

function buildGenericCommand(
  location: ProjectLocation,
  cfg: AcpGenericInstanceConfig,
  instance: AgentInstanceConfig,
  extraEnv?: Record<string, string>,
): CommandSpec {
  const commandConfig = commandConfigForLocation(cfg, location);
  if (!commandConfig) {
    const environment = location.kind === "wsl" ? `WSL distro ${location.distro}` : "native host";
    throw new Error(
      `${instance.displayName ?? instance.id} is not installed for the ${environment}`,
    );
  }
  const args =
    commandConfig.binary === "npx"
      ? applyAcpRegistryNpxArgsOverride(instance.id, commandConfig.args ?? [])
      : (commandConfig.args ?? []);
  const env: Record<string, string> = { ...(commandConfig.env ?? {}), ...(extraEnv ?? {}) };
  if (instance.environment) {
    for (const [name, value] of Object.entries(instance.environment)) {
      env[name] = value.value;
    }
  }
  // For "fixed" cwd, mirror the existing wrapper but pass the override.
  // Generic ACP almost always wants the project cwd; the fixedCwd escape
  // hatch is rare.
  if (cfg.cwd === "fixed" && cfg.fixedCwd) {
    return {
      command: commandConfig.binary,
      args,
      cwd: cfg.fixedCwd,
      ...(Object.keys(env).length > 0 ? { env } : {}),
    };
  }
  return buildAgentCommand(location, commandConfig.binary, args, undefined, env);
}

function authBrowserEnv(location: ProjectLocation): Record<string, string> | undefined {
  if (location.kind !== "wsl") return undefined;
  return { BROWSER: 'cmd.exe /c start ""' };
}

function commandConfigForLocation(
  cfg: AcpGenericInstanceConfig,
  location: ProjectLocation,
): AcpGenericCommandConfig | undefined {
  return acpGenericCommandForEnvironment(
    cfg,
    location.kind === "wsl" ? { kind: "wsl", distro: location.distro } : { kind: "native" },
  );
}

function commandConfigForContext(
  cfg: AcpGenericInstanceConfig,
  ctx: AgentEnvContext | undefined,
): AcpGenericCommandConfig | undefined {
  return acpGenericCommandForEnvironment(
    cfg,
    ctx?.envKind === "wsl" && ctx.wslDistro
      ? { kind: "wsl", distro: ctx.wslDistro }
      : { kind: "native" },
  );
}

async function isGenericCommandInstalled(
  binary: string,
  ctx: AgentEnvContext | undefined,
): Promise<boolean> {
  if (ctx?.envKind === "wsl" && ctx.wslDistro) {
    const script = binary.startsWith("/")
      ? `test -x ${quotePosixShellArg(binary)}`
      : `command -v ${quotePosixShellArg(binary)} >/dev/null 2>&1`;
    const [result] = await batchWslCommandsAsync(ctx.wslDistro, [script], ctx.signal);
    return result?.ok === true;
  }
  return isProbablyInstalled(binary);
}

function isProbablyInstalled(binary: string): boolean {
  // Absolute path → check existence. Otherwise we can't easily probe without
  // platform-specific code; report as installed (true) and let the user catch
  // the failure on launch. Detection probes run on a hot path; we keep this
  // cheap.
  if (binary.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(binary)) {
    return existsSync(binary);
  }
  return true;
}

function resolveGenericAuthState(
  cfg: AcpGenericInstanceConfig,
  instance: AgentInstanceConfig,
  probeResult: AcpProbeResult | undefined,
  ctx: AgentEnvContext | undefined,
): AuthState {
  if (cfg.authMode === "envVar" && cfg.authEnvVar) {
    const value = instance.environment?.[cfg.authEnvVar]?.value ?? process.env[cfg.authEnvVar];
    return value && value.length > 0 ? "authenticated" : "missing";
  }
  if (probeResult?.authState === "missing") {
    return "missing";
  }
  if (
    probeResult?.authState === "authenticated" &&
    !probeResult.authMethods?.some(
      (method) => isAcpTerminalAuthMethod(method) || isAcpAgentAuthMethod(method),
    )
  ) {
    return "authenticated";
  }
  for (const method of probeResult?.authMethods ?? []) {
    if (!isAcpEnvVarAuthMethod(method)) continue;
    const requiredVars = method.vars.filter((variable) => variable.optional !== true);
    if (
      requiredVars.some(
        (variable) => !(instance.environment?.[variable.name]?.value ?? process.env[variable.name]),
      )
    ) {
      return "missing";
    }
    if (requiredVars.length > 0) {
      return "authenticated";
    }
  }
  // Interactive (browser/CLI) login state is per-env — a Windows browser
  // session does not carry over into a WSL distro, and vice versa. Trust
  // the persisted ack from our own `authenticate()` call rather than
  // inferring auth from `sessionEstablished` (some agents, e.g. Cline,
  // accept `newSession` without enforcing auth).
  if (isInteractiveAuthAcknowledged(instance, ctx)) {
    return "authenticated";
  }
  // ACP v1 exposes supported auth methods, not current auth state. A successful
  // session/new proves the agent is ready for a prompt, but agents may defer
  // credential validation until that prompt, so keep the state unknown.
  if (probeResult?.authState === "authenticated") {
    return "unknown";
  }
  if (
    probeResult?.authMethods?.some(
      (method) => isAcpTerminalAuthMethod(method) || isAcpAgentAuthMethod(method),
    )
  ) {
    return "missing";
  }
  return "unknown";
}

function isInteractiveAuthAcknowledged(
  instance: AgentInstanceConfig,
  ctx: AgentEnvContext | undefined,
): boolean {
  const ack = instance.authAcknowledged;
  if (!ack) return false;
  if (ctx?.envKind === "wsl" && ctx.wslDistro) {
    return ack.wsl?.[ctx.wslDistro] === true;
  }
  return ack.native === true;
}

function resolveGenericLoginCommand(
  command: AcpGenericCommandConfig,
  probeResult: AcpProbeResult | undefined,
): string | undefined {
  const terminalMethod = probeResult?.authMethods?.find(isAcpTerminalAuthMethod);
  if (!terminalMethod) return undefined;
  return [command.binary, ...(command.args ?? []), ...(terminalMethod.args ?? [])].join(" ");
}

function resolveGenericProviderMetadata(
  probeResult: AcpProbeResult | undefined,
): AgentStatus["providerMetadata"] | undefined {
  const methods = probeResult?.authMethods?.filter(isAcpEnvVarAuthMethod);
  if (!methods?.length) return undefined;
  return { authMethod: [...new Set(methods.map((method) => method.name))].join(", ") };
}
