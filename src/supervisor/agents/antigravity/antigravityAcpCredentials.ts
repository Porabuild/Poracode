import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { readMacKeychainPassword, readMacKeychainFingerprint } from "../../runtime/macKeychain";
import { readAntigravityAcpCredsFromWsl } from "../../runtime/wslCredentials";

export const ANTIGRAVITY_GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";

/**
 * Where the official ACP server (>= 1.1) keeps its Google OAuth artifact on
 * macOS. It writes the keychain item when the keychain is available and only
 * falls back to `~/.gemini/antigravity-acp/acp_token.json` otherwise, so the
 * file is frequently absent on a signed-in Mac.
 */
export const ANTIGRAVITY_ACP_KEYCHAIN_SERVICE = "gemini";
export const ANTIGRAVITY_ACP_KEYCHAIN_ACCOUNT = "antigravity-acp";

const keychainItem = {
  service: ANTIGRAVITY_ACP_KEYCHAIN_SERVICE,
  account: ANTIGRAVITY_ACP_KEYCHAIN_ACCOUNT,
};

export interface AntigravityAcpCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /**
   * Last confirmed non-secret identity of the macOS Keychain source item.
   * `agy_acp_server` delete+adds that item on every start, so a newer
   * fingerprint alone means a recreated item, not a different account.
   */
  keychainFingerprint?: string;
  /** True when read from the macOS Keychain item, rather than a file source. */
  fromKeychain?: boolean;
}

interface AntigravityAcpCredentialFile {
  client_id?: unknown;
  client_secret?: unknown;
  refresh_token?: unknown;
  token_uri?: unknown;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Parse the credential artifact written by the official Antigravity ACP server. */
export function parseAntigravityAcpCredentials(
  content: string,
): AntigravityAcpCredentials | undefined {
  let parsed: AntigravityAcpCredentialFile;
  try {
    parsed = JSON.parse(content) as AntigravityAcpCredentialFile;
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;

  const clientId = nonEmptyString(parsed.client_id);
  const clientSecret = nonEmptyString(parsed.client_secret);
  const refreshToken = nonEmptyString(parsed.refresh_token);
  const tokenUri = nonEmptyString(parsed.token_uri);
  if (!clientId || !clientSecret || !refreshToken || tokenUri !== ANTIGRAVITY_GOOGLE_TOKEN_URI) {
    return undefined;
  }

  return {
    clientId,
    clientSecret,
    refreshToken,
  };
}

export interface AntigravityAcpCredentialDeps {
  /** OS credential store (macOS keychain); resolves undefined off-platform. */
  readKeychain(): Promise<string | undefined>;
  readKeychainFingerprint?(): Promise<string | undefined>;
  readNative(): Promise<string | undefined>;
  readWsl(): Promise<string | undefined>;
}

/** Read the ACP token blob from the macOS keychain; undefined when absent/locked. */
export async function readAntigravityAcpCredsFromMacKeychain(): Promise<string | undefined> {
  return readMacKeychainPassword(keychainItem);
}

/**
 * Read only item attributes: omitting both -w and -g avoids requesting password
 * data (SecurityTool/macOS/keychain_find.c). Dates detect a replacement/login;
 * the keychain path distinguishes matching items in different keychains.
 */
export async function readAntigravityAcpKeychainFingerprint(): Promise<string | undefined> {
  return readMacKeychainFingerprint(keychainItem);
}

const defaultDeps: AntigravityAcpCredentialDeps = {
  readKeychain: readAntigravityAcpCredsFromMacKeychain,
  readKeychainFingerprint: readAntigravityAcpKeychainFingerprint,
  readNative: async () => {
    try {
      return await readFile(
        join(homedir(), ".gemini", "antigravity-acp", "acp_token.json"),
        "utf8",
      );
    } catch {
      return undefined;
    }
  },
  readWsl: readAntigravityAcpCredsFromWsl,
};

/**
 * Resolve credentials from the OS keychain first (where current ACP builds
 * persist them), then the legacy native file, then the gated WSL sweep.
 */
export async function resolveAntigravityAcpCredentials(
  deps: AntigravityAcpCredentialDeps = defaultDeps,
): Promise<AntigravityAcpCredentials | undefined> {
  const before = await deps.readKeychainFingerprint?.().catch(() => undefined);
  const keychainContent = await deps.readKeychain().catch(() => undefined);
  const keychainCredentials = keychainContent
    ? parseAntigravityAcpCredentials(keychainContent)
    : undefined;
  if (keychainCredentials) {
    const after = await deps.readKeychainFingerprint?.().catch(() => undefined);
    // The item may be replaced while its password dialog is open. Never bind
    // the previous account's token to the replacement's identity; the grant
    // stays unbound until the credential cache confirms it against the API.
    return {
      ...keychainCredentials,
      fromKeychain: true,
      ...(before && before === after ? { keychainFingerprint: before } : {}),
    };
  }
  return resolveAntigravityAcpFileCredentials(deps);
}

/** File fallbacks never request access to a missing or temporarily unavailable Keychain item. */
export async function resolveAntigravityAcpFileCredentials(
  deps: Pick<AntigravityAcpCredentialDeps, "readNative" | "readWsl"> = defaultDeps,
): Promise<AntigravityAcpCredentials | undefined> {
  for (const read of [deps.readNative, deps.readWsl]) {
    const content = await read().catch(() => undefined);
    if (!content) continue;
    const parsed = parseAntigravityAcpCredentials(content);
    if (parsed) return parsed;
  }
  return undefined;
}
