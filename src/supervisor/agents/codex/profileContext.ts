import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import {
  configFileAuthProbe,
  detectProbeLocation,
  resolveTildePath,
  type AgentEnvContext,
  type DetectionSpec,
} from "../base";
import { resolveNativeTildePath } from "../base/sessionFs";
import { ensureWslDirectory } from "../plugin/installerBase";
import { codexDetectionSpec } from "./detection";
import type { CodexPluginDiscoveryHome } from "./nativePlugins";
import { getCodexPluginPaths, type CodexHomeOverlay } from "./plugin/install";

export interface CodexAdapterOptions {
  /** Instance-scoped agent kind (`codex:<id>`) for a profile. */
  kind?: string;
  /** Display label shown wherever the base "Codex" label would be. */
  label?: string;
  /** Profile instance id — names the hook plugin's per-profile overlay. */
  profileId?: string;
  /**
   * Directory passed to Codex as CODEX_HOME. A leading "~/" is resolved
   * against the target runtime (native home or WSL home).
   */
  homeDir?: string;
}

/**
 * Host-level credentials a profile launch must not inherit. Codex can
 * authenticate from these variables instead of the `auth.json` in
 * `CODEX_HOME`, so a key exported in the user's shell could silently run a
 * profile as the host account. Empty values shadow the inherited ones.
 */
const BLANKED_HOST_CREDENTIALS: Readonly<Record<string, string>> = {
  OPENAI_API_KEY: "",
  CODEX_API_KEY: "",
  CODEX_ACCESS_TOKEN: "",
};

/** Profile-owned paths and environments, shared by every adapter launch lane. */
export function createCodexProfileContext(options: CodexAdapterOptions) {
  const kind = options.kind ?? codexDetectionSpec.kind;
  const label = options.label ?? codexDetectionSpec.label;
  const profileId = options.profileId;
  const isProfile = options.homeDir !== undefined && profileId !== undefined;
  /**
   * The profile's resolved CODEX_HOME for `location`, or undefined for the
   * base adapter. Codex refuses to start ("CODEX_HOME points to … but that
   * path does not exist") when the directory is missing, and a fresh profile
   * has nothing on disk until its first login — so create it here, on the
   * host or through the distro staging worker before any probe/login/launch.
   */
  const profileHome = async (location: ProjectLocation): Promise<string | undefined> => {
    if (options.homeDir === undefined) return undefined;
    const home = await resolveTildePath(options.homeDir, location);
    if (location.kind === "wsl") {
      if (!home.startsWith("/")) {
        throw new Error(
          `Unable to resolve the Codex profile home inside WSL distro "${location.distro}".`,
        );
      }
      await ensureWslDirectory(location.distro, home);
    } else {
      await mkdir(home, { recursive: true });
    }
    return home;
  };
  const profileEnv = async (
    location: ProjectLocation,
  ): Promise<Record<string, string> | undefined> => {
    const home = await profileHome(location);
    return home ? { CODEX_HOME: home, ...BLANKED_HOST_CREDENTIALS } : undefined;
  };
  const withProfileEnv = async <T extends { env?: Record<string, string> }>(
    spec: T,
    location: ProjectLocation,
  ): Promise<T> => {
    const env = await profileEnv(location);
    return env ? { ...spec, env: { ...(spec.env ?? {}), ...env } } : spec;
  };
  /** Hook overlay for native contexts; WSL profiles run without the hook plugin. */
  const overlayFor = async (ctx?: AgentEnvContext): Promise<CodexHomeOverlay | undefined> => {
    if (!isProfile || !profileId || ctx?.envKind === "wsl") return undefined;
    const home = await profileHome(detectProbeLocation(ctx));
    return home ? { profileId, sourceHomeDir: home } : undefined;
  };
  /** Native homes whose `sessions/` the profile owns: its CODEX_HOME and its overlay. */
  const sessionHomes = async (location: ProjectLocation): Promise<string[] | undefined> => {
    const home = await profileHome(location);
    if (!home || !profileId) return undefined;
    if (location.kind === "wsl") return [home];
    const ctx: AgentEnvContext = {
      envKind: location.kind,
      ...(process.env.PORACODE_DATA_DIR ? { baseDir: process.env.PORACODE_DATA_DIR } : {}),
    };
    const overlay = (await getCodexPluginPaths(ctx, { profileId, sourceHomeDir: home }))
      .codexHomeDir;
    return [home, overlay];
  };
  /**
   * The home native-plugin discovery must inspect: the same `CODEX_HOME` a
   * launch uses, so plugins enabled only in the base account never suppress
   * the MCP/skill fallbacks this profile needs (and vice versa).
   */
  const pluginDiscoveryHome = async (
    ctx: AgentEnvContext,
  ): Promise<CodexPluginDiscoveryHome | undefined> => {
    if (!isProfile || !profileId) return undefined;
    const home = await profileHome(detectProbeLocation(ctx));
    if (!home) return undefined;
    return ctx.envKind === "wsl"
      ? { homeDir: home }
      : { homeDir: home, overlay: { profileId, sourceHomeDir: home } };
  };
  const detectionSpec: DetectionSpec = isProfile
    ? {
        ...codexDetectionSpec,
        kind,
        label,
        authProbes: [
          configFileAuthProbe((loc) => {
            const home =
              loc.kind !== "wsl" && options.homeDir !== undefined
                ? resolveNativeTildePath(options.homeDir)
                : undefined;
            return home ? join(home, "auth.json") : undefined;
          }),
        ],
      }
    : codexDetectionSpec;

  return {
    isProfile,
    profileEnv,
    withProfileEnv,
    overlayFor,
    sessionHomes,
    pluginDiscoveryHome,
    detectionSpec,
  };
}
