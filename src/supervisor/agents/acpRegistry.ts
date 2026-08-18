import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { copyFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { writeFileAtomic } from "@/shared/atomicFile";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import {
  acpGenericKind,
  acpRegistryListResultSchema,
  type AcpRegistryAgent,
  type AcpRegistryListResult,
  type AgentInstanceConfig,
  type AgentInstanceEnvVar,
  type AgentKind,
  type InstalledAcpRegistryAgent,
} from "@/shared/contracts";
import {
  defaultSharedSettings,
  normalizeSharedSettings,
  type SharedSettings,
} from "@/shared/settings";
import { downloadToFile } from "../runtime/download";
import { decryptSecret, encryptSecret, transformSensitiveAgentSecrets } from "../secretStorage";
import { probeAcpGenericInstance, REGISTRY_INSTALL_PROBE_TIMEOUT_MS } from "./acp-generic";
import { cacheAcpRegistryIcon, isRemoteIconUrl } from "./acpRegistryIcons";
import {
  applyAcpRegistryNpxArgsOverride,
  buildNpxPrefetchArgs,
  clearNpxExecutionCache,
  isNpxCacheCorruptionError,
} from "./acpRegistryNpx";
import {
  ACP_REGISTRY_INSTALL_DIR,
  acpRegistryAgentInstallDir,
  removeAcpRegistryInstallDir,
} from "./acpRegistryInstallDir";
import { buildAgentCommand, type AgentEnvContext } from "./base";

const execFileAsync = promisify(execFile);

const ACP_REGISTRY_URL = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";

export async function fetchAcpRegistry(): Promise<AcpRegistryListResult> {
  const response = await fetch(ACP_REGISTRY_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch ACP registry: HTTP ${response.status}`);
  }
  return acpRegistryListResultSchema.parse(await response.json());
}

/**
 * Cache every (agentId, iconUrl) pair in parallel and return the resolved
 * `poracode-local://` (or unchanged, on download failure) URL per agent.
 * Without the parallelism N installed agents become N serial CDN fetches;
 * with it total wall-clock is one round-trip.
 */
async function resolveAcpIcons(
  iconsToResolve: { agentId: string; iconUrl: string }[],
  iconsDir: string,
): Promise<Map<string, string>> {
  const resolvedIconByAgentId = new Map<string, string>();
  await Promise.all(
    iconsToResolve.map(async ({ agentId, iconUrl }) => {
      resolvedIconByAgentId.set(
        agentId,
        await cacheAcpRegistryIcon({ iconUrl, agentId, iconsDir }),
      );
    }),
  );
  return resolvedIconByAgentId;
}

/**
 * Write resolved icon URLs back onto both the installed-agent records and the
 * acp-generic instances, keyed by agent id. Returns whether anything changed
 * so callers can skip an invalidate/refresh when every icon already matched.
 */
function applyResolvedAcpIcons(
  settingsPath: string,
  settings: SharedSettings,
  resolvedIconByAgentId: Map<string, string>,
): boolean {
  let changed = false;

  const installedAgents = { ...settings.acpRegistryInstalledAgents };
  for (const [id, record] of Object.entries(installedAgents)) {
    const cachedUrl = resolvedIconByAgentId.get(id);
    if (!cachedUrl || record.icon === cachedUrl) continue;
    installedAgents[id] = { ...record, icon: cachedUrl };
    changed = true;
  }

  const instances = { ...settings.agentInstances };
  for (const [id, instance] of Object.entries(instances)) {
    if (instance.driver !== "acp-generic") continue;
    const cachedUrl = resolvedIconByAgentId.get(id);
    if (!cachedUrl || instance.icon === cachedUrl) continue;
    instances[id] = { ...instance, icon: cachedUrl };
    changed = true;
  }

  if (!changed) return false;
  writeAcpRegistrySettings(settingsPath, {
    ...settings,
    acpRegistryInstalledAgents: installedAgents,
    agentInstances: instances,
  });
  return true;
}

/**
 * Collect the acp-generic agents whose icon needs (re)caching, deduped by id
 * across both the installed-agent records and the agent instances. `pickIconUrl`
 * chooses the source URL per agent — the registry icon for a backfill, or the
 * already-stored URL for a launch-time localize — and returns undefined to skip.
 */
function collectAcpIconsToResolve(
  settings: SharedSettings,
  pickIconUrl: (agentId: string, storedIcon: string | undefined) => string | undefined,
): { agentId: string; iconUrl: string }[] {
  const iconsToResolve: { agentId: string; iconUrl: string }[] = [];
  const seen = new Set<string>();
  const consider = (agentId: string, storedIcon: string | undefined) => {
    if (seen.has(agentId)) return;
    const iconUrl = pickIconUrl(agentId, storedIcon);
    if (!iconUrl) return;
    seen.add(agentId);
    iconsToResolve.push({ agentId, iconUrl });
  };
  for (const [id, record] of Object.entries(settings.acpRegistryInstalledAgents)) {
    consider(id, record.icon);
  }
  for (const [id, instance] of Object.entries(settings.agentInstances)) {
    if (instance.driver !== "acp-generic") continue;
    consider(id, instance.icon);
  }
  return iconsToResolve;
}

export async function backfillAcpRegistryAgentIcons(input: {
  registry: AcpRegistryListResult;
  settingsPath: string;
  iconsDir: string;
}): Promise<boolean> {
  const settings = readAcpRegistrySettings(input.settingsPath);
  const agentsById = new Map(input.registry.agents.map((agent) => [agent.id, agent]));
  const iconsToResolve = collectAcpIconsToResolve(settings, (id) => agentsById.get(id)?.icon);
  const resolved = await resolveAcpIcons(iconsToResolve, input.iconsDir);
  return applyResolvedAcpIcons(input.settingsPath, settings, resolved);
}

/**
 * Launch-time icon repair: convert any installed acp-generic icon still
 * pointing at a remote CDN URL to a locally-cached `poracode-local://` URL,
 * using the URL already stored in settings — no registry fetch. An install
 * that ran offline (or predates icon caching) otherwise re-fetches the icon
 * over the network on every start, which flickers the sidebar rows until the
 * round-trip completes. Once every icon is local this is a no-op with zero
 * network. Offline downloads fail soft (the URL is left unchanged), so it
 * simply retries on the next launch.
 */
export async function cacheLocalAcpRegistryIcons(input: {
  settingsPath: string;
  iconsDir: string;
}): Promise<boolean> {
  const settings = readAcpRegistrySettings(input.settingsPath);
  const iconsToResolve = collectAcpIconsToResolve(settings, (_id, storedIcon) =>
    storedIcon && isRemoteIconUrl(storedIcon) ? storedIcon : undefined,
  );
  if (iconsToResolve.length === 0) return false;

  const resolved = await resolveAcpIcons(iconsToResolve, input.iconsDir);
  return applyResolvedAcpIcons(input.settingsPath, settings, resolved);
}

export function readAcpRegistrySettings(settingsPath: string): SharedSettings {
  try {
    return transformSensitiveAgentSecrets(
      normalizeSharedSettings(JSON.parse(readFileSync(settingsPath, "utf8"))),
      dirname(settingsPath),
      decryptSecret,
      ({ instanceId, variableName }) => {
        console.warn(
          `[agents] could not decrypt ${variableName} for ${instanceId}; omitting the unusable secret`,
        );
      },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[agents] failed to read registry settings, using defaults:", error);
    }
    return { ...defaultSharedSettings };
  }
}

function writeAcpRegistrySettings(settingsPath: string, settings: SharedSettings): void {
  const encrypted = transformSensitiveAgentSecrets(settings, dirname(settingsPath), encryptSecret);
  writeFileAtomic(settingsPath, JSON.stringify(encrypted, null, 2), { encoding: "utf8" });
}

function registryInstallRecord(
  agent: AcpRegistryAgent,
  adapterKind: AgentKind,
  installKind: InstalledAcpRegistryAgent["installKind"],
): InstalledAcpRegistryAgent {
  return {
    id: agent.id,
    name: agent.name,
    version: agent.version,
    ...(agent.icon ? { icon: agent.icon } : {}),
    installedAt: new Date().toISOString(),
    adapterKind,
    installKind,
  };
}

function packageInstance(agent: AcpRegistryAgent, command: "npx" | "uvx"): AgentInstanceConfig {
  const dist = agent.distribution[command];
  if (!dist) {
    throw new Error(`${agent.name} does not have a ${command} distribution`);
  }
  const env = dist.env
    ? Object.fromEntries(
        Object.entries(dist.env).map(([key, value]) => [key, { value, sensitive: false }]),
      )
    : undefined;
  const distArgs =
    command === "npx"
      ? applyAcpRegistryNpxArgsOverride(agent.id, dist.args ?? [])
      : (dist.args ?? []);
  return {
    id: agent.id,
    driver: "acp-generic",
    displayName: agent.name,
    version: agent.version,
    ...(agent.icon ? { icon: agent.icon } : {}),
    enabled: true,
    ...(env ? { environment: env } : {}),
    config: {
      binary: command,
      args: command === "npx" ? ["-y", dist.package, ...distArgs] : [dist.package, ...distArgs],
      cwd: "project",
      authMode: "none",
    },
  };
}

function currentBinaryTarget(): string {
  const os =
    process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "windows" : "linux";
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  return `${os}-${arch}`;
}

function archiveFileName(url: string): string {
  try {
    return basename(new URL(url).pathname) || "download";
  } catch {
    return "download";
  }
}

async function extractArchive(archivePath: string, installDir: string): Promise<void> {
  if (archivePath.endsWith(".zip")) {
    if (process.platform === "win32") {
      await execFileAsync(
        "powershell.exe",
        [
          "-NoLogo",
          "-NoProfile",
          "-Command",
          "Expand-Archive -LiteralPath $env:PORACODE_ACP_ARCHIVE_PATH -DestinationPath $env:PORACODE_ACP_INSTALL_DIR -Force",
        ],
        {
          windowsHide: true,
          env: {
            ...process.env,
            PORACODE_ACP_ARCHIVE_PATH: archivePath,
            PORACODE_ACP_INSTALL_DIR: installDir,
          },
        },
      );
    } else {
      await execFileAsync("unzip", ["-q", "-o", archivePath, "-d", installDir], {
        windowsHide: true,
      });
    }
    return;
  }

  if (
    archivePath.endsWith(".tar.gz") ||
    archivePath.endsWith(".tgz") ||
    archivePath.endsWith(".tar.bz2") ||
    archivePath.endsWith(".tbz2")
  ) {
    await execFileAsync("tar", ["-xf", archivePath, "-C", installDir], { windowsHide: true });
    return;
  }
}

function resolveInstalledCommandPath(installDir: string, cmd: string): string {
  return join(installDir, ...cmd.replace(/^\.\//, "").split("/"));
}

async function binaryInstance(
  agent: AcpRegistryAgent,
  baseDir: string,
): Promise<AgentInstanceConfig> {
  const targetName = currentBinaryTarget();
  const target = agent.distribution.binary?.[targetName];
  if (!target) {
    throw new Error(`${agent.name} does not publish a binary for ${targetName}`);
  }

  const rootDir = join(baseDir, ACP_REGISTRY_INSTALL_DIR, agent.id, agent.version);
  const installDir = join(rootDir, "bin");
  await removeAcpRegistryInstallDir(installDir);
  mkdirSync(installDir, { recursive: true });

  const archiveName = archiveFileName(target.archive);
  const archivePath = join(rootDir, archiveName);
  await downloadToFile(target.archive, archivePath);
  await extractArchive(archivePath, installDir);

  const commandPath = resolveInstalledCommandPath(installDir, target.cmd);
  if (!existsSync(commandPath)) {
    copyFileSync(archivePath, commandPath);
  }
  if (process.platform !== "win32") {
    chmodSync(commandPath, 0o755);
  }

  const env = target.env
    ? Object.fromEntries(
        Object.entries(target.env).map(([key, value]) => [key, { value, sensitive: false }]),
      )
    : undefined;
  return {
    id: agent.id,
    driver: "acp-generic",
    displayName: agent.name,
    version: agent.version,
    ...(agent.icon ? { icon: agent.icon } : {}),
    enabled: true,
    ...(env ? { environment: env } : {}),
    config: {
      binary: commandPath,
      args: target.args ?? [],
      cwd: "project",
      authMode: "none",
    },
  };
}

async function genericInstance(
  agent: AcpRegistryAgent,
  baseDir: string,
): Promise<AgentInstanceConfig> {
  if (agent.distribution.npx) return packageInstance(agent, "npx");
  if (agent.distribution.uvx) return packageInstance(agent, "uvx");
  if (agent.distribution.binary) return binaryInstance(agent, baseDir);
  throw new Error(`${agent.name} does not include a supported distribution`);
}

/**
 * Merge a freshly-built instance over any existing one: registry defaults win
 * for non-sensitive env vars, while user-saved secrets and per-env login acks
 * carry forward so update/reinstall doesn't silently clear credentials.
 */
function mergeRegistryInstance(
  built: AgentInstanceConfig,
  existing: AgentInstanceConfig | undefined,
): AgentInstanceConfig {
  if (!existing) return built;
  const mergedEnv: Record<string, AgentInstanceEnvVar> = { ...(built.environment ?? {}) };
  for (const [key, value] of Object.entries(existing.environment ?? {})) {
    if (value.sensitive || !(key in mergedEnv)) {
      mergedEnv[key] = value;
    }
  }
  const hasEnv = Object.keys(mergedEnv).length > 0;
  const next: AgentInstanceConfig = { ...built };
  if (hasEnv) {
    next.environment = mergedEnv;
  } else {
    delete next.environment;
  }
  if (existing.authAcknowledged) {
    next.authAcknowledged = existing.authAcknowledged;
  }
  return next;
}

function nativeInstallLocation():
  | { kind: "windows"; path: string }
  | { kind: "posix"; path: string } {
  return {
    kind: process.platform === "win32" ? "windows" : "posix",
    path: homedir(),
  };
}

async function prefetchNpxDistribution(agent: AcpRegistryAgent): Promise<void> {
  const dist = agent.distribution.npx;
  if (!dist) return;
  const spec = buildAgentCommand(
    nativeInstallLocation(),
    "npx",
    buildNpxPrefetchArgs(dist),
    undefined,
    dist.env ? { ...dist.env } : undefined,
  );
  const execOptions = {
    timeout: 120_000,
    windowsHide: true,
    ...(spec.cwd ? { cwd: spec.cwd } : {}),
    ...(spec.env ? { env: { ...process.env, ...spec.env } } : {}),
  };

  const runPrefetch = () => execFileAsync(spec.command, spec.args, execOptions);

  try {
    await runPrefetch();
  } catch (error) {
    if (isNpxCacheCorruptionError(error)) {
      try {
        clearNpxExecutionCache();
        await runPrefetch();
        return;
      } catch (retryError) {
        console.warn(
          `[acp-registry] npx prefetch failed for ${agent.id} after cache reset:`,
          retryError instanceof Error ? retryError.message : String(retryError),
        );
        return;
      }
    }
    console.warn(
      `[acp-registry] npx prefetch failed for ${agent.id}:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Warm an ACP registry install: prefetch `npx` packages, then run a capability
 * probe so auth methods are known before the settings UI renders.
 */
async function warmRegistryInstall(
  agent: AcpRegistryAgent,
  instance: AgentInstanceConfig,
): Promise<void> {
  if (agent.distribution.npx) {
    await prefetchNpxDistribution(agent);
  }
  try {
    await probeAcpGenericInstance(instance, undefined, {
      timeoutMs: REGISTRY_INSTALL_PROBE_TIMEOUT_MS,
    });
  } catch (error) {
    console.warn(
      `[acp-registry] install probe failed for ${agent.id}:`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function installAcpRegistryAgent(input: {
  agentId: string;
  baseDir: string;
  settingsPath: string;
  iconsDir: string;
  registry?: AcpRegistryListResult;
}): Promise<InstalledAcpRegistryAgent[]> {
  const registry = input.registry ?? (await fetchAcpRegistry());
  const agent = registry.agents.find((entry) => entry.id === input.agentId);
  if (!agent) {
    throw new Error(`ACP registry agent not found: ${input.agentId}`);
  }

  // Cache the icon to disk so settings stores a `poracode-local://` URL
  // rather than the upstream CDN URL — the renderer can then paint the icon
  // synchronously on every app start.
  const cachedIcon = agent.icon
    ? await cacheAcpRegistryIcon({
        iconUrl: agent.icon,
        agentId: agent.id,
        iconsDir: input.iconsDir,
      })
    : undefined;
  const cachedAgent: AcpRegistryAgent = { ...agent, ...(cachedIcon ? { icon: cachedIcon } : {}) };

  const settings = readAcpRegistrySettings(input.settingsPath);
  const built = await genericInstance(cachedAgent, input.baseDir);
  const instance = mergeRegistryInstance(built, settings.agentInstances[agent.id]);
  settings.agentInstances = { ...settings.agentInstances, [agent.id]: instance };
  settings.acpRegistryInstalledAgents = {
    ...settings.acpRegistryInstalledAgents,
    [agent.id]: registryInstallRecord(cachedAgent, acpGenericKind(agent.id), "generic"),
  };
  writeAcpRegistrySettings(input.settingsPath, settings);
  await warmRegistryInstall(agent, instance);
  return Object.values(settings.acpRegistryInstalledAgents);
}

export async function updateAcpRegistryAgent(input: {
  agentId: string;
  baseDir: string;
  settingsPath: string;
  iconsDir: string;
  registry?: AcpRegistryListResult;
}): Promise<InstalledAcpRegistryAgent[]> {
  const settings = readAcpRegistrySettings(input.settingsPath);
  if (!settings.agentInstances[input.agentId]) {
    throw new Error(`ACP registry agent is not installed: ${input.agentId}`);
  }
  return installAcpRegistryAgent(input);
}

/**
 * Refresh every installed ACP registry agent whose registry version differs
 * from the locally-recorded version. Best-effort: individual update failures
 * (e.g. binary download errors) are swallowed so listing the registry stays
 * resilient — the user can retry manually from the settings UI.
 */
export async function autoUpdateAcpRegistryAgents(input: {
  registry: AcpRegistryListResult;
  baseDir: string;
  settingsPath: string;
  iconsDir: string;
}): Promise<{ updated: string[]; failed: { id: string; error: string }[] }> {
  const settings = readAcpRegistrySettings(input.settingsPath);
  const agentsById = new Map(input.registry.agents.map((agent) => [agent.id, agent]));
  const updated: string[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const [id, record] of Object.entries(settings.acpRegistryInstalledAgents)) {
    const agent = agentsById.get(id);
    if (!agent) continue;
    const instance = settings.agentInstances[id];
    const configuredArgs =
      instance?.driver === "acp-generic" &&
      typeof instance.config === "object" &&
      instance.config !== null &&
      "args" in instance.config &&
      Array.isArray(instance.config.args)
        ? instance.config.args
        : [];
    const correctedArgs = applyAcpRegistryNpxArgsOverride(id, configuredArgs);
    if (record.version === agent.version && correctedArgs === configuredArgs) continue;
    try {
      await installAcpRegistryAgent({
        agentId: id,
        baseDir: input.baseDir,
        settingsPath: input.settingsPath,
        iconsDir: input.iconsDir,
        registry: input.registry,
      });
      updated.push(id);
    } catch (error) {
      failed.push({ id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { updated, failed };
}

export async function removeAcpRegistryAgent(input: {
  agentId: string;
  baseDir: string;
  settingsPath: string;
}): Promise<InstalledAcpRegistryAgent[]> {
  const settings = readAcpRegistrySettings(input.settingsPath);
  const agentKind = acpGenericKind(input.agentId);

  const nextInstalled = { ...settings.acpRegistryInstalledAgents };
  delete nextInstalled[input.agentId];
  const nextInstances = { ...settings.agentInstances };
  delete nextInstances[input.agentId];

  const nextProviderConfigs = { ...settings.providerConfigs };
  delete nextProviderConfigs[agentKind];
  const nextLastPresentation = { ...settings.lastPresentationModeByAgent };
  delete nextLastPresentation[agentKind];
  const nextAgentSettings = { ...settings.agentSettings };
  delete nextAgentSettings[agentKind];
  const nextHiddenModels = { ...settings.hiddenModels };
  delete nextHiddenModels[agentKind];
  const nextDisabledAgents = settings.disabledAgents.filter((k) => k !== agentKind);
  const nextFavoriteModels = settings.favoriteModels.filter((m) => m.agentKind !== agentKind);
  const nextRecentModels = settings.recentModels.filter((m) => m.agentKind !== agentKind);
  const nextHookSupport = { ...settings.agentHookSupport };
  for (const key of Object.keys(nextHookSupport)) {
    if (key === agentKind || key.startsWith(`${agentKind}:`)) {
      delete nextHookSupport[key];
    }
  }

  if (settings.commitGenProvider === agentKind) settings.commitGenProvider = "auto";
  if (settings.titleGenProvider === agentKind) settings.titleGenProvider = "auto";
  if (settings.conflictResolverProvider === agentKind) settings.conflictResolverProvider = "auto";
  if (settings.wslCommitGenProvider === agentKind) settings.wslCommitGenProvider = "auto";
  if (settings.wslTitleGenProvider === agentKind) settings.wslTitleGenProvider = "auto";
  if (settings.wslConflictResolverProvider === agentKind)
    settings.wslConflictResolverProvider = "auto";

  settings.acpRegistryInstalledAgents = nextInstalled;
  settings.agentInstances = nextInstances;
  settings.providerConfigs = nextProviderConfigs;
  settings.lastPresentationModeByAgent = nextLastPresentation;
  settings.agentSettings = nextAgentSettings;
  settings.hiddenModels = nextHiddenModels;
  settings.disabledAgents = nextDisabledAgents;
  settings.favoriteModels = nextFavoriteModels;
  settings.recentModels = nextRecentModels;
  settings.agentHookSupport = nextHookSupport;

  writeAcpRegistrySettings(input.settingsPath, settings);

  await removeAcpRegistryInstallDir(acpRegistryAgentInstallDir(input.baseDir, input.agentId));

  return Object.values(settings.acpRegistryInstalledAgents);
}

export function setAcpRegistryAgentAuth(input: {
  agentId: string;
  environment: Record<string, string>;
  settingsPath: string;
}): InstalledAcpRegistryAgent[] {
  const settings = readAcpRegistrySettings(input.settingsPath);
  const instance = settings.agentInstances[input.agentId];
  if (!instance || instance.driver !== "acp-generic") {
    throw new Error(`ACP registry agent is not installed: ${input.agentId}`);
  }

  const environment = { ...(instance.environment ?? {}) };
  for (const [name, value] of Object.entries(input.environment)) {
    if (value) {
      environment[name] = { value, sensitive: true };
    } else {
      delete environment[name];
    }
  }
  const hasEnv = Object.keys(environment).length > 0;
  const updatedInstance = { ...instance };
  if (hasEnv) {
    updatedInstance.environment = environment;
  } else {
    delete updatedInstance.environment;
  }

  settings.agentInstances = {
    ...settings.agentInstances,
    [input.agentId]: updatedInstance,
  };
  writeAcpRegistrySettings(input.settingsPath, settings);
  return Object.values(settings.acpRegistryInstalledAgents);
}

/**
 * Record/clear an interactive-login acknowledgement for one (agent, env) pair.
 * Env-var auth shares credentials across envs and is not tracked here; this
 * path only models browser/CLI login flows that are bound to a single env.
 *
 * Used by the unified ACP auth dispatcher (`runtime.ts`) after a successful
 * `authenticate()` / `logout()` call against an acp-generic instance.
 * Native ACP adapters (Copilot, Gemini, Cursor) do NOT call this — their
 * detection probes read the agent's own auth state directly, so an explicit
 * ack would just go stale.
 */
export function setAcpGenericAgentAuthAcknowledged(
  settingsPath: string,
  agentId: string,
  envContext: AgentEnvContext | undefined,
  acknowledged: boolean,
): void {
  const settings = readAcpRegistrySettings(settingsPath);
  const instance = settings.agentInstances[agentId];
  if (!instance) return;
  const current = instance.authAcknowledged ?? {};
  const nextWsl: Record<string, boolean> = { ...(current.wsl ?? {}) };
  let nextNative = current.native === true;
  if (envContext?.envKind === "wsl" && envContext.wslDistro) {
    if (acknowledged) {
      nextWsl[envContext.wslDistro] = true;
    } else {
      delete nextWsl[envContext.wslDistro];
    }
  } else {
    nextNative = acknowledged;
  }
  const hasWsl = Object.keys(nextWsl).length > 0;
  const next: { native?: boolean; wsl?: Record<string, boolean> } = {};
  if (nextNative) next.native = true;
  if (hasWsl) next.wsl = nextWsl;
  const hasAny = nextNative || hasWsl;
  settings.agentInstances = {
    ...settings.agentInstances,
    [agentId]: {
      ...instance,
      ...(hasAny ? { authAcknowledged: next } : {}),
    },
  };
  if (!hasAny) {
    delete settings.agentInstances[agentId]!.authAcknowledged;
  }
  writeAcpRegistrySettings(settingsPath, settings);
}
