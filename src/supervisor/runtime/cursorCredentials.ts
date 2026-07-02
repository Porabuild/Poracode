import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { OAuthToken } from "@lightcode/agents-usage";
import { withReadonlyDb } from "./sqliteRead";

const execFileAsync = promisify(execFile);
const KEYCHAIN_TIMEOUT_MS = 5_000;

/**
 * Resolve Cursor's JWT access token from whichever Cursor install is signed in:
 *
 * 1. The Cursor desktop app's `state.vscdb` SQLite store (table `ItemTable`,
 *    key `cursorAuth/accessToken`) — the same place the IDE keeps it.
 * 2. The Cursor CLI (`cursor-agent`), which keeps no token in `state.vscdb`;
 *    it shells out to `/usr/bin/security` and stores the JWT in the macOS
 *    Keychain (service `cursor-access-token`, account `cursor-user`). Without
 *    this fallback a CLI-only install (no IDE) reads as "Not signed in".
 *
 * No cookie capture and no browser involvement. Read-only; the token is
 * short-lived so it is read fresh each call.
 */

function cursorStateDbPaths(): string[] {
  const home = homedir();
  if (process.platform === "win32") {
    const appData = process.env.APPDATA?.trim();
    return appData ? [join(appData, "Cursor", "User", "globalStorage", "state.vscdb")] : [];
  }
  if (process.platform === "darwin") {
    return [
      join(
        home,
        "Library",
        "Application Support",
        "Cursor",
        "User",
        "globalStorage",
        "state.vscdb",
      ),
    ];
  }
  const configHome = process.env.XDG_CONFIG_HOME?.trim() || join(home, ".config");
  return [join(configHome, "Cursor", "User", "globalStorage", "state.vscdb")];
}

const MEMBERSHIP_LABELS: Record<string, string> = {
  free: "Cursor Free",
  free_trial: "Cursor Free Trial",
  pro: "Cursor Pro",
  pro_plus: "Cursor Pro+",
  ultra: "Cursor Ultra",
  business: "Cursor Business",
  team: "Cursor Team",
  enterprise: "Cursor Enterprise",
};

function formatMembership(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return MEMBERSHIP_LABELS[value.toLowerCase()] ?? value;
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

/** ItemTable values may be raw strings or JSON-encoded strings; normalize both. */
function unquote(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed || undefined;
}

/**
 * The Cursor CLI keychain namespace is `cursor`, so its per-secret services are
 * `cursor-<secret>` under one shared account `cursor-user`. We only read the
 * access token; the refresh token is left untouched (the CLI rotates it).
 */
export const CURSOR_CLI_KEYCHAIN_SERVICE = "cursor-access-token";
export const CURSOR_CLI_KEYCHAIN_ACCOUNT = "cursor-user";

/**
 * Read the Cursor CLI's session JWT from the macOS Keychain. Returns undefined
 * off macOS (the CLI uses libsecret/Credential Manager there — not covered yet)
 * or when the CLI is not signed in / the keychain is locked or denied.
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
  for (const dbPath of cursorStateDbPaths()) {
    const token = await withReadonlyDb(dbPath, (db) => {
      const read = (key: string): string | undefined => {
        const row = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get(key) as
          | { value?: unknown }
          | undefined;
        return typeof row?.value === "string" ? row.value : undefined;
      };
      const accessToken = unquote(read("cursorAuth/accessToken"));
      if (!accessToken) return undefined;
      const email = unquote(read("cursorAuth/cachedEmail"));
      const membership = formatMembership(unquote(read("cursorAuth/stripeMembershipType")));
      const userId = cursorUserIdFromJwt(accessToken);
      const bundle: OAuthToken = {
        accessToken,
        ...(userId ? { accountId: userId } : {}),
        ...(membership ? { subscriptionType: membership } : {}),
        ...(email ? { raw: { email } } : {}),
      };
      return bundle;
    });
    if (token) return token;
  }
  // No desktop-IDE token — fall back to a Cursor CLI (`cursor-agent`) session so
  // usage works for CLI-only installs that have no Cursor IDE.
  return resolveCursorCliToken();
}
