import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { batchWslCommandsAsync } from "../base";
import { parseDevinCredentials } from "./credentials";
import type { DevinExecutionContext } from "./profileContext";
import { devinSessionScopeIdentity } from "./sessionScope";
import { resolveDevinEffectiveOrgId } from "./orgSelection";
import { devinDefaultRoots } from "./accountRoots";

/**
 * Stable account identity proof for Devin execution contexts.
 *
 * The immutable session binding (sessionScope) must survive credential
 * rotations but reject a different login at the same account root. Rotatable
 * bearer tokens cannot serve that role, so the binding is derived from the
 * stable `userStatus.userId` proved over the SAME private authenticated
 * Connect endpoint the usage collector already uses
 * (`exa.seat_management_pb.SeatManagementService/GetUserStatus`) — field
 * names/types only are consumed; no account PII, token, or endpoint value is
 * ever persisted or logged.
 *
 * Guarantees encoded here:
 * - Credentials are read from the context's DECLARED source only: the native
 *   environment key is honored solely for a validated native-default context
 *   (the context's own reserved-variable guards ran first), isolated and
 *   reference accounts read their own root, and WSL reads happen inside the
 *   distro.
 * - The in-memory metadata cache is keyed by an opaque credential fingerprint,
 *   so a token rotation re-proves (same user → same binding, different user →
 *   a different binding that refuses old resume refs) while every launch for
 *   an unchanged credential costs no network round trip.
 * - The endpoint request mirrors the collector's hardening: HTTPS only, no
 *   redirects, bounded timeout/abort/body, typed failures without echoing the
 *   response (the payload carries account data).
 */

export type DevinAccountIdentityCode =
  | "auth-missing"
  | "auth-source-unreadable"
  | "auth-rejected"
  | "auth-unreachable"
  | "auth-response-invalid"
  | "org-selection-unreadable";

/**
 * A profile's account identity could not be proved. Never carries the token,
 * the endpoint URL, or any response payload — only a typed cause.
 */
export class DevinAccountIdentityError extends Error {
  readonly code: DevinAccountIdentityCode;

  constructor(code: DevinAccountIdentityCode, message: string) {
    super(message);
    this.name = "DevinAccountIdentityError";
    this.code = code;
  }
}

/** The effective credential of one context's declared source. Never logged. */
interface ContextCredential {
  token: string;
  baseUrl?: string | undefined;
}

/** Marker separating a distro environment key from a credentials-file payload. */
const WSL_ENV_KEY_MARKER = "poracode-env-key:";

/** Bound for one credential payload; a larger file is not a credential file. */
const MAX_CREDENTIAL_BYTES = 64 * 1024;

async function readFileOrAbsent(path: string): Promise<string | undefined> {
  return readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    // Only ENOENT is absence; an unreadable credential source is a typed
    // failure, never a silently unauthenticated account.
    if (error.code === "ENOENT") return undefined;
    throw new DevinAccountIdentityError(
      "auth-source-unreadable",
      `The Devin credential source could not be read (${error.code ?? "unknown error"}).`,
    );
  });
}

function credentialFromPayload(raw: string | undefined): ContextCredential | undefined {
  if (raw === undefined || !raw.trim()) return undefined;
  const parsed = parseDevinCredentials(raw);
  if (!parsed) return undefined;
  return {
    token: parsed.accessToken,
    ...(parsed.raw ? { baseUrl: parsed.raw.baseUrl } : {}),
  };
}

/**
 * Read the credential from a context's DECLARED source. Host paths stay on the
 * host filesystem; WSL paths are resolved inside the distro (the host fs is
 * never called with a Linux path). The native environment key is consulted
 * ONLY for a native-default context — and legitimately so, because the
 * context's own validation already refused profiles whose environment sets
 * the account-root or credential variables.
 */
