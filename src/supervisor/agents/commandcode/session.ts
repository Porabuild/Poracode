import { existsSync, readFileSync } from "node:fs";
import type { ProjectLocation } from "@/shared/contracts";
import { resolveAgentHomeSubpath } from "../base";

// `command-code login` writes the issued API key plus user metadata to
// `~/.commandcode/auth.json`. That file is absent until a login completes (the
// surrounding config dir is created on first run regardless), so a non-empty
// `apiKey` in it is the reliable "signed in" signal. We only confirm the key is
// present and never read its value.
const COMMANDCODE_AUTH_FILE_SUBPATH = ".commandcode/auth.json";

// True when `auth.json`'s contents carry a non-empty `apiKey`. Split out from
// the filesystem glue below so the sign-in rule is unit-testable without fs.
export function authJsonHasApiKey(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { apiKey?: unknown };
    return typeof parsed.apiKey === "string" && parsed.apiKey.length > 0;
  } catch {
    return false;
  }
}

export function commandCodeHasStoredCredentials(location: ProjectLocation): boolean {
  const authFile = resolveAgentHomeSubpath(location, COMMANDCODE_AUTH_FILE_SUBPATH);
  if (!authFile || !existsSync(authFile)) return false;
  try {
    return authJsonHasApiKey(readFileSync(authFile, "utf8"));
  } catch {
    return false;
  }
}

// Emitted by `--continue` when there is no prior conversation in the cwd, or by
// a stale resume. Returning true here lets the runtime drop the (synthetic)
// sessionRef and relaunch fresh instead of looping on a dead resume.
const INVALID_SESSION_RE =
  /no\s+(?:previous\s+)?conversation|nothing\s+to\s+continue|no\s+session\s+to\s+(?:resume|continue)/i;

export function detectCommandCodeInvalidSessionRef(output: string): boolean {
  return INVALID_SESSION_RE.test(output);
}
