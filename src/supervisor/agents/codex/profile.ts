import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import posixPath from "node:path/posix";
import type { ProjectLocation } from "@/shared/contracts";
import { toWslUncPath } from "@/shared/wsl";
import { resolveWslHomeDirectory } from "../base";

export function resolveCodexHomeFromBase(
  rawHomeDir: string | undefined,
  baseHome: string,
  pathKind: "native" | "posix",
): string {
  const trimmed = rawHomeDir?.trim();
  if (rawHomeDir !== undefined && !trimmed) throw new Error("Codex profile home is empty.");
  const paths = pathKind === "posix" ? posixPath : path;
  if (!trimmed) return paths.join(baseHome, ".codex");
  if (trimmed === "~" || trimmed.startsWith("~/")) {
    return paths.join(baseHome, trimmed === "~" ? "" : trimmed.slice(2));
  }
  return paths.isAbsolute(trimmed) ? paths.normalize(trimmed) : paths.resolve(baseHome, trimmed);
}

export function resolveCodexHomeForLocation(rawHomeDir: string, location: ProjectLocation): string {
  if (location.kind === "wsl") {
    const home = resolveWslHomeDirectory(location.distro);
    if (!home) {
      throw new Error(`Unable to resolve the WSL home directory for ${location.distro}.`);
    }
    return resolveCodexHomeFromBase(rawHomeDir, home, "posix");
  }
  return resolveCodexHomeFromBase(rawHomeDir, homedir(), "native");
}

/** Ensure Codex's custom home exists before invoking the CLI. */
export function ensureCodexHomeForLocation(rawHomeDir: string, location: ProjectLocation): string {
  const homeDir = resolveCodexHomeForLocation(rawHomeDir, location);
  const fsHome = location.kind === "wsl" ? toWslUncPath(location.distro, homeDir) : homeDir;
  mkdirSync(path.join(fsHome, "sessions"), { recursive: true });
  return homeDir;
}

export function codexHomeEnvForLocation(
  rawHomeDir: string | undefined,
  location: ProjectLocation,
): Record<string, string> | undefined {
  if (!rawHomeDir) return undefined;
  return {
    CODEX_HOME: ensureCodexHomeForLocation(rawHomeDir, location),
    // Account profiles must authenticate from their own CODEX_HOME. Empty
    // values deliberately shadow host-level credentials inherited by spawn.
    OPENAI_API_KEY: "",
    CODEX_API_KEY: "",
    CODEX_ACCESS_TOKEN: "",
  };
}
