import { z } from "zod";
import type { RemoteAccessScope } from "@/shared/remote/protocol/core";
import { sshConnectionConfigSchema } from "@/shared/ssh";

/**
 * C1 host-owned environment contracts (store slice).
 *
 * Versioning notes:
 * - `ENVIRONMENT_STORE_FORMAT_VERSION` is the on-disk `environments.json`
 *   format. Format 1 is the first shipped shape; there is no legacy generation.
 *   An unknown/absent version and a version greater than 1 both refuse without
 *   rewriting the file (see the host store). Shape changes require a bump plus
 *   an ordered migration.
 * - Nothing here changes the remote protocol enum, the route registry, or the
 *   descriptor capability. Runtime connection state (`state`, errors,
 *   generations) is not part of the durable record; the future environment
 *   controller owns it.
 */

export const ENVIRONMENT_STORE_FORMAT_VERSION = 1 as const;

/**
 * Read/size bounds for the durable registry. They are deliberately generous
 * for a small configuration file (each environment record is well under a
 * kilobyte) and exist so a corrupt, hostile, or runaway file can never drive
 * an unbounded allocation or callback queue: a reader refuses with a typed
 * limit error and leaves the file untouched. A file that exceeds either bound
 * needs an explicit operator decision, not a silent rewrite.
 */
export const ENVIRONMENT_STORE_MAX_FILE_BYTES = 4 * 1024 * 1024;
export const ENVIRONMENT_STORE_MAX_ENVIRONMENTS = 1000;

export const environmentIdSchema = z.uuid();
export type EnvironmentId = z.infer<typeof environmentIdSchema>;

export const environmentLabelSchema = z.string().trim().min(1).max(100);

/** Same target grammar as the device-local SSH config: `[user@]host`, never option-like. */
export const environmentTargetSchema = sshConnectionConfigSchema.shape.target;

export const environmentPortSchema = z.number().int().min(1).max(65_535);

/**
 * An opaque, host-local credential reference (for example a host-managed
 * identity slot). It is deliberately not a filesystem path: separators,
 * traversal, leading dots/dashes, whitespace, and control characters never
 * parse, so a device-local `identityFile` path cannot be stored or echoed. The
 * future host credential adapter resolves references locally and must apply
 * its own path trust; the store never treats a reference as a path.
 */
export const environmentCredentialRefSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
    "Enter a host credential reference (letters, digits, dot, underscore, colon, dash).",
  )
  .refine((value) => !value.includes(".."), "Credential references cannot contain '..'.");

export const environmentHostKeyFingerprintSchema = z.string().regex(/^SHA256:[A-Za-z0-9+/]{43}$/);

/**
 * Accepted host-key trust. `unknown` is unobserved; `observed` records the
 * first verified TOFU fingerprint; `pinned` enforces an explicitly accepted
 * fingerprint. Malformed combinations (a pin without a fingerprint, an
 * observation without an observed fingerprint, or stray extras) never parse.
 */
export const environmentTrustSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("unknown") }),
  z.strictObject({
    state: z.literal("observed"),
    observedFingerprint: environmentHostKeyFingerprintSchema,
  }),
  z.strictObject({
    state: z.literal("pinned"),
    hostKeyFingerprint: environmentHostKeyFingerprintSchema,
    observedFingerprint: environmentHostKeyFingerprintSchema.optional(),
  }),
]);
export type EnvironmentTrust = z.infer<typeof environmentTrustSchema>;

/** Durable runtime selection. The installed archive is content-addressed by `hash`. */
export const environmentRuntimeSchema = z.strictObject({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  appVersion: z.string().trim().min(1).max(64).optional(),
});
export type EnvironmentRuntime = z.infer<typeof environmentRuntimeSchema>;

/**
 * Child desktop identity. The grammar mirrors the existing remote descriptor
 * (`remoteEnvironmentDescriptorSchema.shape.desktopId`): any non-empty string.
 * The shipped host mints a UUID, but a paired child may present an id that was
 * persisted by an older build or a fixture, so the store must not impose a
 * stricter UUID assumption the descriptor does not.
 */
