import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { normalizeWslListOutput } from "@/shared/wsl";
import { batchWslCommandsAsync, getWslCommand } from "../agents/base";

const execFileAsync = promisify(execFile);

/**
 * WSL-side credential fallback. When a provider's native (Windows host) creds
 * are missing, the user may be signed in only inside a WSL distro — read the
 * creds from there. The token works regardless of which environment fetches
 * with it, so this yields one combined snapshot (no dual-env UI).
 *
 * win32-only and best-effort: reads run through a login shell (so `gh` is on
 * PATH) and only when native resolution already failed. Secrets are never
 * logged. Commands avoid quotes so the login-shell wrapper doesn't mis-escape.
 *
 * The sweep only runs when the user actively uses WSL (a watched WSL project
 * or a live WSL session — see `setWslCredentialProjectScope`): every read goes
 * through the per-distro bridge, which boots the distro's VM and leaves a
 * resident helper process inside it, so probing without any WSL usage would
 * keep `VmmemWSL` alive for no benefit.
 */

let hasActiveWslContext: (() => boolean) | undefined;

/**
 * Late-bound by the supervisor at boot. When the predicate reports no WSL
 * activity, all `read*FromWsl` helpers short-circuit to `undefined` without
 * touching any distro. Unset means unconstrained (tests, non-supervisor
 * consumers).
 */
export function setWslCredentialProjectScope(predicate: (() => boolean) | undefined): () => void {
  hasActiveWslContext = predicate;
  return () => {
    if (hasActiveWslContext === predicate) hasActiveWslContext = undefined;
  };
}

async function listWslDistros(): Promise<string[]> {
  if (process.platform !== "win32") return [];
  try {
    const { stdout } = await execFileAsync(getWslCommand(), ["-l", "-q"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 5_000,
    });
    return normalizeWslListOutput(stdout ?? "");
  } catch {
    return [];
  }
}

/** Run a read command in each distro; return the first non-empty stdout. */
async function readFromAnyWslDistro(command: string): Promise<string | undefined> {
  if (hasActiveWslContext && !hasActiveWslContext()) return undefined;
  for (const distro of await listWslDistros()) {
    try {
      const [result] = await batchWslCommandsAsync(distro, [command]);
      const out = result?.ok ? result.stdout.trim() : "";
      if (out) return out;
    } catch {
      // try the next distro
    }
  }
  return undefined;
}

export function readClaudeCredsFromWsl(): Promise<string | undefined> {
  return readFromAnyWslDistro("cat $HOME/.claude/.credentials.json 2>/dev/null");
}

export function readCodexAuthFromWsl(): Promise<string | undefined> {
  return readFromAnyWslDistro("cat $HOME/.codex/auth.json 2>/dev/null");
}

export function readCommandCodeApiKeyFromWsl(): Promise<string | undefined> {
  return readFromAnyWslDistro("printenv COMMAND_CODE_API_KEY 2>/dev/null");
}

export function readCommandCodeAuthFromWsl(): Promise<string | undefined> {
  return readFromAnyWslDistro("cat $HOME/.commandcode/auth.json 2>/dev/null");
}

export function readCopilotTokenFromWsl(): Promise<string | undefined> {
  return readFromAnyWslDistro("gh auth token 2>/dev/null");
}

export function readGrokAuthFromWsl(): Promise<string | undefined> {
  return readFromAnyWslDistro("cat $HOME/.grok/auth.json 2>/dev/null");
}

export function readGeminiCredsFromWsl(): Promise<string | undefined> {
  return readFromAnyWslDistro("cat $HOME/.gemini/oauth_creds.json 2>/dev/null");
}
