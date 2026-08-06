import { posix } from "node:path";
import type {
  AgentCapability,
  InstalledPlugins,
  LoadedPlugin,
  ProjectLocation,
  PromptSegment,
  SkillEntry,
  ThreadConfig,
  ThreadPresentationMode,
} from "@/shared/contracts";
import { isPluginSkillEnabled, isPluginSkillSupportedForLaunch } from "@/shared/plugins/catalog";
import { relativePolicyPath } from "@/supervisor/plugins";
import { parseWslUncPath } from "@/shared/wsl";
import { batchWslCommandsAsync, quotePosixShellArg } from "../agents/base";

/**
 * Enforces plugin policy on skills contributed by Agent Plugins packages.
 *
 * Each package owns its own `skills/` root, so containment is checked against
 * that package's boundary rather than a shared directory: a skill can only be
 * attributed to — and injected on behalf of — the plugin it actually lives in.
 */

const SKILL_FILE = "SKILL.md";

/** Provider id used for skills contributed by a plugin. */
export function pluginSkillProviderId(pluginName: string): string {
  return `plugin:${pluginName}`;
}

export interface PluginSkillRoot {
  plugin: LoadedPlugin;
  /** `<plugin.root>/skills`, the root a plugin's skill entries are scanned from. */
  skillsRoot: string;
}

export interface PluginSkillPolicyContext {
  projectLocation?: ProjectLocation;
  capabilities?: AgentCapability;
  presentationMode?: ThreadPresentationMode;
  launchConfig?: ThreadConfig;
}

export interface PluginSkillPolicyOptions {
  readPluginRoots: () => readonly PluginSkillRoot[];
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

function normalizeRootKey(path: string): string {
  return path
    .replace(/[\\/]+$/u, "")
    .replace(/\\/gu, "/")
    .toLowerCase();
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

/** A skill segment matched to the plugin whose package boundary contains it. */
interface MatchedSegment {
  root: PluginSkillRoot;
  relativePath: string;
}

export class PluginSkillPolicy {
  private readonly wslRootPaths = new Map<string, Promise<string | undefined>>();
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

  /**
   * Labels plugin-contributed entries and hides the ones whose plugin is not
   * installed or cannot run in this environment.
   */
  resolveScanEntries(
    entries: readonly SkillEntry[],
    context: PluginSkillPolicyContext,
  ): SkillEntry[] {
    const roots = this.options.readPluginRoots();
    if (roots.length === 0) return [...entries];
    const byRoot = new Map(roots.map((root) => [normalizeRootKey(root.skillsRoot), root]));
    const installedPlugins = this.options.readInstalledPlugins();

    return entries.flatMap((skill) => {
      const root = byRoot.get(normalizeRootKey(skill.rootPath));
      if (!root) return [skill];
      const { plugin } = root;
      const state = installedPlugins[plugin.name];
      if (!state) return [];
      if (!this.isSupported(plugin, context)) return [];
      const label = plugin.poracode.title ?? plugin.name;
      return [
        {
          ...skill,
          id: `${skill.scope}:plugin:${plugin.name}:${skill.folderName}`,
          providerId: pluginSkillProviderId(plugin.name),
          providerLabel: label,
          providerGroupId: pluginSkillProviderId(plugin.name),
          providerGroupLabel: label,
          providerGroupOrder: -2,
          origin: "plugin" as const,
          pluginId: plugin.name,
          pluginName: label,
          enabled: isPluginSkillEnabled(plugin, state, skill.folderName),
        },
      ];
    });
  }

  /**
   * Drops plugin skill segments that policy does not allow into a launch. A
   * segment inside a plugin's boundary that no longer passes is removed; a
   * segment that only *looks* like it belongs to a plugin is left alone.
   */
  async filterSegments(
    segments: PromptSegment[],
    context: PluginSkillPolicyContext = {},
  ): Promise<PromptSegment[]> {
    const roots = this.options.readPluginRoots();
    if (roots.length === 0 || !segments.some((segment) => segment.kind === "skill")) {
      return segments;
    }

    const matched = new Map<PromptSegment, MatchedSegment>();
    const unresolvedWslPaths = new Map<
      string,
      Array<{ segment: PromptSegment; linuxPath: string }>
    >();
    for (const segment of segments) {
      if (segment.kind !== "skill") continue;
      const hostMatch = this.matchHostPath(roots, segment.path);
      if (hostMatch) {
        matched.set(segment, hostMatch);
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
        const wslRoots = await this.resolveWslRoots(distro, roots);
        if (wslRoots.length === 0) {
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
          const hostMatch = windowsPath ? this.matchHostPath(roots, windowsPath) : undefined;
          if (hostMatch) {
            matched.set(segment, hostMatch);
            return;
          }
          for (const { root, wslRoot } of wslRoots) {
            const relativePath = relativeWslPolicyPath(wslRoot, resolvedPath);
            if (relativePath) {
              matched.set(segment, { root, relativePath });
              return;
            }
          }
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
      const match = matched.get(segment);
      if (!match) return true;
      const parts = match.relativePath.split(/[\\/]/u);
      const folder = parts[0]!;
      const { plugin } = match.root;
      const state = installedPlugins[plugin.name];
      const allowed = Boolean(
        parts.length === 2 &&
        parts[1] === SKILL_FILE &&
        state &&
        this.isSupported(plugin, context) &&
        isPluginSkillEnabled(plugin, state, folder),
      );
      if (!allowed) changed = true;
      return allowed;
    });
    return changed ? filtered : segments;
  }

  private isSupported(plugin: LoadedPlugin, context: PluginSkillPolicyContext): boolean {
    return isPluginSkillSupportedForLaunch(plugin, {
      hostPlatform: this.options.hostPlatform,
      ...(context.projectLocation ? { projectLocation: context.projectLocation } : {}),
    });
  }

  /** WSL skill folder names are case-sensitive, so match is case-preserving here. */
  private matchHostPath(
    roots: readonly PluginSkillRoot[],
    path: string,
  ): MatchedSegment | undefined {
    for (const root of roots) {
      const relativePath = relativePolicyPath(root.skillsRoot, path);
      if (relativePath) return { root, relativePath };
    }
    return undefined;
  }

  private async resolveWslRoots(
    distro: string,
    roots: readonly PluginSkillRoot[],
  ): Promise<Array<{ root: PluginSkillRoot; wslRoot: string }>> {
    const resolved = await Promise.all(
      roots.map(async (root) => {
        const wslRoot = await this.resolveWslRootPath(distro, root.skillsRoot);
        return wslRoot ? { root, wslRoot } : undefined;
      }),
    );
    return resolved.filter((entry) => entry !== undefined);
  }

  private async resolveWslRootPath(distro: string, hostRoot: string): Promise<string | undefined> {
    const key = `${distro.toLowerCase()}\0${hostRoot}`;
    const cached = this.wslRootPaths.get(key);
    if (cached) return cached;
    const pending = (async () => {
      const linuxPath = await this.resolveHostPathForWsl(distro, hostRoot);
      if (!linuxPath) return undefined;
      const [resolvedPath] = await this.options.resolveWslRealPaths(distro, [linuxPath]);
      return resolvedPath;
    })().catch(() => undefined);
    this.wslRootPaths.set(key, pending);
    const resolvedPath = await pending;
    if (!resolvedPath) this.wslRootPaths.delete(key);
    return resolvedPath;
  }
}