export const environmentChildDesktopIdSchema = z.string().min(1);

export const environmentChildIdentitySchema = z.strictObject({
  desktopId: environmentChildDesktopIdSchema,
});
export type EnvironmentChildIdentity = z.infer<typeof environmentChildIdentitySchema>;

export const environmentLegacyConnectionIdSchema = z.uuid();
export type EnvironmentLegacyConnectionId = z.infer<typeof environmentLegacyConnectionIdSchema>;

export const environmentDesiredSchema = z.enum(["enabled", "disabled"]);
export type EnvironmentDesired = z.infer<typeof environmentDesiredSchema>;

/**
 * The durable environment record: configuration, desired state, accepted
 * trust, and child identity only. Observed connection state, operation
 * generations, pending work, and transient errors are deliberately absent and
 * live in the future runtime controller (never trusted from disk on startup).
 *
 * `credentialRef` is optional (v1 delegates SSH auth to the host user's
 * OpenSSH), and `legacyConnectionIds` holds at most one explicitly adopted
 * legacy connection id — two legacy child data mappings are never merged into
 * one environment.
 */
export const environmentRecordSchema = z.strictObject({
  environmentId: environmentIdSchema,
  revision: z.number().int().min(1),
  label: environmentLabelSchema,
  target: environmentTargetSchema,
  port: environmentPortSchema.optional(),
  credentialRef: environmentCredentialRefSchema.optional(),
  trust: environmentTrustSchema,
  runtime: environmentRuntimeSchema,
  childIdentity: environmentChildIdentitySchema.optional(),
  legacyConnectionIds: z.array(environmentLegacyConnectionIdSchema).max(1),
  desired: environmentDesiredSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type EnvironmentRecord = z.infer<typeof environmentRecordSchema>;

/** On-disk `environments.json` format. Strict: unknown fields refuse at parse time. */
export const environmentStoreFileSchema = z.strictObject({
  formatVersion: z.literal(ENVIRONMENT_STORE_FORMAT_VERSION),
  environments: z.array(environmentRecordSchema).max(ENVIRONMENT_STORE_MAX_ENVIRONMENTS),
});
export type EnvironmentStoreFile = z.infer<typeof environmentStoreFileSchema>;

/**
 * Read projection for authorized remote callers (ADR §2). It includes the
 * configured SSH target and port so clients can display and edit the target
 * accurately. It never carries `credentialRef`, device identity-file paths,
 * local tunnel endpoints or ports, or tokens; credential presence is a
 * boolean-like enum only.
 */
export const environmentProjectionSchema = z.strictObject({
  environmentId: environmentIdSchema,
  revision: z.number().int().min(1),
  label: environmentLabelSchema,
  target: environmentTargetSchema,
  port: environmentPortSchema.optional(),
  trust: environmentTrustSchema,
  runtime: environmentRuntimeSchema,
  credential: z.enum(["configured", "none"]),
  childIdentity: environmentChildIdentitySchema.optional(),
  legacyConnectionIds: z.array(environmentLegacyConnectionIdSchema),
  desired: environmentDesiredSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});
export type EnvironmentProjection = z.infer<typeof environmentProjectionSchema>;

/**
 * Observed runtime state (ADR §2). It is owned by the host runtime controller
 * and never persisted: a persisted `connected` flag cannot exist, and startup
 * always begins `disconnected` before desired-enabled reconnection. `error` is
 * the bounded bucket for transport/owner/launch failures whose typed code is
 * carried by the public error; the remaining states are actionable categories
 * a client can present (missing host credential, unverified owner, changed
 * child identity, host-key mismatch, repair needed) plus `trust-required` for
 * the probe-before-provision confirmation gate.
 */
export const ENVIRONMENT_RUNTIME_STATES = [
  "disconnected",
  "connecting",
  "connected",
  "error",
  "credential-missing",
  "owner-unverified",
  "identity-changed",
  "hostkey-mismatch",
  "needs-repair",
  "trust-required",
] as const;

export const environmentRuntimeStateSchema = z.enum(ENVIRONMENT_RUNTIME_STATES);
export type EnvironmentRuntimeState = z.infer<typeof environmentRuntimeStateSchema>;

/**
 * Bounded public error codes. Every host-side failure maps into this closed
 * set; raw SSH stderr, remote paths, credential references, and local file
 * paths never cross this boundary. `message` is a fixed short phrase for
 * diagnostics; clients present `code` through their own localization.
 */
export const environmentPublicErrorCodeSchema = z.enum([
  "environment/not-found",
  "environment/revision-conflict",
  "environment/store-busy",
  "environment/store-limit",
  "environment/store-unavailable",
  "environment/invalid-input",
  "environment/not-connected",
  "environment/trust-required",
  "environment/trust-changed",
  "environment/trust-mismatch",
  "environment/hostkey-mismatch",
  "environment/identity-changed",
  "environment/credential-missing",
  "environment/owner-unverified",
  "environment/owner-unresponsive",
  "environment/owner-incompatible",
  "environment/owner-busy",
  "environment/owner-conflict",
  "environment/launch-failed",
  "environment/upgrade-unavailable",
  "environment/upgrade-refused",
  "environment/transport-error",
  "environment/cancelled",
  "environment/internal-error",
  "environment/not-authorized",
]);
export type EnvironmentPublicErrorCode = z.infer<typeof environmentPublicErrorCodeSchema>;

export const environmentPublicErrorSchema = z.strictObject({
  code: environmentPublicErrorCodeSchema,
  message: z.string().trim().min(1).max(240),
  /**
   * Present only for probe/trust outcomes so an operator can confirm the key.
   * A fingerprint is public material, never a secret.
   */
  fingerprint: environmentHostKeyFingerprintSchema.optional(),
  keyType: z.string().trim().min(1).max(64).optional(),
});
export type EnvironmentPublicError = z.infer<typeof environmentPublicErrorSchema>;

/**
 * The runtime projection: the durable redacted projection plus observed state
 * and the bounded last error. In-memory only; `environmentStoreFileSchema`
 * remains the durable shape and contains no state field.
 */
export const environmentPublicProjectionSchema = environmentProjectionSchema.extend({
  state: environmentRuntimeStateSchema,
  lastError: environmentPublicErrorSchema.optional(),
});
export type EnvironmentPublicProjection = z.infer<typeof environmentPublicProjectionSchema>;

/**
 * The parent data-plane prefix (ADR §5). Authorized clients receive this path
 * as an environment endpoint; a loopback tunnel URL or port is never exposed.
 */
export function environmentProxyPrefix(environmentId: string): string {
  return `/api/environments/${environmentId}/proxy/`;
}

/**
 * The reserved parent-credential header for the data plane (ADR §5). The child
 * bearer stays in `Authorization`; the parent access token travels in this
 * header only, is consumed by the parent, and never crosses the child dial.
 */
export const ENVIRONMENT_AUTHORIZATION_HEADER = "x-poracode-environment-authorization";
/**
 * Trusted parent-origin response marker (C1 R1). The parent sets this header
 * to {@link ENVIRONMENT_AUTH_AUTHORITY_PARENT} ONLY when its own authentication
 * step rejects the request pre-dial (missing/invalid parent credential or
 * missing parent scope); CORS/host rejections are not authorization decisions
 * and carry no marker. The parent strips the whole reserved
 * `x-poracode-environment-*` namespace from child HTTP and upgrade responses,
 * so a marker-bearing response proves the parent itself rejected the request
 * before any child dial; a client that cannot read the marker fails closed.
 * Additive within the still-unreleased v1 environment capability: no parent
 * build has shipped the proxy, so `capabilities.sshEnvironments.versions`
 * stays `[1]`.
 */
export const ENVIRONMENT_AUTH_AUTHORITY_HEADER = "x-poracode-environment-auth-authority";
export const ENVIRONMENT_AUTH_AUTHORITY_PARENT = "parent";
/** Reserved internal namespace: any `x-poracode-environment-*` header on a
 * non-proxy path is rejected fail-closed (ADR §5). */
export const ENVIRONMENT_INTERNAL_HEADER_PREFIX = "x-poracode-environment-";
/** One-use parent WS upgrade ticket query parameter (browsers cannot set WS
 * headers), paired with the child's own `ticket` parameter. */
export const ENVIRONMENT_PARENT_TICKET_PARAM = "parentTicket";

/** UUID-shaped environment id segment; a raw segment outside this grammar is a
 * traversal/shape attempt, never a registry lookup. */
const ENVIRONMENT_PROXY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;

export type EnvironmentProxyPathMatch =
  | {
      readonly kind: "match";
      readonly environmentId: string;
      /** Raw child path exactly as received (leading `/` or empty), never
       * decoded or URL-normalized — forwarded verbatim. */
      readonly rawChildPath: string;
      /** Raw query string (without `?`). */
      readonly rawQuery: string;
    }
  | { readonly kind: "invalid"; readonly reason: "traversal" | "shape" };

/**
 * Percent-encoded control bytes at one or two encoding layers: `%00`–`%1f`
 * and `%7f`, plus their once-encoded `%25xx` spellings. The policy is
 * deliberately bounded — the guard NEVER recursively decodes the path and
 * never decodes separators to find a control escape. Two layers are the
 * defined limit because `%2500`-style spellings are the only realistic
 * "double decode" a downstream consumer might perform; anything deeper stays
 * a literal byte string no component treats as syntax. A `%25` that is not
 * followed by a control byte stays legal child path data.
 */
const ENCODED_CONTROL_ESCAPE = /%(?:25)?(?:0[0-9a-fA-F]|1[0-9a-fA-F]|7[fF])/;

/**
 * True when one raw child-path segment is a traversal / absolute-URL attempt.
 * Runs on the RAW path before any WHATWG URL construction or decoding:
 * encoded separators (`%2f`, `%5c`), percent-encoded or literal dot segments,
 * backslashes, literal or percent-encoded control characters (NUL/CR/LF/DEL,
 * including one nested `%25` layer), empty (`//`) segments, and non-`/`-rooted
 * absolute forms all fail closed.
 */
function isUnsafeChildPath(rawChildPath: string): boolean {
  if (rawChildPath === "") return false;
  if (!rawChildPath.startsWith("/")) return true;
  if (rawChildPath.startsWith("//")) return true;
  const lower = rawChildPath.toLowerCase();
  if (lower.includes("\\") || lower.includes("%2f") || lower.includes("%5c")) return true;
  if (ENCODED_CONTROL_ESCAPE.test(rawChildPath)) return true;
  for (const char of rawChildPath) {
    const code = char.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  for (const rawSegment of rawChildPath.split("/")) {
    // A literal or percent-encoded dot segment, including mixed spellings
    // (`.%2e`): decode only the dot escape, never the separators.
    const segment = rawSegment.replace(/%2e/gi, ".");
    if (segment === "." || segment === "..") return true;
    if (segment.includes("%2f") || segment.includes("%2F") || segment.includes("%5c")) return true;
  }
  return false;
}

/**
 * Parses one raw request target against the environment data-plane prefix
 * `/api/environments/{environmentId}/proxy/{rawChildPath}`. Returns `null`
 * when the request is not this prefix at all (ordinary routing keeps it),
 * `"invalid"` for a prefix-shaped traversal/absolute-URL attempt (fail closed
 * with a bounded error, never a registry lookup), or the matched environment
 * id plus the verbatim raw child path.
 *
 * Deliberately does NOT use `new URL`: WHATWG normalization would collapse
 * `..`, backslashes, and encoded separators before the guard could see them.
 */
export function matchEnvironmentProxyPath(rawUrl: string): EnvironmentProxyPathMatch | null {
  const queryIndex = rawUrl.indexOf("?");
  const rawPath = queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);
  const rawQuery = queryIndex === -1 ? "" : rawUrl.slice(queryIndex + 1);
  const prefix = "/api/environments/";
  if (!rawPath.startsWith(prefix)) return null;
  const afterPrefix = rawPath.slice(prefix.length);
  const separator = afterPrefix.indexOf("/");
  if (separator <= 0) return null;
  const rawId = afterPrefix.slice(0, separator);
  const rest = afterPrefix.slice(separator + 1);
  const nextSlash = rest.indexOf("/");
  const firstSegment = nextSlash === -1 ? rest : rest.slice(0, nextSlash);
  if (firstSegment !== "proxy") {
    // A shape that only reveals a proxy path after decoding encoded
    // separators/dots, or a literal dot segment between the id and `proxy`,
    // is an attack on this prefix, never ordinary routing.
    if (firstSegment === "." || firstSegment === ".." || /%2f|%5c|%2e/i.test(firstSegment)) {
      return { kind: "invalid", reason: "shape" };
    }
    return null;
  }
  if (!ENVIRONMENT_PROXY_ID_PATTERN.test(rawId)) return { kind: "invalid", reason: "shape" };
  const rawChildPath = nextSlash === -1 ? "/" : rest.slice(nextSlash);
  if (isUnsafeChildPath(rawChildPath)) return { kind: "invalid", reason: "traversal" };
  return { kind: "match", environmentId: rawId, rawChildPath, rawQuery };
}

/**
 * Whether one raw request target is environment data-plane traffic (a valid
 * match or a prefix-shaped traversal attempt). Used by the relay host adapter
 * to unwrap a relay-bound parent credential — invalid attempts are still
 * rejected by the parent, so unwrapping them cannot widen access.
 */
export function isEnvironmentProxyRequestPath(rawUrl: string): boolean {
  return matchEnvironmentProxyPath(rawUrl) !== null;
}

/**
 * Parent scopes required per ADR §6. These are the existing protocol-v12
 * scopes, reused — never appended to `remoteAccessScopeSchema` or the operator
 * preset. Management always requires all three.
 */
export const ENVIRONMENT_READ_SCOPES = [
  "session:read",
] as const satisfies readonly RemoteAccessScope[];

export const ENVIRONMENT_USE_SCOPES = [
  "session:operate",
  "ports:forward",
] as const satisfies readonly RemoteAccessScope[];

export const ENVIRONMENT_MANAGEMENT_SCOPES = [
  "projects:manage",
  "session:operate",
  "ports:forward",
] as const satisfies readonly RemoteAccessScope[];

export type EnvironmentOperation =
  | "list"
  | "get"
  | "connect"
  | "disconnect"
  | "pairing"
  | "websocket-ticket"
  | "proxy"
  | "create"
  | "update"
  | "delete"
  | "trust"
  | "migrate"
  | "upgrade";

const ENVIRONMENT_OPERATION_SCOPES: Record<EnvironmentOperation, readonly RemoteAccessScope[]> = {
  list: ENVIRONMENT_READ_SCOPES,
  get: ENVIRONMENT_READ_SCOPES,
  connect: ENVIRONMENT_USE_SCOPES,
  disconnect: ENVIRONMENT_USE_SCOPES,
  pairing: ENVIRONMENT_USE_SCOPES,
  "websocket-ticket": ENVIRONMENT_USE_SCOPES,
  proxy: ENVIRONMENT_USE_SCOPES,
  create: ENVIRONMENT_MANAGEMENT_SCOPES,
  update: ENVIRONMENT_MANAGEMENT_SCOPES,
  delete: ENVIRONMENT_MANAGEMENT_SCOPES,
  trust: ENVIRONMENT_MANAGEMENT_SCOPES,
  migrate: ENVIRONMENT_MANAGEMENT_SCOPES,
  upgrade: ENVIRONMENT_MANAGEMENT_SCOPES,
};

/** Parent scopes an environment route must declare for the given operation. */
export function environmentRequiredScopes(
  operation: EnvironmentOperation,
): readonly RemoteAccessScope[] {
  return ENVIRONMENT_OPERATION_SCOPES[operation];
}

/** Pure scope check mirroring the host dispatcher's all-required semantics. */
export function environmentScopesSatisfied(
  granted: readonly RemoteAccessScope[],
  operation: EnvironmentOperation,
): boolean {
  return environmentRequiredScopes(operation).every((scope) => granted.includes(scope));
}
