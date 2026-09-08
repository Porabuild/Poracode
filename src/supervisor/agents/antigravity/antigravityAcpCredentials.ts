import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { readAntigravityAcpCredsFromWsl } from "../../runtime/wslCredentials";

const execFileAsync = promisify(execFile);

export const ANTIGRAVITY_GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";

/**
 * Where the official ACP server (>= 1.1) keeps its Google OAuth artifact on
 * macOS. It writes the keychain item when the keychain is available and only
 * falls back to `~/.gemini/antigravity-acp/acp_token.json` otherwise, so the
 * file is frequently absent on a signed-in Mac.
 */
export const ANTIGRAVITY_ACP_KEYCHAIN_SERVICE = "gemini";
export const ANTIGRAVITY_ACP_KEYCHAIN_ACCOUNT = "antigravity-acp";

/**
 * Long enough for a human to answer the macOS authorization dialog this read
 * can raise: the item's ACL only trusts the creating app, so the first read
 * asks for the login keychain password. Aborting early is worse than waiting —
 * a killed `security` client never completes the exchange, the "Always Allow"
 * grant is never committed, and every later read prompts again.
 */
const KEYCHAIN_TIMEOUT_MS = 120_000;

/**
 * Pause after an authorization dialog that ended without a grant (deny,
 * cancel, or the timeout above) so the auto-refresh loop does not re-open the
 * password dialog on every tick. Deliberately short — a user who changes their
 * mind can retry right after.
 */
const AUTH_DENIED_BACKOFF_MS = 60_000;

let keychainAuthBackoffUntil = 0;
let cachedCredentials: AntigravityAcpCredentials | undefined;

export interface AntigravityAcpCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
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
  readNative(): Promise<string | undefined>;
  readWsl(): Promise<string | undefined>;
}

/**
 * `security` exits 44 when the item does not exist — the one failure that
 * never involved an authorization dialog.
 */
function isSecurityItemMissing(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 44;
}

/** Read the ACP token blob from the macOS keychain; undefined when absent/locked. */
export async function readAntigravityAcpCredsFromMacKeychain(): Promise<string | undefined> {
  if (process.platform !== "darwin") return undefined;
  if (Date.now() < keychainAuthBackoffUntil) return undefined;
  try {
    const { stdout } = await execFileAsync(
      "security",
      [
        "find-generic-password",
        "-a",
        ANTIGRAVITY_ACP_KEYCHAIN_ACCOUNT,
        "-w",
        "-s",
        ANTIGRAVITY_ACP_KEYCHAIN_SERVICE,
      ],
      { timeout: KEYCHAIN_TIMEOUT_MS, encoding: "utf8" },
    );
    return stdout.trim() || undefined;
  } catch (error) {
    if (!isSecurityItemMissing(error)) {
      // The user was asked to authorize access and the grant did not complete;
      // back off so the next refresh tick does not re-open the dialog.
      keychainAuthBackoffUntil = Date.now() + AUTH_DENIED_BACKOFF_MS;
    }
    // Missing item or locked keychain: fall through to the file-based sources.
    return undefined;
  }
}

const defaultDeps: AntigravityAcpCredentialDeps = {
  readKeychain: readAntigravityAcpCredsFromMacKeychain,
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
  for (const read of [deps.readKeychain, deps.readNative]) {
    const content = await read();
    if (!content) continue;
    const parsed = parseAntigravityAcpCredentials(content);
    if (parsed) return parsed;
  }
  const content = await deps.readWsl();
  return content ? parseAntigravityAcpCredentials(content) : undefined;
}

/**
 * Process-lifetime cache over `resolveAntigravityAcpCredentials` for callers
 * that resolve on every usage refresh tick. Once the user has granted
 * keychain access, re-reading the item each tick risks re-opening the macOS
 * authorization dialog for no benefit — the IDE can recreate the item, which
 * resets its ACL. Drop the cache with
 * `invalidateAntigravityAcpCredentialsCache` when the stored artifact is
 * rejected so a re-login gets picked up.
 */
export async function resolveAntigravityAcpCredentialsCached(
  deps: AntigravityAcpCredentialDeps = defaultDeps,
): Promise<AntigravityAcpCredentials | undefined> {
  if (cachedCredentials) return cachedCredentials;
  const credentials = await resolveAntigravityAcpCredentials(deps);
  if (credentials) cachedCredentials = credentials;
  return credentials;
}

/** Drop the cached credentials so the next resolve re-reads the OS stores. */
export function invalidateAntigravityAcpCredentialsCache(): void {
  cachedCredentials = undefined;
}

/** Clear process-local credential state between deterministic tests. */
export function resetAntigravityAcpCredentialStateForTests(): void {
  cachedCredentials = undefined;
  keychainAuthBackoffUntil = 0;
}
