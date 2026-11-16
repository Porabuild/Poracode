import { mkdir } from "node:fs/promises";
import type { ProjectLocation } from "@/shared/contracts";
import { resolveTildePath, type DetectionSpec } from "../base";
import { ensureWslDirectory } from "../plugin/installerBase";
import { geminiDetectionSpec } from "./detection";

export interface GeminiAdapterOptions {
  /** Instance-scoped agent kind (`gemini:<id>`) for a profile. */
  kind?: string;
  /** Display label shown wherever the base "Gemini" label would be. */
  label?: string;
  /** Profile instance id. */
  profileId?: string;
  /**
   * Directory passed to Gemini CLI as `GEMINI_CLI_HOME`. A leading `~/` is
   * resolved against the target runtime (native home or WSL home).
   */
  homeDir?: string;
}

/**
 * Host-level credentials and keychain backends a profile launch must not share.
 * Gemini CLI can authenticate from these env vars instead of `GEMINI_CLI_HOME`,
 * and `KeychainService` ignores `GEMINI_CLI_HOME` to read/write the shared OS
 * Keychain unless `GEMINI_FORCE_FILE_STORAGE=true` forces per-home
 * `FileKeychain` (`$GEMINI_CLI_HOME/.gemini/gemini-credentials.json`).
 */
export const GEMINI_BLANKED_HOST_CREDENTIALS: Readonly<Record<string, string>> = {
  GEMINI_API_KEY: "",
  GOOGLE_API_KEY: "",
  GOOGLE_APPLICATION_CREDENTIALS: "",
  GOOGLE_GEMINI_BASE_URL: "",
  GEMINI_HOME: "",
  GEMINI_FORCE_FILE_STORAGE: "true",
};

/** Profile-owned paths and environments, shared by every adapter launch lane. */
export function createGeminiProfileContext(options: GeminiAdapterOptions) {
  const kind = options.kind ?? geminiDetectionSpec.kind;
  const label = options.label ?? geminiDetectionSpec.label;
  const profileId = options.profileId;
  const isProfile = options.homeDir !== undefined && profileId !== undefined;

  const profileHome = async (location: ProjectLocation): Promise<string | undefined> => {
    if (options.homeDir === undefined) return undefined;
    const home = await resolveTildePath(options.homeDir, location);
    if (location.kind === "wsl") {
      if (!home.startsWith("/")) {
        throw new Error(
          `Unable to resolve the Gemini profile home inside WSL distro "${location.distro}".`,
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
    return home ? { GEMINI_CLI_HOME: home, ...GEMINI_BLANKED_HOST_CREDENTIALS } : undefined;
  };

  const detectionSpec: DetectionSpec = isProfile
    ? {
        ...geminiDetectionSpec,
        kind,
        label,
      }
    : geminiDetectionSpec;

  return {
    profileEnv,
    detectionSpec,
  };
}
