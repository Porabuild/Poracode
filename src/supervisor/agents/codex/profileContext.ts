import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import { toWslUncPath } from "@/shared/wsl";
import {
  configFileAuthProbe,
  detectProbeLocation,
  resolveTildePath,
  type AgentEnvContext,
  type DetectionSpec,
} from "../base";
import { codexDetectionSpec } from "./detection";
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
   * host or via the distro UNC path before any probe/login/launch.
   */
  const profileHome = (location: ProjectLocation): string | undefined => {
    if (options.homeDir === undefined) return undefined;
    const home = resolveTildePath(options.homeDir, location);
    const diskPath = location.kind === "wsl" ? toWslUncPath(location.distro, home) : home;
    mkdirSync(diskPath, { recursive: true });
    return home;
  };
  const profileEnv = (location: ProjectLocation): Record<string, string> | undefined => {
    const home = profileHome(location);
    return home ? { CODEX_HOME: home } : undefined;
  };
  const withProfileEnv = <T extends { env?: Record<string, string> }>(
    spec: T,
    location: ProjectLocation,
  ): T => {
    const env = profileEnv(location);
    return env ? { ...spec, env: { ...(spec.env ?? {}), ...env } } : spec;
  };
  /** Hook overlay for native contexts; WSL profiles run without the hook plugin. */
  const overlayFor = (ctx?: AgentEnvContext): CodexHomeOverlay | undefined => {
    if (!isProfile || !profileId || ctx?.envKind === "wsl") return undefined;
    const home = profileHome(detectProbeLocation(ctx));
    return home ? { profileId, sourceHomeDir: home } : undefined;
  };
  /** Native homes whose `sessions/` the profile owns: its CODEX_HOME and its overlay. */
  const sessionHomes = (location: ProjectLocation): string[] | undefined => {
    const home = profileHome(location);
    if (!home || !profileId) return undefined;
    if (location.kind === "wsl") return [home];
    const ctx: AgentEnvContext = {
      envKind: location.kind,
      ...(process.env.PORACODE_DATA_DIR ? { baseDir: process.env.PORACODE_DATA_DIR } : {}),
    };
    const overlay = getCodexPluginPaths(ctx, { profileId, sourceHomeDir: home }).codexHomeDir;
    return [home, overlay];
  };
  const detectionSpec: DetectionSpec = isProfile
    ? {
        ...codexDetectionSpec,
        kind,
        label,
        authProbes: [
          configFileAuthProbe((loc) => {
            const home = loc.kind === "wsl" ? undefined : profileHome(loc);
            return home ? join(home, "auth.json") : undefined;
          }),
        ],
      }
    : codexDetectionSpec;

  return { isProfile, profileEnv, withProfileEnv, overlayFor, sessionHomes, detectionSpec };
}
