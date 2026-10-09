import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { ProjectLocation } from "@/shared/contracts";
import { readAgentCommandOutput } from "../base";
import { resolveAgentBinaryPath } from "../binaryResolver";
import { readDevinContextCredential } from "./accountIdentity";
import { devinConfigOrgId } from "./orgSelection";
import {
  devinDefaultExecutionSettings,
  resolveDevinExecutionContext,
  type DevinExecutionContext,
} from "./profileContext";
import { effectiveDevinUserConfigPath, embedDevinDistroConfigPath } from "./launchContext";

/**
 * The provider-owned VOLATILE catalog scope: one memory-only digest covering
 * every effective dimension that can change a `models list` view while the
 * static execution identity (see `resolveDevinExecutionContext.generation`)
 * stays identical —
 *
 * - the CURRENT credential source (via `readDevinContextCredential`, which
 *   distinguishes a logged-out `"missing"` state and fails typed on an
 *   unreadable source),
 * - the EFFECTIVE user-config content the session actually resolves
 *   (explicit `--config` file, redirected/seeded view, or the distro-side /
 *   host native default) — a same-path native policy edit invalidates the
 *   catalog,
 * - the EFFECTIVE organization selection (settings org wins, else
 *   `devin.org_id` of that same config — the exact precedence
 *   `resolveDevinEffectiveOrgId` binds the resume identity with).
 *
 * The digest is composed only of hashes; no token, endpoint, config content,
 * org id, or other raw value ever enters the key, a message, or any
 * persisted surface — the scope exists only inside the process-local model
 * catalog cache (see `modelCatalog.ts`, no serialized boundary, so key-format
 * changes invalidate on their own and need no version bump).
 *
 * FRESH READS, deliberately: a resolved context is immutable, but the world
 * it names is not — external files change under the same frozen object (a
 * same-path policy edit, an org edit, a credential rotation, a repaired
 * formerly-unreadable file), so memoizing per context instance would serve
 * one state's catalog to another forever. Every scope request rereads the
 * declared sources; nothing is cached here and failures are naturally
 * retryable. Stability is preserved where it matters: IDENTICAL content
 * hashes to an identical digest, so an unchanged world keeps sharing one
 * warmed catalog entry, and the immutable resume identity
 * (`sessionScope.ts`) never consumes any volatile dimension — policy, model
 * or credential changes cannot orphan resumable sessions.
 *
 * Failure policy: a scope that cannot be fully resolved (unreadable
 * credential source, unreadable or empty config, corrupt config) throws
 * {@link DevinCatalogScopeUnavailableError}. Callers degrade to an
 * unavailable catalog — they must never fall back to a key that omits a
 * dimension, because such a key could be shared with a cache entry written
 * under a different credential/org/policy state.
 */

/** A volatile catalog scope could not be resolved; carries no source contents. */
export class DevinCatalogScopeUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DevinCatalogScopeUnavailableError";
  }
}

/** Digest input standing in for "no effective config at the resolved path". */
const ABSENT_CONFIG_DIGEST_INPUT = "\u0000absent";

/** Structural view of a context credential (see `accountIdentity.ts`). */
interface ScopedCredential {
  token: string;
  baseUrl?: string | undefined;
}

/**
 * Opaque digest of the credential source's CURRENT content — the same shape
 * the account-identity lane uses for its own volatile keys. The scope
 * rereads the DECLARED source on every request (not the identity lane's
 * per-context memo, which would hide a rotation behind a reused context
 * instance); the raw token never leaves this function.
 */
function volatileCredentialDigest(credential: ScopedCredential): string {
  return createHash("sha256")
    .update(`${credential.token}\u0000${credential.baseUrl ?? ""}`)
    .digest("hex");
}

/**
 * Read the effective config text: a genuinely MISSING file (ENOENT on the
 * host, `-e` false inside the distro) is absence; a PRESENT file that is
 * empty, unreadable, or returns a malformed marker is a typed failure —
 * mirroring `orgSelection.ts`/`launchContext.ts`. WSL paths are resolved
 * INSIDE the distro (the effective path may be the controlled native-default
 * expression, interpolated raw so the distro's own XDG/HOME expand); the
 * host fs is never called with a Linux path.
 */
