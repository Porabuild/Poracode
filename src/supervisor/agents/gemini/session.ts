import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import { batchWslCommandsAsync, quotePosixShellArg } from "../base";

const INVALID_SESSION_RE = /Error resuming session:\s+Invalid session identifier/i;
const DEFAULT_RESUME_ARTIFACT_TIMEOUT_MS = 15_000;
const RESUME_ARTIFACT_POLL_MS = 200;

export function detectGeminiInvalidSessionRef(output: string): boolean {
  return INVALID_SESSION_RE.test(output);
}

export function readEffectiveGeminiEnvVar(
  name: string,
  env?: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const raw = env && name in env ? env[name] : process.env[name];
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resolve Gemini CLI's `.gemini` config directory on the host.
 * Honors `GEMINI_CLI_HOME` (`<GEMINI_CLI_HOME>/.gemini`) first, then legacy
 * `GEMINI_HOME`, falling back to `~/.gemini`.
 */
export function resolveGeminiConfigDir(
  env?: Readonly<Record<string, string | undefined>>,
  hostHomeDir: string = homedir(),
): string {
  const cliHome = readEffectiveGeminiEnvVar("GEMINI_CLI_HOME", env);
  if (cliHome) return join(cliHome, ".gemini");
  const legacyHome = readEffectiveGeminiEnvVar("GEMINI_HOME", env);
  if (legacyHome) return legacyHome;
  return join(hostHomeDir, ".gemini");
}

/**
 * Build a POSIX shell snippet that sets `$gemini_config_dir` inside WSL while
 * respecting explicit profile overrides (`GEMINI_CLI_HOME` / `GEMINI_HOME`).
 */
export function buildWslGeminiConfigDirShellAssign(
  env?: Readonly<Record<string, string | undefined>>,
): string {
  const cliHome = env && "GEMINI_CLI_HOME" in env ? env.GEMINI_CLI_HOME?.trim() : undefined;
  if (cliHome) return `gemini_config_dir=${quotePosixShellArg(`${cliHome}/.gemini`)}`;
  const legacyHome = env && "GEMINI_HOME" in env ? env.GEMINI_HOME?.trim() : undefined;
  if (legacyHome) return `gemini_config_dir=${quotePosixShellArg(legacyHome)}`;
  return 'gemini_config_dir="${GEMINI_CLI_HOME:+$GEMINI_CLI_HOME/.gemini}"; gemini_config_dir="${gemini_config_dir:-${GEMINI_HOME:-$HOME/.gemini}}"';
}

function shortSessionId(sessionId: string): { lowerFull: string; shortId: string } {
  const lowerFull = sessionId.toLowerCase();
  const shortId = lowerFull.split("-")[0] || lowerFull.slice(0, 8);
  return { lowerFull, shortId };
}

function isGeminiChatArtifact(name: string, shortId: string, fullId: string): boolean {
  const lower = name.toLowerCase();
  if (!lower.endsWith(".json") && !lower.endsWith(".jsonl")) return false;
  return lower.includes(shortId) || lower.includes(fullId);
}

async function findNativeGeminiResumeArtifact(
  configDir: string,
  sessionId: string,
): Promise<string | undefined> {
  const tmpDir = join(configDir, "tmp");
  const { lowerFull, shortId } = shortSessionId(sessionId);
  if (!shortId) return undefined;

  let projectDirs: string[];
  try {
    projectDirs = await readdir(tmpDir);
  } catch {
    return undefined;
  }

  for (const projectEntry of projectDirs) {
    const chatsDir = join(tmpDir, projectEntry, "chats");
    let chatFiles: string[];
    try {
      chatFiles = await readdir(chatsDir);
    } catch {
      continue;
    }
    for (const file of chatFiles) {
      if (!isGeminiChatArtifact(file, shortId, lowerFull)) continue;
      const fullPath = join(chatsDir, file);
      try {
        if ((await stat(fullPath)).size > 0) return fullPath;
      } catch {
        continue;
      }
    }
  }
  return undefined;
}

async function hasWslGeminiResumeArtifact(
  distro: string,
  sessionId: string,
  env?: Readonly<Record<string, string | undefined>>,
  signal?: AbortSignal,
): Promise<boolean> {
  const { shortId } = shortSessionId(sessionId);
  if (!shortId) return false;
  const assign = buildWslGeminiConfigDirShellAssign(env);
  const patternShort = quotePosixShellArg(`*${shortId}*`);
  const cmd = `${assign}; find "$gemini_config_dir/tmp" -maxdepth 3 -type f \\( -name ${patternShort}.json -o -name ${patternShort}.jsonl \\) -size +0c 2>/dev/null | head -n 1`;
  const [result] = await batchWslCommandsAsync(distro, [cmd], signal);
  return Boolean(result?.ok && result.stdout.trim().length > 0);
}

function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms));
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Gemini's ACP mode persists the conversation file under
 * `<configDir>/tmp/<projectDir>/chats/session-*-<uuid8>.{json,jsonl}`
 * during prompt processing. Wait briefly so handoff `--resume <id>` works
 * reliably across `GEMINI_CLI_HOME` profiles, short-ID workspace dirs, v0.68.0
 * `.jsonl` logs, and WSL distros.
 */
export async function waitForGeminiResumeArtifact(
  sessionId: string,
  options: {
    projectLocation: ProjectLocation;
    env?: Readonly<Record<string, string | undefined>>;
    hostHomeDir?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
    pollIntervalMs?: number;
  },
): Promise<boolean> {
  const trimmedId = sessionId.trim();
  if (!trimmedId) return false;

  const timeoutMs = options.timeoutMs ?? DEFAULT_RESUME_ARTIFACT_TIMEOUT_MS;
  const pollMs = options.pollIntervalMs ?? RESUME_ARTIFACT_POLL_MS;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    if (options.signal?.aborted) return false;
    if (options.projectLocation.kind === "wsl") {
      if (
        await hasWslGeminiResumeArtifact(
          options.projectLocation.distro,
          trimmedId,
          options.env,
          options.signal,
        )
      ) {
        return true;
      }
    } else {
      const configDir = resolveGeminiConfigDir(options.env, options.hostHomeDir);
      if (await findNativeGeminiResumeArtifact(configDir, trimmedId)) {
        return true;
      }
    }
    if (Date.now() >= deadline) return false;
    await sleepAbortable(Math.min(pollMs, Math.max(1, deadline - Date.now())), options.signal);
  }
}
