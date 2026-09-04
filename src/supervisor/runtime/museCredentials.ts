import { readFile } from "node:fs/promises";
import type { OAuthToken } from "@poracode/agents-usage";
import { nativeMuseAuthPath } from "../agents/muse/paths";
import { readMuseAuthFromWsl } from "./wslCredentials";

/**
 * Muse Code credential resolution for usage collection.
 *
 * Reads the CLI's device-code `access_token` (`dca:...`) from
 * `providers.meta` in `~/.config/muse/auth.json` (honoring `MUSE_AUTH_PATH` /
 * `XDG_CONFIG_HOME` via {@link nativeMuseAuthPath}), with a WSL-distro
 * fallback on Windows. The credential is reused read-only; the file is never
 * rewritten and secrets are never logged.
 *
 * Deliberately NOT `META_API_KEY`: that env var (and the `api_key` field in
 * the same file) is a Model API key for headless runs, which the usage key
 * endpoint (`POST /muse-code/key`) rejects with 401 — and a key-only setup
 * has no subscription quota anyway, so it correctly resolves to unsigned-in
 * (prompting `muse login`) rather than a confusing rejection.
 */

interface MuseAuthProviders {
  providers?: Record<string, { access_token?: unknown }>;
}

/** Pure: extract the device-code access token from an `auth.json` document. */
export function parseMuseAuth(content: string): OAuthToken | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const providers = (parsed as MuseAuthProviders).providers;
  if (!providers || typeof providers !== "object" || Array.isArray(providers)) return undefined;
  const accessToken = providers["meta"]?.access_token;
  if (typeof accessToken !== "string" || accessToken.trim().length === 0) return undefined;
  return { accessToken: accessToken.trim() };
}

/** Resolve the same device-code credential `muse login` stores. */
export async function resolveMuseToken(): Promise<OAuthToken | undefined> {
  try {
    const token = parseMuseAuth(await readFile(nativeMuseAuthPath(), "utf8"));
    if (token) return token;
  } catch {
    // fall through to the WSL fallback
  }

  if (process.platform !== "win32") return undefined;
  const wslAuth = await readMuseAuthFromWsl();
  return wslAuth ? parseMuseAuth(wslAuth) : undefined;
}
