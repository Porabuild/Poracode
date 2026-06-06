import { spawnSync } from "node:child_process";
import type { AgentKind, ProjectLocation } from "@/shared/contracts";
import { getWslCommand } from "../../agents/base";

const GHOSTTY_TERM = "xterm-ghostty";
const FALLBACK_TERM = "xterm-256color";
const terminfoTermCache = new Map<string, string>();

export type TerminalColorEnv = {
  TERM: string;
  COLORTERM: string;
};

function terminalTermCacheKey(location: ProjectLocation): string {
  if (location.kind === "wsl") return `wsl:${location.distro}`;
  return `host:${process.platform}`;
}

function hasGhosttyTerminfo(location: ProjectLocation): boolean {
  const options = { stdio: "ignore" as const, timeout: 250, windowsHide: true };
  if (location.kind === "wsl") {
    // WSL terminfo lives in the distro, so probe it through wsl.exe. The
    // terminal/PTY path intentionally stays on direct wsl.exe (not the bridge),
    // and the result is cached per distro so this runs at most once per distro.
    if (process.platform !== "win32") return false;
    const result = spawnSync(
      getWslCommand(),
      ["-d", location.distro, "--", "sh", "-lc", `infocmp -x ${GHOSTTY_TERM} >/dev/null 2>&1`],
      options,
    );
    return result?.status === 0;
  }
  if (process.platform === "win32") return false;
  return spawnSync("infocmp", ["-x", GHOSTTY_TERM], options)?.status === 0;
}

export function resolveTerminalColorEnv(location: ProjectLocation): TerminalColorEnv {
  const key = terminalTermCacheKey(location);
  const cached = terminfoTermCache.get(key);
  if (cached) {
    return { TERM: cached, COLORTERM: "truecolor" };
  }
  if (hasGhosttyTerminfo(location)) {
    terminfoTermCache.set(key, GHOSTTY_TERM);
    return { TERM: GHOSTTY_TERM, COLORTERM: "truecolor" };
  }
  return { TERM: FALLBACK_TERM, COLORTERM: "truecolor" };
}

const ITERM2_STATUS_ENV = {
  TERM_PROGRAM: "iTerm.app",
  TERM_PROGRAM_VERSION: "3.6.6",
};

export function getIterm2StatusL2TerminalEnv(input: {
  agentKind: AgentKind;
  projectLocation: ProjectLocation;
  disableCliHookPlugin: boolean;
  cliHookEnvInjected: boolean;
}): Record<string, string> {
  if (input.agentKind === "copilot") {
    return ITERM2_STATUS_ENV;
  }

  if (input.agentKind !== "claude" && input.agentKind !== "gemini") {
    return {};
  }

  if (!input.disableCliHookPlugin && input.cliHookEnvInjected) {
    return {};
  }

  return ITERM2_STATUS_ENV;
}