export async function readDevinContextCredential(
  context: DevinExecutionContext,
  signal?: AbortSignal | undefined,
): Promise<ContextCredential | undefined> {
  if (context.location.kind === "wsl") {
    signal?.throwIfAborted();
    const file = context.roots.credentialsPath;
    // Only the resolver's exact native-default template expands inside WSL.
    // Literal/profile-owned paths (including shell syntax) stay quoted.
    const fileExpression =
      context.account.kind === "default" &&
      file === devinDefaultRoots(context.location).credentialsPath
        ? `"${file}"`
        : quoteWsl(file);
    const script =
      context.account.kind === "default"
        ? `if [ -n "$WINDSURF_API_KEY" ]; then printf '${WSL_ENV_KEY_MARKER}%s' "$WINDSURF_API_KEY"; exit 0; fi
f=${fileExpression}
if [ -e "$f" ]; then cat "$f"; fi`
        : `f=${fileExpression}
if [ -e "$f" ]; then cat "$f"; fi`;
    const [result] = await batchWslCommandsAsync(context.location.distro, [script], signal);
    if (!result?.ok) {
      throw new DevinAccountIdentityError(
        "auth-source-unreadable",
        "The Devin credential source could not be read inside the WSL distro.",
      );
    }
    if (result.stdout.startsWith(WSL_ENV_KEY_MARKER)) {
      const token = result.stdout.slice(WSL_ENV_KEY_MARKER.length).trim();
      return token ? { token } : undefined;
    }
    return result.stdout.length <= MAX_CREDENTIAL_BYTES
      ? credentialFromPayload(result.stdout)
      : undefined;
  }
  if (context.account.kind === "default" && process.env.WINDSURF_API_KEY?.trim()) {
    // Validated above by the context's reserved-variable guards: this is the
    // declared native source for a native-default account.
    return { token: process.env.WINDSURF_API_KEY.trim() };
  }
  const raw = await readFileOrAbsent(context.roots.credentialsPath);
  if (raw !== undefined && Buffer.byteLength(raw, "utf8") > MAX_CREDENTIAL_BYTES) return undefined;
  return credentialFromPayload(raw);
}

function quoteWsl(path: string): string {
  return `'${path.replaceAll("'", `'\\''`)}'`;
}

/**
 * Opaque fingerprint of the effective credential source. Separate from the
 * immutable session binding by design: this one CHANGES on every token
 * rotation (it keys volatile caches like the model catalog), while the
 * binding survives rotations through the proved stable user id. The digest is
 * in-memory only — never persisted and never logged.
 */
function credentialFingerprint(credential: ContextCredential): string {
  return createHash("sha256")
    .update(`${credential.token}\u0000${credential.baseUrl ?? ""}`)
    .digest("hex");
}

/**
 * Fingerprint for one context, memoized per context instance so the catalog
 * lanes and the identity proof within one launch share a single source read.
 * Rejects (typed) when the declared source exists but cannot be read.
 */
const fingerprintCache = new WeakMap<DevinExecutionContext, Promise<string>>();

export function devinCredentialFingerprint(
  context: DevinExecutionContext,
  signal?: AbortSignal | undefined,
): Promise<string> {
  let entry = fingerprintCache.get(context);
  if (!entry) {
    entry = readDevinContextCredential(context, signal).then((credential) =>
      credential ? credentialFingerprint(credential) : "missing",
    );
    // Failures stay retryable: the next caller re-reads the source.
    entry.catch(() => {
      if (fingerprintCache.get(context) === entry) fingerprintCache.delete(context);
    });
    fingerprintCache.set(context, entry);
  }
  return entry;
}

/** The stable account fields this lane proves. Only the id string is read. */
const accountIdentitySchema = z.object({
  userStatus: z.object({ userId: z.string().min(1).max(128) }),
});

/** Default endpoint when the credential carries no routing override. */
const DEFAULT_IDENTITY_ENDPOINT = "https://server.codeium.com";
const IDENTITY_ENDPOINT_PATH = "/exa.seat_management_pb.SeatManagementService/GetUserStatus";
/** Cloud protocol compatibility version, matching the usage collector. */
const CONNECT_METADATA_VERSION = "1.108.2";
const IDENTITY_TIMEOUT_MS = 15_000;
/** A GetUserStatus payload above this bound is refused, never parsed. */
const MAX_IDENTITY_BODY_BYTES = 256 * 1024;

/**
 * Prove the stable account user id over the private authenticated metadata
 * endpoint. The request is identical to the agents-usage collector's; the
 * response is size-bounded, schema-checked for `userStatus.userId` only, and
 * never echoed — failures carry a typed cause with no account data.
 */
async function fetchDevinAccountUserId(
  credential: ContextCredential,
  signal?: AbortSignal | undefined,
): Promise<string> {
  let url: URL;
  try {
    url = new URL(credential.baseUrl ?? DEFAULT_IDENTITY_ENDPOINT);
  } catch {
    throw new DevinAccountIdentityError(
      "auth-response-invalid",
      "The credential's endpoint routing is not a valid URL.",
    );
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new DevinAccountIdentityError(
      "auth-response-invalid",
      "The credential's endpoint routing is not an acceptable HTTPS endpoint.",
    );
  }
  url.pathname = IDENTITY_ENDPOINT_PATH;
  const timeout = AbortSignal.timeout(IDENTITY_TIMEOUT_MS);
  const signal_ = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json", "Connect-Protocol-Version": "1" },
      body: JSON.stringify({
        metadata: {
          apiKey: credential.token,
          ideName: "devin",
          ideVersion: CONNECT_METADATA_VERSION,
          extensionName: "devin",
          extensionVersion: CONNECT_METADATA_VERSION,
          locale: "en",
        },
      }),
      signal: signal_,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new DevinAccountIdentityError(
      "auth-unreachable",
      "The Devin account service could not be reached to verify the profile's account identity.",
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new DevinAccountIdentityError(
      "auth-rejected",
      "The stored credential was rejected by the Devin account service; sign in again for this profile.",
    );
  }
  if (response.status < 200 || response.status >= 300) {
    throw new DevinAccountIdentityError(
      "auth-unreachable",
      `The Devin account service returned an unexpected status (${response.status}) while verifying the profile's account identity.`,
    );
  }
  const body = await readBoundedBody(response);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(body);
  } catch {
    throw new DevinAccountIdentityError(
      "auth-response-invalid",
      "The Devin account service returned a response that is not valid JSON.",
    );
  }
  const parsed = accountIdentitySchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new DevinAccountIdentityError(
      "auth-response-invalid",
      "The Devin account service response did not carry a usable stable account identity.",
    );
  }
  return parsed.data.userStatus.userId;
}

