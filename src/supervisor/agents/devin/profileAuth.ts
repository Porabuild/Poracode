import type { AuthState } from "@/shared/contracts";
import { buildAgentCommand, batchWslCommandsAsync, type CommandSpec } from "../base";
import { parseDevinCredentials, readDevinCredentialsAt } from "./credentials";
import type { DevinExecutionContext } from "./profileContext";

/**
 * Auth semantics for Devin execution contexts (plan §4, G20).
 *
 * Rules encoded here:
 * - Every login/logout runs THROUGH the context's redirection so a browser or
 *   manual-token flow lands in the intended account root. Credentials are
 *   never copied between roots and no key-only projection is treated as an
 *   equivalent native login.
 * - A credentials file being present is not proof of a valid session; only
 *   authoritative negative signals (the ACP `auth_required` error) refine
 *   status beyond "file exists". A successful `newSession` is NOT auth proof
 *   on this CLI (it succeeds logged out) and is never propagated as one.
 * - Logout of a shared owner account affects every dependent profile; callers
 *   must surface that consequence before running the command.
 */

/**
 * Best-effort auth state for a context's account root. `"missing"` means no
 * parseable credential file at the resolved root; `"unknown"` is returned for
 * unreadable environments rather than guessing.
 */
export async function resolveDevinAuthStateForContext(
  context: DevinExecutionContext,
  signal?: AbortSignal | undefined,
): Promise<AuthState> {
  const location = context.location;
  if (location.kind === "wsl") {
    // Isolated roots are absolute literal paths; the native default root is a
    // shell-expansion template resolved by the distro shell itself.
    const read = `cat "${context.roots.dataRoot}/devin/credentials.toml" 2>/dev/null`;
    const script =
      context.account.kind === "default"
        ? `if [ -n "$WINDSURF_API_KEY" ]; then printf authenticated; else ${read}; fi`
        : read;
    const [result] = await batchWslCommandsAsync(location.distro, [script], signal);
    if (!result?.ok) return "unknown";
    return result.stdout === "authenticated" || parseDevinCredentials(result.stdout)
      ? "authenticated"
      : "missing";
  }
  if (signal?.aborted) return "unknown";
  if (context.account.kind === "default" && process.env.WINDSURF_API_KEY?.trim()) {
    return "authenticated";
  }
  return (await readDevinCredentialsAt(context.roots.credentialsPath))
    ? "authenticated"
    : "missing";
}

/** Interactive browser/manual-token login scoped to the context's account root. */
export function buildDevinLoginCommand(
  context: DevinExecutionContext,
  executablePath?: string | undefined,
): CommandSpec {
  return buildAgentCommand(
    context.location,
    "devin",
    [...context.prefixArgs, "auth", "login"],
    executablePath,
    context.env,
  );
}

/**
 * CLI logout scoped to the context's account root (no ACP logout is
 * advertised). Without a resolved context this is the plain default-account
 * logout — the base adapter's legacy behavior.
 */
export function buildDevinLogoutCommand(
  location: Parameters<typeof buildAgentCommand>[0],
  context: DevinExecutionContext | undefined,
  executablePath?: string | undefined,
): CommandSpec {
  return buildAgentCommand(
    location,
    "devin",
    [...(context?.prefixArgs ?? []), "auth", "logout"],
    executablePath,
    context?.env,
  );
}

/**
 * Human-readable scope of a logout/login for confirmation dialogs: a shared
 * owner account affects every profile that references it.
 */
export function describeDevinAuthScope(context: DevinExecutionContext): string {
  if (context.account.kind === "default") {
    return "the native default Devin login (shared by every same-login profile)";
  }
  const owner = context.account.ownerId;
  return context.account.kind === "isolated"
    ? `the isolated account root of profile "${context.label}" (${owner})`
    : `the shared isolated account root owned by profile "${owner}"`;
}
