import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Native (non-WSL) Kimi Code home and credential paths.
 *
 * Kept in its own leaf module — `detection.ts`, `sessionFiles.ts`,
 * `kimiTrust.ts` and the supervisor's credential reader all need them, and
 * detection now depends on kimiTrust, so a shared import here is what keeps
 * that from becoming an import cycle.
 */

export function nativeKimiHomePath(): string {
  const kimiHome = process.env["KIMI_CODE_HOME"];
  return kimiHome && kimiHome.trim().length > 0 ? kimiHome : join(homedir(), ".kimi-code");
}

export function nativeKimiOAuthCredentialPath(): string {
  return join(nativeKimiHomePath(), "credentials", "kimi-code.json");
}