async function readEffectiveConfigText(
  context: DevinExecutionContext,
  signal: AbortSignal | undefined,
): Promise<string | undefined> {
  const path = effectiveDevinUserConfigPath(context);
  if (path === undefined) return undefined;
  if (context.location.kind === "wsl") {
    signal?.throwIfAborted();
    const script = `f=${embedDevinDistroConfigPath(path)}
if [ -e "$f" ]; then printf 'present\\n'; cat "$f"; else printf 'absent\\n'; fi`;
    const result = await readAgentCommandOutput(context.location, "sh", ["-c", script], {
      ...(signal ? { signal } : {}),
    });
    if (!result.ok) {
      throw new DevinCatalogScopeUnavailableError(
        "The Devin config that scopes the model catalog exists but could not be read inside the WSL distro.",
      );
    }
    if (result.stdout === "absent\n") return undefined;
    if (!result.stdout.startsWith("present\n")) {
      throw new DevinCatalogScopeUnavailableError(
        "The WSL config read for the model catalog scope returned an invalid presence marker.",
      );
    }
    return presentConfigOrThrow(result.stdout.slice("present\n".length));
  }
  const content = await readFile(path, {
    encoding: "utf8",
    ...(signal ? { signal } : {}),
  }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw new DevinCatalogScopeUnavailableError(
      `The Devin config that scopes the model catalog exists but could not be read (${error.code ?? "unknown error"}).`,
    );
  });
  return content === undefined ? undefined : presentConfigOrThrow(content);
}

/** Fail closed: a present config with no parseable content is not "absent". */
function presentConfigOrThrow(content: string): string {
  if (!content.trim()) {
    throw new DevinCatalogScopeUnavailableError(
      "The Devin config that scopes the model catalog exists but is empty; refusing to digest a truncated file as a catalog state.",
    );
  }
  return content;
}

/**
 * The opaque volatile scope digest for one execution context. The declared
 * credential/config sources are REREAD on every request — contexts are
 * immutable, external files are not — and stable content yields the identical
 * digest, so unchanged state keeps sharing one warmed cache entry. Failures
 * propagate typed and are retryable by construction (nothing is cached).
 */
export async function resolveDevinVolatileCatalogScope(
  context: DevinExecutionContext,
  signal?: AbortSignal | undefined,
): Promise<string> {
  signal?.throwIfAborted();
  const credential = await readDevinContextCredential(context, signal);
  const credentialScope = credential ? volatileCredentialDigest(credential) : "missing";
  const configText = await readEffectiveConfigText(context, signal);
  // Org precedence identical to `resolveDevinEffectiveOrgId`: a declared
  // settings org seeds its own config view, so it wins without a parse;
  // otherwise the same config text just read is parsed strictly (a
  // corrupt source fails closed instead of digesting ambiguity).
  const orgId = context.orgId ?? devinConfigOrgId(configText);
  const configDigest = createHash("sha256")
    .update(configText ?? ABSENT_CONFIG_DIGEST_INPUT)
    .digest("hex");
  return `vol:${createHash("sha256")
    .update(
      JSON.stringify({ credential: credentialScope, config: configDigest, org: orgId ?? "-" }),
    )
    .digest("hex")}`;
}

/**
 * Static generation + volatile scope for the BASE adapter's default account:
 * the native default roots under the same shared settings literal the
 * base-adapter context uses, so detection warm entries and launch warm
 * lookups land on one key. `undefined` generation is impossible here — a
 * failure throws and the lane degrades.
 */
export async function resolveDevinDefaultCatalogScope(
  location: ProjectLocation,
  signal?: AbortSignal | undefined,
): Promise<{ generation: string; volatileGeneration: string }> {
  const resolution = await resolveDevinExecutionContext(devinDefaultExecutionSettings, location, {
    // The same resolver the launch lanes use, so both sides share one
    // binary-identity dimension and one warmed cache entry.
    executablePath: resolveAgentBinaryPath(location, "devin"),
  });
  if (!resolution.ok) {
    throw new DevinCatalogScopeUnavailableError(resolution.message);
  }
  return {
    generation: resolution.context.generation,
    volatileGeneration: await resolveDevinVolatileCatalogScope(resolution.context, signal),
  };
}
