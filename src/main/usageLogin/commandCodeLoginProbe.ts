import { isCommandCodeSessionLive } from "@lightcode/agents-usage";
import { fetchHttpClient } from "./fetchHttpClient";

/**
 * Verifies a captured commandcode.ai `Cookie` header is a *real* signed-in
 * session, not a stale or mid-`/authorize` cookie that merely shares a session
 * cookie name. Used to gate the browser-login "Found a signed-in session"
 * prompt. Runs the same `/auth/get-session` probe as the usage collector via
 * the shared `@lightcode/agents-usage` helper, backed here by global fetch
 * (the supervisor scanner injects its own HTTP client).
 */

/** Resolves true iff the cookie authenticates as a live commandcode.ai session. */
export function isCommandCodeLoginCookieLive(cookieHeader: string): Promise<boolean> {
  return isCommandCodeSessionLive(fetchHttpClient, cookieHeader);
}
