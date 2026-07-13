import { isOpenCodeSessionLive } from "@poracode/agents-usage";
import { fetchHttpClient } from "./fetchHttpClient";

/**
 * Verifies a captured opencode.ai `Cookie` header is a *real* signed-in session,
 * not a stale or mid-`/authorize` cookie that merely shares the `auth` name. Used
 * to gate the browser-login "Found a signed-in session" prompt. Runs the same
 * workspace probe as the usage scanner via the shared `@poracode/agents-usage`
 * helper, backed here by global fetch (the supervisor scanner injects its own
 * HTTP client).
 */

/** Resolves true iff the cookie authenticates as a live opencode.ai session. */
export function isOpenCodeLoginCookieLive(cookieHeader: string): Promise<boolean> {
  return isOpenCodeSessionLive(fetchHttpClient, cookieHeader);
}
