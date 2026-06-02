import { homedir } from "node:os";
import { join } from "node:path";
import type { OAuthToken } from "@lightcode/agents-usage";
import { withReadonlyDb } from "./sqliteRead";

/**
 * Resolve the Cursor desktop app's JWT access token from its `state.vscdb`
 * SQLite store (table `ItemTable`, key `cursorAuth/accessToken`) — the same
 * place the Cursor app keeps it. No cookie capture and no browser involvement.
 * Read-only; the token is short-lived so it is read fresh each call.
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
  return undefined;
}
