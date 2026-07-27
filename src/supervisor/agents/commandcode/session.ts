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
    return typeof parsed.apiKey === "string" && parsed.apiKey.trim().length > 0;
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

// Emitted when a resume target is missing or unloadable: `--continue` with no
// prior conversation (`No conversations found to resume.`), `--resume <id>`
// with an unknown id (`No session "<id>" found to resume.`), or a corrupt
// transcript (`Session could not be loaded. N lines could not be parsed.`).
// Returning true lets the runtime drop the dead ref and relaunch fresh instead
// of looping on it. The `found to resume` / `could not be loaded` anchors are
// specific enough not to fire on ordinary agent output during launch.
const INVALID_SESSION_RE =
  /no\s+(?:previous\s+)?conversation|nothing\s+to\s+continue|no\s+session\s+to\s+(?:resume|continue)|found\s+to\s+resume|session\s+could\s+not\s+be\s+loaded|lines?\s+could\s+not\s+be\s+parsed/i;

export function detectCommandCodeInvalidSessionRef(output: string): boolean {
  return INVALID_SESSION_RE.test(output);
}
