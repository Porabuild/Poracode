import { isQoderSessionLive } from "@poracode/agents-usage";
import { fetchHttpClient } from "./fetchHttpClient";

/**
 * Verifies a captured qoder.com `Cookie` header is a *real* signed-in session.
 * qoder.com sets non-auth cookies on every page load (locale, anti-bot) whose
 * names match the login pattern, so a name match alone would prompt before the
 * user signs in. Runs the same usages-endpoint probe as the usage collector via
 * the shared `@poracode/agents-usage` helper, backed here by global fetch —
 * the same shape as `openCodeLoginProbe`.
 */

/** Resolves true iff the cookie authenticates as a live qoder.com session. */
export function isQoderLoginCookieLive(cookieHeader: string): Promise<boolean> {
  return isQoderSessionLive(fetchHttpClient, cookieHeader);
}
