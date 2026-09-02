import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { copyFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { writeFileAtomic } from "@/shared/atomicFile";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import {
  acpGenericKind,
  acpRegistryListResultSchema,
  parseAcpGenericInstanceConfig,
  type AcpRegistryAgent,
  type AcpRegistryInstallTarget,
  type AcpRegistryListResult,
  type AcpGenericCommandConfig,
  type AcpGenericInstanceConfig,
  type AgentInstanceConfig,
  type AgentInstanceEnvVar,
  type AgentKind,
  type InstalledAcpRegistryAgent,
} from "@/shared/contracts";
import {
  ANTIGRAVITY_ACP_ALIAS_MIGRATED_KEYS,
  defaultSharedSettings,
  normalizeSharedSettings,
  normalizeSharedSettingsState,
  pickAntigravityAcpAliasMigratedFields,
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
  ACP_REGISTRY_INSTALL_LAYOUT_VERSION,
  acpRegistryAgentInstallDir,
  PENDING_DELETE_PREFIX,
  removeAcpRegistryInstallDir,
} from "./acpRegistryInstallDir";
import {
  batchWslCommandsAsync,
  buildAgentCommand,
  quotePosixShellArg,
  resolveWslHomeDirectoryAsync,
  type AgentEnvContext,
} from "./base";
import { toWslUncPath } from "@/shared/wsl";

const execFileAsync = promisify(execFile);

const ACP_REGISTRY_URL = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";

export function wslAcpRegistryAgentInstallDir(
  distro: string,
  home: string,
  agentId: string,
): string {
  return toWslUncPath(distro, `${home}/.poracode/${ACP_REGISTRY_INSTALL_DIR}/${agentId}`);
}

/**
 * Sweep WSL-side `.pending-delete-*` dirs parked by
 * {@link removeAcpRegistryInstallDir} when a running ACP server held the binary
 * lock. The Windows-side launch sweep cannot reach into a distro, so recorded
 * WSL installs get this equivalent at launch. Best-effort.
 */
export async function pruneWslAcpRegistryPendingDeletes(distro: string): Promise<void> {
  const home = await resolveWslHomeDirectoryAsync(distro).catch(() => undefined);
  if (!home) return;
  const [result] = await batchWslCommandsAsync(distro, [
    `find ${quotePosixShellArg(`${home}/.poracode/${ACP_REGISTRY_INSTALL_DIR}`)} -maxdepth 3 -type d ` +
      `-name ${quotePosixShellArg(`${PENDING_DELETE_PREFIX}*`)} -exec rm -rf {} +`,
  ]).catch(() => []);
  if (!result?.ok) {
    console.warn(`[acp-registry] WSL pending-delete sweep failed for ${distro}`);
  }
}

function wslInstallLayoutRepairScript(linuxInstallDir: string): string {
  return `chmod -R 755 ${quotePosixShellArg(linuxInstallDir)}`;
}

type AcpRegistryInstallation = NonNullable<
  NonNullable<InstalledAcpRegistryAgent["installations"]>["native"]
>;

function installationNeedsLayoutRepair(installation: AcpRegistryInstallation): boolean {
  return (installation.layoutVersion ?? 0) < ACP_REGISTRY_INSTALL_LAYOUT_VERSION;
}

function stampInstallationLayout(installation: AcpRegistryInstallation): AcpRegistryInstallation {
  return { ...installation, layoutVersion: ACP_REGISTRY_INSTALL_LAYOUT_VERSION };
}

/**
 * Launch-time layout migration for already-extracted registry artifacts (see
 * `ACP_REGISTRY_INSTALL_LAYOUT_VERSION`). Each recorded installation is brought
 * to the current layout once and stamped, so a healthy record costs nothing on
 * later launches. WSL installs get their `bin/` tree marked executable in the
 * distro; native installs were extracted by the host's own unzip/tar, which
 * keep the archive's mode bits, and package (`npx`/`uvx`) installs have no
 * extracted layout — both are stamped as-is. A failed WSL repair is left
 * unstamped and retried on the next launch. Returns whether settings changed.
 */
export async function repairAcpRegistryInstallLayouts(input: {
  settingsPath: string;
}): Promise<boolean> {
  const settings = readAcpRegistrySettings(input.settingsPath);
  let changed = false;
  const nextRecords: SharedSettings["acpRegistryInstalledAgents"] = {};
  for (const [id, record] of Object.entries(settings.acpRegistryInstalledAgents)) {
    const installations = record.installations;
    if (!installations) {
      nextRecords[id] = record;
      continue;
    }
    const instance = settings.agentInstances[id];
    const config =
      instance?.driver === "acp-generic"
        ? parseAcpGenericInstanceConfig(instance.config)
        : undefined;
    const next: NonNullable<InstalledAcpRegistryAgent["installations"]> = { ...installations };
    if (installations.native && installationNeedsLayoutRepair(installations.native)) {
      next.native = stampInstallationLayout(installations.native);
      changed = true;
    }
    for (const [distro, installation] of Object.entries(installations.wsl ?? {})) {
      if (!installationNeedsLayoutRepair(installation)) continue;
      const binary = config?.environmentCommands?.wsl?.[distro]?.binary;
      if (binary?.startsWith("/")) {
        const [result] = await batchWslCommandsAsync(distro, [
          wslInstallLayoutRepairScript(binary.slice(0, binary.lastIndexOf("/"))),
        ]).catch(() => []);
        if (!result?.ok) {
          console.warn(`[acp-registry] WSL install layout repair failed for ${id} in ${distro}`);
          continue;
        }
      }
      next.wsl = { ...(next.wsl ?? {}), [distro]: stampInstallationLayout(installation) };
      changed = true;
    }
    nextRecords[id] = { ...record, installations: next };
  }
  if (!changed) return false;
  writeAcpRegistrySettings(input.settingsPath, {
    ...readAcpRegistrySettings(input.settingsPath),
    acpRegistryInstalledAgents: nextRecords,
  });
  return true;
}

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

/**
 * Persist the unversioned shared-settings alias migration once legacy
 * Antigravity ACP state is observed. Overlaying only the fields the migration
 * can rewrite (see `ANTIGRAVITY_ACP_ALIAS_MIGRATED_KEYS`) keeps the rest of the
 * raw file — secrets in their encrypted form included — byte-for-byte.
 */
export function persistAcpRegistrySettingsMigrations(settingsPath: string): boolean {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(settingsPath, "utf8"));
  } catch {
    return false;
  }
  const { settings: migrated, acpAliasMigrated } = normalizeSharedSettingsState(raw);
  if (!acpAliasMigrated) return false;
  const overlay: Partial<
    Pick<SharedSettings, (typeof ANTIGRAVITY_ACP_ALIAS_MIGRATED_KEYS)[number]>
  > = { ...pickAntigravityAcpAliasMigratedFields(migrated) };
  // A schema-level parse failure collapses a whole collection to its default
  // (e.g. one malformed instance id empties `agentInstances`). These
  // collections never have keys renamed by the alias migration, so a raw key
  // missing from the normalized value means parsing dropped data — keep the
  // raw collection instead of persisting the collapse.
  const collectionsThatNeverRenameKeys = [
    "agentInstances",
    "acpRegistryInstalledAgents",
    "machineSettings",
  ] as const;
  const rawRecord = raw as Record<string, unknown>;
  for (const key of collectionsThatNeverRenameKeys) {
    const rawValue = rawRecord[key];
    const nextValue = overlay[key];
    if (
      rawValue === null ||
      typeof rawValue !== "object" ||
      nextValue === null ||
      typeof nextValue !== "object"
    ) {
      continue;
    }
    if (!Object.keys(rawValue).every((inner) => inner in nextValue)) {
      delete overlay[key];
    }
  }
  const persisted = { ...rawRecord, ...overlay };
  writeFileAtomic(settingsPath, JSON.stringify(persisted, null, 2), { encoding: "utf8" });
  return true;
}