async function readBoundedBody(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_IDENTITY_BODY_BYTES) {
    throw new DevinAccountIdentityError(
      "auth-response-invalid",
      "The Devin account service response exceeds the accepted size bound.",
    );
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IDENTITY_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new DevinAccountIdentityError(
        "auth-response-invalid",
        "The Devin account service response exceeds the accepted size bound.",
      );
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * In-memory proof cache keyed by the credential fingerprint. An unchanged
 * credential reuses its proved user id for the process lifetime; a rotation
 * (logout, re-login, external replacement) misses and re-proves. Failed
 * proofs are never cached — the next launch retries.
 */
const proofCache = new Map<string, Promise<string>>();

/**
 * The proved stable user id for a context's account, or a typed failure.
 * Cache hits never touch the network; misses perform exactly one metadata
 * request per credential state.
 */
export async function resolveDevinAccountUserId(
  context: DevinExecutionContext,
  signal?: AbortSignal | undefined,
): Promise<string> {
  const credential = await readDevinContextCredential(context, signal);
  if (!credential) {
    throw new DevinAccountIdentityError(
      "auth-missing",
      "The Devin profile has no usable credential at its declared account source; sign in before launching it.",
    );
  }
  const fingerprint = credentialFingerprint(credential);
  let proof = proofCache.get(fingerprint);
  if (!proof) {
    proof = fetchDevinAccountUserId(credential, signal);
    proof.catch(() => {
      if (proofCache.get(fingerprint) === proof) proofCache.delete(fingerprint);
    });
    proofCache.set(fingerprint, proof);
  }
  return proof;
}

/**
 * The immutable scope identity for one context, bound to the PROVED stable
 * account user id and the EFFECTIVE org selection (see sessionScope and
 * `orgSelection.ts`). This is the only identity profiles may stamp or
 * validate against.
 */
export async function resolveDevinProvenScopeIdentity(
  context: DevinExecutionContext,
  signal?: AbortSignal | undefined,
): Promise<string> {
  const userId = await resolveDevinAccountUserId(context, signal);
  // Effective — not settings-only — org: an explicit `--config` file or an
  // inherited native `devin.org_id` can change at the same user/root/path,
  // and the binding must follow the org the session will actually run under.
  // A declared settings org seeds its own view, so it resolves to itself.
  const orgId = await resolveDevinEffectiveOrgId(context, signal);
  return devinSessionScopeIdentity({
    location: context.location,
    account: context.account,
    orgId,
    runtimeTarget: context.runtimeTarget,
    roots: { dataRoot: context.roots.dataRoot },
    accountUserId: userId,
  });
}

/** Test hook: drop every cached fingerprint/proof (never needed in production). */
export function resetDevinAccountIdentityCaches(): void {
  proofCache.clear();
}
