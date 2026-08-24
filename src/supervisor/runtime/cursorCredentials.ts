import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { OAuthToken } from "@poracode/agents-usage";

const execFileAsync = promisify(execFile);
const KEYCHAIN_TIMEOUT_MS = 5_000;

/**
 * Resolve Cursor Agent's JWT access token without consulting the Cursor desktop
 * app. The desktop and CLI can be signed into different accounts, while usage
 * belongs to the CLI/SDK account selected by the main provider tile.
 *
 * The CLI stores the token in `auth.json` on Windows/Linux and can use the
 * macOS Keychain. No cookie capture and no browser involvement. Read-only; the
 * token is short-lived so it is read fresh each call.
 */
function cursorCliAuthPaths(): string[] {
  const home = homedir();
  if (process.platform === "win32") {
    const appData = process.env.APPDATA?.trim();
    return appData ? [join(appData, "Cursor", "auth.json")] : [];
  }
  return [join(home, ".cursor", "auth.json")];
}

/**
 * The `cursor.com` web API authenticates via a `WorkosCursorSessionToken` cookie
 * whose value is `<userId>::<jwt>`, NOT the bare JWT (a bare JWT is rejected with
 * 401). The userId is the JWT `sub` claim with its identity-provider prefix
 * stripped (e.g. `auth0|user_01ABC` → `user_01ABC`). Decode it from the access
 * token so the collector can compose the cookie. Returns undefined on any parse
 * failure — the collector then falls back to the bare token.
 */
export function cursorUserIdFromJwt(accessToken: string | undefined): string | undefined {
  if (!accessToken) return undefined;
  const payload = accessToken.split(".")[1];
  if (!payload) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      sub?: unknown;
    };
    if (typeof claims.sub !== "string" || !claims.sub) return undefined;
    const userId = claims.sub.split("|").pop()?.trim();
    return userId ? userId : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The Cursor CLI keychain namespace is `cursor`, so its per-secret services are
 * `cursor-<secret>` under one shared account `cursor-user`. We only read the
 * access token; the refresh token is left untouched (the CLI rotates it).
 */
export const CURSOR_CLI_KEYCHAIN_SERVICE = "cursor-access-token";
export const CURSOR_CLI_KEYCHAIN_ACCOUNT = "cursor-user";

/**
 * Read the Cursor CLI's session JWT from the macOS Keychain. File-backed CLI
 * auth is handled separately so Windows does not fall through to the desktop
 * app's account.
 */
async function readCursorCliKeychainToken(): Promise<string | undefined> {
  if (process.platform !== "darwin") return undefined;
  try {
    const { stdout } = await execFileAsync(
      "security",
      [
        "find-generic-password",
        "-a",
        CURSOR_CLI_KEYCHAIN_ACCOUNT,
        "-w",
        "-s",
        CURSOR_CLI_KEYCHAIN_SERVICE,
      ],
      { timeout: KEYCHAIN_TIMEOUT_MS, encoding: "utf8" },
    );
    const trimmed = stdout.trim();
    return trimmed || undefined;
  } catch {
    // Missing/locked keychains and CLI-not-signed-in degrade to auth-missing.
    return undefined;
  }
}

export function parseCursorCliAuth(
  content: string,
): { accessToken: string; refreshToken?: string } | undefined {
  try {
    const parsed = JSON.parse(content) as {
      accessToken?: unknown;
      refreshToken?: unknown;
    };
    if (typeof parsed.accessToken !== "string" || !parsed.accessToken.trim()) return undefined;
    return {
      accessToken: parsed.accessToken.trim(),
      ...(typeof parsed.refreshToken === "string" && parsed.refreshToken.trim()
        ? { refreshToken: parsed.refreshToken.trim() }
        : {}),
    };
  } catch {
    return undefined;
  }
}

async function resolveCursorCliAuthFile(): Promise<OAuthToken | undefined> {
  for (const path of cursorCliAuthPaths()) {
    try {
      const auth = parseCursorCliAuth(await readFile(path, "utf8"));
      if (!auth) continue;
      const userId = cursorUserIdFromJwt(auth.accessToken);
      const email = await readCursorCliEmail();
      return {
        ...auth,
        ...(userId ? { accountId: userId } : {}),
        ...(email ? { raw: { email } } : {}),
      };
    } catch {
      // Try the next CLI credential source.
    }
  }
  return undefined;
}

/** The CLI keeps the signed-in email in `~/.cursor/cli-config.json` → authInfo.email. */
export function parseCursorCliEmail(content: string): string | undefined {
  try {
    const parsed = JSON.parse(content) as { authInfo?: { email?: unknown } };
    const email = parsed.authInfo?.email;
    return typeof email === "string" && email.trim() ? email.trim() : undefined;
  } catch {
    return undefined;
  }
}

async function readCursorCliEmail(): Promise<string | undefined> {
  try {
    return parseCursorCliEmail(
      await readFile(join(homedir(), ".cursor", "cli-config.json"), "utf8"),
    );
  } catch {
    return undefined;
  }
}

/** Build the token bundle from the Cursor CLI (`cursor-agent`) session. */
async function resolveCursorCliToken(): Promise<OAuthToken | undefined> {
  const fromAuthFile = await resolveCursorCliAuthFile();
  if (fromAuthFile) return fromAuthFile;
  const accessToken = await readCursorCliKeychainToken();
  if (!accessToken) return undefined;
  const userId = cursorUserIdFromJwt(accessToken);
  const email = await readCursorCliEmail();
  return {
    accessToken,
    ...(userId ? { accountId: userId } : {}),
    ...(email ? { raw: { email } } : {}),
  };
}

export async function resolveCursorToken(): Promise<OAuthToken | undefined> {
  return resolveCursorCliToken();
}
