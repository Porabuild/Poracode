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
const KEYCHAIN_TIMEOUT_MS = 5_000;

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

/** Read the ACP token blob from the macOS keychain; undefined when absent/locked. */
export async function readAntigravityAcpCredsFromMacKeychain(): Promise<string | undefined> {
  if (process.platform !== "darwin") return undefined;
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
    const trimmed = stdout.trim();
    return trimmed || undefined;
  } catch {
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
