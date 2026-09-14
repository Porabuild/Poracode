import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { coalesceByKey } from "@/shared/coalesce";
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
 * A denied, canceled, or timed-out authorization must not be retried by the
 * refresh loop. Suppress further attempts for this process; credential cache
 * invalidation must not reset the user's decision.
 */
let keychainAuthorizationSuppressed = false;
const keychainReads = new Map<string, Promise<string | undefined>>();

export interface AntigravityAcpCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Non-secret source identity, present only on a granted macOS Keychain read. */
  keychainFingerprint?: string;
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
  if (keychainAuthorizationSuppressed) return undefined;
  return coalesceByKey(keychainReads, ANTIGRAVITY_ACP_KEYCHAIN_ACCOUNT, async () => {
    try {
      const { stdout } = await execFileAsync(
        "/usr/bin/security",
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
      if (!isSecurityItemMissing(error)) keychainAuthorizationSuppressed = true;
      // Missing item or locked keychain: fall through to the file-based sources.
      return undefined;
    }
  });
}

/**
 * Read only item attributes: omitting both -w and -g avoids requesting password
 * data (SecurityTool/macOS/keychain_find.c). Dates detect a replacement/login;
 * the keychain path distinguishes matching items in different keychains.
 */
export async function readAntigravityAcpKeychainFingerprint(): Promise<string | undefined> {
  if (process.platform !== "darwin" || keychainAuthorizationSuppressed) return undefined;
  return coalesceByKey(keychainReads, "metadata", async () => {
    try {
      const { stdout } = await execFileAsync(
        "/usr/bin/security",
        [
          "find-generic-password",
          "-a",
          ANTIGRAVITY_ACP_KEYCHAIN_ACCOUNT,
          "-s",
          ANTIGRAVITY_ACP_KEYCHAIN_SERVICE,
        ],
        { timeout: 5_000, encoding: "utf8" },
      );
      const identity = stdout.match(/^keychain: .+$/m)?.[0];
      const created = stdout.match(/^\s*"cdat"<timedate>=.+$/m)?.[0].trim();
      const modified = stdout.match(/^\s*"mdat"<timedate>=.+$/m)?.[0].trim();
      if (!identity || !created || !modified) return undefined;
      return createHash("sha256").update([identity, created, modified].join("\n")).digest("hex");
    } catch {
      // Without a source identity the grant remains process-local.
      return undefined;
    }
  });
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
    // the previous account's token to the replacement's identity.
    return {
      ...keychainCredentials,
      ...(before && before === after ? { keychainFingerprint: before } : {}),
    };
  }
  for (const read of [deps.readNative, deps.readWsl]) {
    const content = await read().catch(() => undefined);
    if (!content) continue;
    const parsed = parseAntigravityAcpCredentials(content);
    if (parsed) return parsed;
  }
  return undefined;
}

/** Clear process-local credential state between deterministic tests. */
export function resetAntigravityAcpCredentialStateForTests(): void {
  keychainReads.clear();
  keychainAuthorizationSuppressed = false;
}
