import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const KEYCHAIN_TIMEOUT_MS = 5_000;
const CREDENTIAL_SUFFIX = "-credentials";
const ACCOUNT_RE = /^[a-zA-Z0-9._-]+$/;

interface KeychainEnv {
  CLAUDE_CONFIG_DIR?: string | undefined;
  CLAUDE_SECURESTORAGE_CONFIG_DIR?: string | undefined;
  CLAUDE_CODE_CUSTOM_OAUTH_URL?: string | undefined;
}

export function claudeKeychainAccount(
  env: { USER?: string | undefined } = process.env,
  fallbackUsername = userInfo().username,
): string {
  const account = env.USER || fallbackUsername || "claude-code-user";
  return ACCOUNT_RE.test(account) ? account : "claude-code-user";
}

function defaultClaudeConfigDir(): string {
  return join(homedir(), ".claude");
}

function secureStorageConfigDir(env: KeychainEnv): string {
  const secureDir = env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
  if (secureDir !== undefined) return (secureDir || defaultClaudeConfigDir()).normalize("NFC");
  return (env.CLAUDE_CONFIG_DIR || defaultClaudeConfigDir()).normalize("NFC");
}

function keychainConfigHashSuffix(env: KeychainEnv): string {
  const secureDir = env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
  const useDefaultKey = secureDir !== undefined ? secureDir.length === 0 : !env.CLAUDE_CONFIG_DIR;
  if (useDefaultKey) return "";
  return `-${createHash("sha256").update(secureStorageConfigDir(env)).digest("hex").slice(0, 8)}`;
}

function oauthSuffixes(env: KeychainEnv): string[] {
  const suffixes = [""];
  if (env.CLAUDE_CODE_CUSTOM_OAUTH_URL) suffixes.push("-custom-oauth");
  // Developer/local Claude builds use this suffix. Trying it after the prod
  // name is harmless and keeps usage working for non-production installs.
  suffixes.push("-local-oauth");
  return [...new Set(suffixes)];
}

export function claudeKeychainServiceNames(env: KeychainEnv = process.env): string[] {
  const hashSuffix = keychainConfigHashSuffix(env);
  return oauthSuffixes(env).map(
    (oauthSuffix) => `Claude Code${oauthSuffix}${CREDENTIAL_SUFFIX}${hashSuffix}`,
  );
}

export async function readClaudeCredentialsFromMacKeychain(
  env: KeychainEnv = process.env,
): Promise<string | undefined> {
  if (process.platform !== "darwin") return undefined;
  const account = claudeKeychainAccount();
  for (const service of claudeKeychainServiceNames(env)) {
    try {
      const { stdout } = await execFileAsync(
        "security",
        ["find-generic-password", "-a", account, "-w", "-s", service],
        { timeout: KEYCHAIN_TIMEOUT_MS, encoding: "utf8" },
      );
      const trimmed = stdout.trim();
      if (trimmed) return trimmed;
    } catch {
      // Try the next candidate. Missing/locked keychains degrade to auth-missing.
    }
  }
  return undefined;
}
