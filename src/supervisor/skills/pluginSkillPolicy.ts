import { realpathSync } from "node:fs";
import { isAbsolute, posix, relative, resolve } from "node:path";
import type {
  AgentCapability,
  InstalledPlugins,
  ProjectLocation,
  PromptSegment,
  SkillEntry,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import {
  arePluginSkillRequiredAppsEnabled,
  getBundledPluginSkill,
  isPluginSkillEnabled,
  isPluginSkillSupportedForLaunch,
} from "@/shared/plugins/catalog";
import { parseWslUncPath } from "@/shared/wsl";
import { batchWslCommandsAsync, quotePosixShellArg } from "../agents/base";

const SKILL_FILE = "SKILL.md";
export const BUNDLED_PROVIDER_ID = "poracode-built-in";

export interface PluginSkillPolicyContext {
  projectLocation?: ProjectLocation;
  capabilities?: AgentCapability;
  presentationMode?: ThreadPresentationMode;
  launchConfig?: ThreadConfig;
}

export interface PluginSkillPolicyOptions {
  bundledRoot: () => string | undefined;
  readInstalledPlugins: () => InstalledPlugins;
  hostPlatform: NodeJS.Platform;
  resolveWslRealPaths: (
    distro: string,
    paths: readonly string[],
  ) => Promise<readonly (string | undefined)[]>;
  resolveHostPathForWsl?: (distro: string, hostPath: string) => Promise<string | undefined>;
  resolveWslWindowsPaths?: (
    distro: string,
    paths: readonly string[],
  ) => Promise<readonly (string | undefined)[]>;
}

function normalizeWindowsNamespacePath(path: string): string {
  let normalized = path;
  if (normalized.startsWith("\\\\?\\UNC\\")) normalized = `\\\\${normalized.slice(8)}`;
  else if (normalized.startsWith("\\\\?\\")) normalized = normalized.slice(4);
  else if (normalized.startsWith("//?/UNC/")) normalized = `//${normalized.slice(8)}`;
  else if (normalized.startsWith("//?/")) normalized = normalized.slice(4);
  return normalized;
}

function relativePathInside(root: string, target: string): string | undefined {
  const candidate = relative(root, target);
  if (!candidate || isAbsolute(candidate) || candidate.split(/[\\/]/u)[0] === "..") {
    return undefined;
  }
  return candidate;
}

function relativePolicyPath(root: string, target: string): string | undefined {
  const normalizedRoot = resolve(normalizeWindowsNamespacePath(root));
  const normalizedTarget = resolve(normalizeWindowsNamespacePath(target));
  try {
    return relativePathInside(
      resolve(realpathSync.native(root)),
      resolve(realpathSync.native(target)),
    );
  } catch {
    // Fall through to the normalized aliases for non-existent paths.
  }
  const direct = relativePathInside(normalizedRoot, normalizedTarget);
  if (direct) return direct;
  try {
    return relativePathInside(
      resolve(realpathSync.native(normalizedRoot)),
      resolve(realpathSync.native(normalizedTarget)),
    );
  } catch {
    return undefined;
  }
}

function relativePosixPolicyPath(root: string, target: string): string | undefined {
  const candidate = posix.relative(posix.resolve(root), posix.resolve(target));
  if (!candidate || posix.isAbsolute(candidate) || candidate.split("/")[0] === "..") {
    return undefined;
  }
  return candidate;
}

function relativeWslPolicyPath(root: string, target: string): string | undefined {
  const rootDrive = /^\/mnt\/([a-z])(?:\/|$)/iu.exec(root)?.[1];
  const targetDrive = /^\/mnt\/([a-z])(?:\/|$)/iu.exec(target)?.[1];
  return rootDrive && targetDrive && rootDrive.toLowerCase() === targetDrive.toLowerCase()
    ? relativePosixPolicyPath(root.toLowerCase(), target.toLowerCase())
    : relativePosixPolicyPath(root, target);
}

async function resolveHostPathForWsl(
  distro: string,
  hostPath: string,
): Promise<string | undefined> {
  const [result] = await batchWslCommandsAsync(distro, [
    `wslpath -a -u -- ${quotePosixShellArg(hostPath)}`,
  ]);
  return result?.ok && posix.isAbsolute(result.stdout) ? result.stdout : undefined;
}

async function resolveWslWindowsPaths(
  distro: string,
  paths: readonly string[],
): Promise<readonly (string | undefined)[]> {
  const results = await batchWslCommandsAsync(
    distro,
    paths.map((path) => `wslpath -a -w -- ${quotePosixShellArg(path)}`),
  );
  return results.map((result) => (result?.ok && result.stdout ? result.stdout : undefined));
}

export class PluginSkillPolicy {
  private readonly bundledRootWslPaths = new Map<string, Promise<string | undefined>>();
  private readonly resolveHostPathForWsl: (
    distro: string,
    hostPath: string,
  ) => Promise<string | undefined>;
  private readonly resolveWslWindowsPaths: (
    distro: string,
    paths: readonly string[],
  ) => Promise<readonly (string | undefined)[]>;

  constructor(private readonly options: PluginSkillPolicyOptions) {
    this.resolveHostPathForWsl = options.resolveHostPathForWsl ?? resolveHostPathForWsl;
    this.resolveWslWindowsPaths = options.resolveWslWindowsPaths ?? resolveWslWindowsPaths;
  }

  resolveScanEntries(
    entries: readonly SkillEntry[],
    context: PluginSkillPolicyContext,
  ): SkillEntry[] {
    const installedPlugins = this.options.readInstalledPlugins();
    return entries.flatMap((skill) => {
      if (skill.providerId !== BUNDLED_PROVIDER_ID) return [skill];
      const bundledSkill = getBundledPluginSkill(skill.folderName);
      if (!bundledSkill) return [skill];
      const { manifest, contribution } = bundledSkill;
      const state = installedPlugins[manifest.id];
      if (!state) return [];
      if (
        !isPluginSkillSupportedForLaunch(manifest, contribution, {
          hostPlatform: this.options.hostPlatform,
          ...(context.projectLocation ? { projectLocation: context.projectLocation } : {}),
          ...(context.capabilities ? { capabilities: context.capabilities } : {}),
          ...(context.presentationMode ? { presentationMode: context.presentationMode } : {}),
        })
      ) {
        return [];
      }
      return [
        {
          ...skill,
          id: `${skill.scope}:plugin:${manifest.id}:${skill.folderName}`,
          providerId: `plugin:${manifest.id}`,
          providerLabel: manifest.name,
          providerGroupId: `plugin:${manifest.id}`,
          providerGroupLabel: manifest.name,
          providerGroupOrder: -2,
          origin: "plugin" as const,
          pluginId: manifest.id,
          pluginName: manifest.name,
          enabled: isPluginSkillEnabled(manifest, state, contribution.id),
        },
      ];
    });
  }

  async filterSegments(
    segments: PromptSegment[],
    context: PluginSkillPolicyContext = {},
  ): Promise<PromptSegment[]> {
    const bundledRoot = this.options.bundledRoot();
    if (!bundledRoot || !segments.some((segment) => segment.kind === "skill")) return segments;

    const relativePaths = new Map<PromptSegment, string>();
    const unresolvedWslPaths = new Map<
      string,
      Array<{ segment: PromptSegment; linuxPath: string }>
    >();
    for (const segment of segments) {
      if (segment.kind !== "skill") continue;
      const relativePath = relativePolicyPath(bundledRoot, segment.path);
      if (relativePath) {
        relativePaths.set(segment, relativePath);
        continue;
      }
      const parsedWslPath = parseWslUncPath(segment.path);
      const distro =
        parsedWslPath?.distro ??
        (context.projectLocation?.kind === "wsl" && segment.path.startsWith("/")
          ? context.projectLocation.distro
          : undefined);
      const linuxPath =
        parsedWslPath?.linuxPath ??
        (context.projectLocation?.kind === "wsl" && segment.path.startsWith("/")
          ? segment.path
          : undefined);
      if (!distro || !linuxPath) continue;
      const pending = unresolvedWslPaths.get(distro) ?? [];
      pending.push({ segment, linuxPath });
      unresolvedWslPaths.set(distro, pending);
    }

    const rejectedWslSegments = new Set<PromptSegment>();
    await Promise.all(
      [...unresolvedWslPaths].map(async ([distro, pending]) => {
        const bundledWslRoot = await this.resolveBundledRootWslPath(distro, bundledRoot);
        if (!bundledWslRoot) {
          pending.forEach(({ segment }) => rejectedWslSegments.add(segment));
          return;
        }
        const resolvedPaths = await this.options
          .resolveWslRealPaths(
            distro,
            pending.map(({ linuxPath }) => linuxPath),
          )
          .catch(() => []);
        const windowsPaths = await this.resolveWslWindowsPaths(
          distro,
          resolvedPaths.map((path) => path ?? "/"),
        ).catch(() => []);
        pending.forEach(({ segment }, index) => {
          const resolvedPath = resolvedPaths[index];
          if (!resolvedPath) {
            rejectedWslSegments.add(segment);
            return;
          }
          const windowsPath = windowsPaths[index];
          const relativePath =
            (windowsPath ? relativePolicyPath(bundledRoot, windowsPath) : undefined) ??
            relativeWslPolicyPath(bundledWslRoot, resolvedPath);
          if (relativePath) relativePaths.set(segment, relativePath);
        });
      }),
    );

    const installedPlugins = this.options.readInstalledPlugins();
    let changed = false;
    const filtered = segments.filter((segment) => {
      if (segment.kind !== "skill") return true;
      if (rejectedWslSegments.has(segment)) {
        changed = true;
        return false;
      }
      const relativePath = relativePaths.get(segment);
      if (!relativePath) return true;
      const parts = relativePath.split(/[\\/]/u);
      const folder = parts[0]!.toLowerCase();
      const bundledSkill = getBundledPluginSkill(folder);
      if (!bundledSkill) return true;
      const { manifest, contribution } = bundledSkill;
      const state = installedPlugins[manifest.id];
      const allowed = Boolean(
        parts.length === 2 &&
        parts[1] === SKILL_FILE &&
        state &&
        isPluginSkillSupportedForLaunch(manifest, contribution, {
          hostPlatform: this.options.hostPlatform,
          ...(context.projectLocation ? { projectLocation: context.projectLocation } : {}),
          ...(context.capabilities ? { capabilities: context.capabilities } : {}),
          ...(context.presentationMode ? { presentationMode: context.presentationMode } : {}),
        }) &&
        isPluginSkillEnabled(manifest, state, contribution.id) &&
        (!context.launchConfig ||
          arePluginSkillRequiredAppsEnabled(manifest, contribution, context.launchConfig)),
      );
      if (!allowed) changed = true;
      return allowed;
    });
    return changed ? filtered : segments;
  }

  private async resolveBundledRootWslPath(
    distro: string,
    bundledRoot: string,
  ): Promise<string | undefined> {
    const key = `${distro.toLowerCase()}\0${bundledRoot}`;
    const cached = this.bundledRootWslPaths.get(key);
    if (cached) return cached;
    const pending = (async () => {
      const linuxPath = await this.resolveHostPathForWsl(distro, bundledRoot);
      if (!linuxPath) return undefined;
      const [resolvedPath] = await this.options.resolveWslRealPaths(distro, [linuxPath]);
      return resolvedPath;
    })().catch(() => undefined);
    this.bundledRootWslPaths.set(key, pending);
    const resolvedPath = await pending;
    if (!resolvedPath) this.bundledRootWslPaths.delete(key);
    return resolvedPath;
  }
}