function registryInstallRecord(
  agent: AcpRegistryAgent,
  adapterKind: AgentKind,
  installKind: InstalledAcpRegistryAgent["installKind"],
  target: AcpRegistryInstallTarget,
  targetName: string,
  existing: InstalledAcpRegistryAgent | undefined,
): InstalledAcpRegistryAgent {
  const installedAt = new Date().toISOString();
  const previousInstallations =
    existing?.installations ??
    (existing
      ? {
          native: {
            version: existing.version,
            target: "legacy-native",
            installedAt: existing.installedAt,
          },
        }
      : {});
  const installation = {
    version: agent.version,
    target: targetName,
    installedAt,
    layoutVersion: ACP_REGISTRY_INSTALL_LAYOUT_VERSION,
  };
  const installations = {
    ...previousInstallations,
    ...(target.kind === "native"
      ? { native: installation }
      : { wsl: { ...(previousInstallations.wsl ?? {}), [target.distro]: installation } }),
  };
  return {
    id: agent.id,
    name: agent.name,
    version: agent.version,
    ...(agent.icon ? { icon: agent.icon } : {}),
    installedAt,
    adapterKind,
    installKind,
    installations,
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

function nativeBinaryTarget(): string {
  const os =
    process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "windows" : "linux";
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  return `${os}-${arch}`;
}

async function binaryTargetForInstall(target: AcpRegistryInstallTarget): Promise<string> {
  if (target.kind === "native") return nativeBinaryTarget();
  if (process.platform !== "win32") {
    throw new Error("WSL ACP registry installs are only available on Windows");
  }
  const [result] = await batchWslCommandsAsync(target.distro, ["uname -m"]);
  const arch = result?.ok ? result.stdout.trim().toLowerCase() : "";
  if (arch === "x86_64" || arch === "amd64") return "linux-x86_64";
  if (arch === "aarch64" || arch === "arm64") return "linux-aarch64";
  throw new Error(`Unsupported WSL architecture for ${target.distro}: ${arch || "unknown"}`);
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
  installTarget: AcpRegistryInstallTarget,
): Promise<{ instance: AgentInstanceConfig; targetName: string; installDir: string }> {
  const targetName = await binaryTargetForInstall(installTarget);
  const target = agent.distribution.binary?.[targetName];
  if (!target) {
    throw new Error(`${agent.name} does not publish a binary for ${targetName}`);
  }

  const rootDir = join(baseDir, ACP_REGISTRY_INSTALL_DIR, agent.id, agent.version);
  let installDir: string;
  let commandPath: string;
  let linuxInstallDir: string | undefined;
  if (installTarget.kind === "wsl") {
    const home = await resolveWslHomeDirectoryAsync(installTarget.distro);
    if (!home) throw new Error(`Unable to resolve home directory for WSL ${installTarget.distro}`);
    linuxInstallDir = `${home}/.poracode/${ACP_REGISTRY_INSTALL_DIR}/${agent.id}/${agent.version}/bin`;
    installDir = toWslUncPath(installTarget.distro, linuxInstallDir);
    commandPath = `${linuxInstallDir}/${target.cmd.replace(/^\.\//, "")}`;
  } else {
    installDir = join(rootDir, "bin");
    commandPath = resolveInstalledCommandPath(installDir, target.cmd);
  }
  await removeAcpRegistryInstallDir(installDir);
  mkdirSync(installDir, { recursive: true });

  const archiveName = archiveFileName(target.archive);
  const archivePath = join(rootDir, archiveName);
  await downloadToFile(target.archive, archivePath);
  await extractArchive(archivePath, installDir);

  const readableCommandPath =
    installTarget.kind === "wsl"
      ? resolveInstalledCommandPath(installDir, target.cmd)
      : commandPath;
  if (!existsSync(readableCommandPath)) {
    copyFileSync(archivePath, readableCommandPath);
  }
  if (installTarget.kind === "wsl" && linuxInstallDir) {
    // The archive is extracted by Windows tooling into the distro, which drops
    // every mode bit (0644). Servers spawn bundled helpers from the same dir,
    // so the whole `bin/` tree must be executable, not just the command
    // (ACP_REGISTRY_INSTALL_LAYOUT_VERSION 2).
    const [chmod] = await batchWslCommandsAsync(installTarget.distro, [
      wslInstallLayoutRepairScript(linuxInstallDir),
    ]);
    if (!chmod?.ok) throw new Error(`Unable to mark ${agent.name} executable in WSL`);
  } else if (process.platform !== "win32") {
    chmodSync(commandPath, 0o755);
  }

  const command: AcpGenericCommandConfig = {
    binary: commandPath,
    args: target.args ?? [],
    ...(target.env ? { env: target.env } : {}),
    version: agent.version,
  };
  const environmentCommands: NonNullable<AcpGenericInstanceConfig["environmentCommands"]> =
    installTarget.kind === "wsl"
      ? { wsl: { [installTarget.distro]: command } }
      : { native: command };
  return {
    instance: {
      id: agent.id,
      driver: "acp-generic",
      displayName: agent.name,
      version: agent.version,
      ...(agent.icon ? { icon: agent.icon } : {}),
      enabled: true,
      config: {
        binary: commandPath,
        args: target.args ?? [],
        cwd: "project",
        authMode: "none",
        environmentCommands,
      },
    },
    targetName,
    installDir,
  };
}

async function genericInstance(
  agent: AcpRegistryAgent,
  baseDir: string,
  target: AcpRegistryInstallTarget,
): Promise<{ instance: AgentInstanceConfig; targetName: string; installDir?: string }> {
  if (agent.distribution.npx) return { instance: packageInstance(agent, "npx"), targetName: "npx" };
  if (agent.distribution.uvx) return { instance: packageInstance(agent, "uvx"), targetName: "uvx" };
  if (agent.distribution.binary) return binaryInstance(agent, baseDir, target);
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
  const builtConfig = parseAcpGenericInstanceConfig(built.config);
  const existingConfig = parseAcpGenericInstanceConfig(existing.config);
  const commandEnvNames = new Set(
    [
      builtConfig.environmentCommands?.native,
      ...Object.values(builtConfig.environmentCommands?.wsl ?? {}),
      existingConfig.environmentCommands?.native,
      ...Object.values(existingConfig.environmentCommands?.wsl ?? {}),
    ].flatMap((command) => Object.keys(command?.env ?? {})),
  );
  const mergedEnv: Record<string, AgentInstanceEnvVar> = { ...(built.environment ?? {}) };
  for (const [key, value] of Object.entries(existing.environment ?? {})) {
    if (value.sensitive || (!commandEnvNames.has(key) && !(key in mergedEnv))) {
      mergedEnv[key] = value;
    }
  }
  const hasEnv = Object.keys(mergedEnv).length > 0;
  const next: AgentInstanceConfig = { ...built };
  if (builtConfig.environmentCommands) {
    const legacyNativeCommand: AcpGenericCommandConfig | undefined =
      existingConfig.environmentCommands
        ? undefined
        : {
            binary: existingConfig.binary,
            ...(existingConfig.args ? { args: existingConfig.args } : {}),
            ...(existingConfig.env ? { env: existingConfig.env } : {}),
            ...(existing.version ? { version: existing.version } : {}),
          };
    const native =
      builtConfig.environmentCommands.native ??
      existingConfig.environmentCommands?.native ??
      legacyNativeCommand;
    const wsl = {
      ...(existingConfig.environmentCommands?.wsl ?? {}),
      ...(builtConfig.environmentCommands.wsl ?? {}),
    };
    const primary = native ?? Object.values(wsl)[0] ?? builtConfig;
    next.config = {
      ...builtConfig,
      binary: primary.binary,
      ...(primary.args ? { args: primary.args } : {}),
      environmentCommands: {
        ...(native ? { native } : {}),
        ...(Object.keys(wsl).length > 0 ? { wsl } : {}),
      },
    };
  }
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
  target: AcpRegistryInstallTarget,
): Promise<boolean> {
  if (agent.distribution.npx) {
    await prefetchNpxDistribution(agent);
  }
  try {
    const ctx: AgentEnvContext | undefined =
      target.kind === "wsl" ? { envKind: "wsl", wslDistro: target.distro } : undefined;
    const result = await probeAcpGenericInstance(instance, ctx, {
      timeoutMs: REGISTRY_INSTALL_PROBE_TIMEOUT_MS,
    });
    return result !== undefined;
  } catch (error) {
    console.warn(
      `[acp-registry] install probe failed for ${agent.id}:`,
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}

export async function installAcpRegistryAgent(input: {
  agentId: string;
  baseDir: string;
  settingsPath: string;
  iconsDir: string;
  registry?: AcpRegistryListResult;
  target?: AcpRegistryInstallTarget;
  adapterKind?: AgentKind;
  installKind?: InstalledAcpRegistryAgent["installKind"];
  respectAutoInstallOptOut?: boolean;
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
  if (input.respectAutoInstallOptOut && settings.acpRegistryAutoInstallOptOuts.includes(agent.id)) {
    throw new Error(`${agent.name} ACP auto-install was disabled`);
  }
  const target = input.target ?? { kind: "native" };
  const built = await genericInstance(cachedAgent, input.baseDir, target);
  const instance = mergeRegistryInstance(built.instance, settings.agentInstances[agent.id]);
  const probeSucceeded = await warmRegistryInstall(agent, instance, target);
  if (input.installKind === "first-class" && agent.distribution.binary && !probeSucceeded) {
    // The re-extraction has already replaced the target dir by this point, so
    // for a repair of the exact command the recorded instance points at there
    // is no earlier artifact left to protect — refuse-and-delete would leave
    // settings pointing at a removed path. Keep the fresh extraction and warn
    // so a flaky probe cannot kill a same-version repair. A new version/dir
    // still gets the strict treatment — refuse and clean up.
    const existingInstance = settings.agentInstances[agent.id];
    const existingConfig = existingInstance
      ? parseAcpGenericInstanceConfig(existingInstance.config)
      : undefined;
    const existingCommandForTarget =
      target.kind === "wsl"
        ? (existingConfig?.environmentCommands?.wsl?.[target.distro]?.binary ??
          existingConfig?.binary)
        : (existingConfig?.environmentCommands?.native?.binary ?? existingConfig?.binary);
    const reinstallsSameCommand =
      existingCommandForTarget !== undefined &&
      existingCommandForTarget === parseAcpGenericInstanceConfig(built.instance.config).binary;
    if (!reinstallsSameCommand) {
      if (built.installDir) await removeAcpRegistryInstallDir(built.installDir);
      throw new Error(`${agent.name} ACP server did not complete initialization`);
    }
    console.warn(
      `[acp-registry] ${agent.id} probe failed after reinstalling the same artifact; keeping it`,
    );
  }
  // The download and probe can take minutes. Re-read immediately before the
  // write so a concurrent Settings save is not replaced by the stale snapshot
  // captured above, and so a removal that happened during the probe wins over
  // the background auto-install.
  const latestSettings = readAcpRegistrySettings(input.settingsPath);
  if (
    input.respectAutoInstallOptOut &&
    latestSettings.acpRegistryAutoInstallOptOuts.includes(agent.id)
  ) {
    if (built.installDir) await removeAcpRegistryInstallDir(built.installDir);
    throw new Error(`${agent.name} ACP auto-install was disabled`);
  }
  const latestInstance = mergeRegistryInstance(
    built.instance,
    latestSettings.agentInstances[agent.id],
  );
  latestSettings.agentInstances = {
    ...latestSettings.agentInstances,
    [agent.id]: latestInstance,
  };
  // An install (explicit or auto) is the user having the agent again, so it
  // clears any earlier removal opt-out.
  latestSettings.acpRegistryAutoInstallOptOuts =
    latestSettings.acpRegistryAutoInstallOptOuts.filter((id) => id !== agent.id);
  latestSettings.acpRegistryInstalledAgents = {
    ...latestSettings.acpRegistryInstalledAgents,
    [agent.id]: registryInstallRecord(
      cachedAgent,
      input.adapterKind ?? acpGenericKind(agent.id),
      input.installKind ?? "generic",
      target,
      built.targetName,
      latestSettings.acpRegistryInstalledAgents[agent.id],
    ),
  };
  writeAcpRegistrySettings(input.settingsPath, latestSettings);
  return Object.values(latestSettings.acpRegistryInstalledAgents);
}

export async function updateAcpRegistryAgent(input: {
  agentId: string;
  baseDir: string;
  settingsPath: string;
  iconsDir: string;
  registry?: AcpRegistryListResult;
  target?: AcpRegistryInstallTarget;
  adapterKind?: AgentKind;
  installKind?: InstalledAcpRegistryAgent["installKind"];
}): Promise<InstalledAcpRegistryAgent[]> {
  const settings = readAcpRegistrySettings(input.settingsPath);
  if (!settings.agentInstances[input.agentId]) {
    throw new Error(`ACP registry agent is not installed: ${input.agentId}`);
  }
  return installAcpRegistryAgent(input);
}

/**
 * Refresh generic ACP registry agents whose registry version differs from the
 * locally-recorded version. First-class aliases update through their built-in
 * provider card. Best-effort: individual update failures (e.g. binary download
 * errors) are swallowed so listing the registry stays resilient.
 */
export async function autoUpdateAcpRegistryAgents(input: {
  registry: AcpRegistryListResult;
  baseDir: string;
  settingsPath: string;
  iconsDir: string;
  firstClassAgents?: Readonly<Record<string, AgentKind>>;
}): Promise<{
  updated: string[];
  changed: string[];
  failed: { id: string; error: string }[];
}> {
  const settings = readAcpRegistrySettings(input.settingsPath);
  const agentsById = new Map(input.registry.agents.map((agent) => [agent.id, agent]));
  const updated: string[] = [];
  const changed: string[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const [id, record] of Object.entries(settings.acpRegistryInstalledAgents)) {
    if (record.installKind === "first-class" || input.firstClassAgents?.[id]) continue;
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
    const targets: Array<{
      target: AcpRegistryInstallTarget;
      version: string;
    }> = record.installations
      ? [
          ...(record.installations.native
            ? [
                {
                  target: { kind: "native" as const },
                  version: record.installations.native.version,
                },
              ]
            : []),
          ...Object.entries(record.installations.wsl ?? {}).map(([distro, installation]) => ({
            target: { kind: "wsl" as const, distro },
            version: installation.version,
          })),
        ]
      : [{ target: { kind: "native" }, version: record.version }];
    const targetsToUpdate = targets.filter(
      ({ version }) => version !== agent.version || correctedArgs !== configuredArgs,
    );
    if (targetsToUpdate.length === 0) continue;
    let failedUpdate = false;
    let changedInstall = false;
    for (const { target } of targetsToUpdate) {
      try {
        await installAcpRegistryAgent({
          agentId: id,
          baseDir: input.baseDir,
          settingsPath: input.settingsPath,
          iconsDir: input.iconsDir,
          registry: input.registry,
          target,
        });
        changedInstall = true;
      } catch (error) {
        failedUpdate = true;
        failed.push({ id, error: error instanceof Error ? error.message : String(error) });
      }
    }
    if (changedInstall) changed.push(id);
    if (!failedUpdate) updated.push(id);
  }
  return { updated, changed, failed };
}

export async function removeAcpRegistryAgent(input: {
  agentId: string;
  baseDir: string;
  settingsPath: string;
}): Promise<InstalledAcpRegistryAgent[]> {
  const settings = readAcpRegistrySettings(input.settingsPath);
  const installRecord = settings.acpRegistryInstalledAgents[input.agentId];
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
  // Remember the removal so a provider that auto-installs its registry runtime
  // alongside a detected CLI cannot bring it back on the next detection pass.
  settings.acpRegistryAutoInstallOptOuts = [
    ...new Set([...settings.acpRegistryAutoInstallOptOuts, input.agentId]),
  ];
  settings.agentInstances = nextInstances;
  settings.providerConfigs = nextProviderConfigs;
  settings.lastPresentationModeByAgent = nextLastPresentation;
  settings.agentSettings = nextAgentSettings;
  settings.hiddenModels = nextHiddenModels;
  settings.disabledAgents = nextDisabledAgents;
  settings.favoriteModels = nextFavoriteModels;
  settings.recentModels = nextRecentModels;
  settings.agentHookSupport = nextHookSupport;

  // A recorded distro can be deleted or refuse to start. Cleaning its install
  // dir is best-effort so a stale environment can never make the agent
  // impossible to remove from settings.
  const wslInstallDirs =
    process.platform === "win32"
      ? (
          await Promise.all(
            Object.keys(installRecord?.installations?.wsl ?? {}).map(async (distro) => {
              const home = await resolveWslHomeDirectoryAsync(distro).catch(() => undefined);
              if (!home) {
                console.warn(
                  `[acp-registry] could not resolve WSL ${distro} home; leaving ${input.agentId} files in place`,
                );
                return undefined;
              }
              return wslAcpRegistryAgentInstallDir(distro, home, input.agentId);
            }),
          )
        ).filter((dir) => dir !== undefined)
      : [];
  await removeAcpRegistryInstallDir(acpRegistryAgentInstallDir(input.baseDir, input.agentId));
  await Promise.all(wslInstallDirs.map((dir) => removeAcpRegistryInstallDir(dir)));
  writeAcpRegistrySettings(input.settingsPath, settings);

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
