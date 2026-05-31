import { spawnSync } from "node:child_process";
import type { AgentKind, ProjectLocation } from "@/shared/contracts";

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
    return false;
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

export function getClaudeL2TerminalEnv(input: {
  agentKind: AgentKind;
  projectLocation: ProjectLocation;
  disableCliHookPlugin: boolean;
  cliHookEnvInjected: boolean;
}): Record<string, string> {
  if (input.agentKind !== "claude") {
    return {};
  }
  if (!input.disableCliHookPlugin && input.cliHookEnvInjected) {
    return {};
  }
  return {
    TERM_PROGRAM: "iTerm.app",
    TERM_PROGRAM_VERSION: "3.6.6",
  };
}
