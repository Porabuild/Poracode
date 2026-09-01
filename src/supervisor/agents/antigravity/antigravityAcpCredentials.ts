import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { readAntigravityAcpCredsFromWsl } from "../../runtime/wslCredentials";

export const ANTIGRAVITY_GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";

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
  readNative(): Promise<string | undefined>;
  readWsl(): Promise<string | undefined>;
}

const defaultDeps: AntigravityAcpCredentialDeps = {
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

/** Resolve native credentials first, then the gated WSL credential sweep. */
export async function resolveAntigravityAcpCredentials(
  deps: AntigravityAcpCredentialDeps = defaultDeps,
): Promise<AntigravityAcpCredentials | undefined> {
  const native = await deps.readNative();
  if (native) {
    const parsed = parseAntigravityAcpCredentials(native);
    if (parsed) return parsed;
  }
  const content = await deps.readWsl();
  return content ? parseAntigravityAcpCredentials(content) : undefined;
}
