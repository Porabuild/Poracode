import { z } from "zod";

/**
 * Poracode-owned Devin profile configuration — format 2 (pure schema).
 *
 * A Devin profile is an `AgentInstanceConfig` whose `driver` is `"devin"`; the
 * opaque `config` field carries this schema. Format identity lives here so a
 * future format can be preserved verbatim and reported as disabled instead of
 * being reinterpreted as base-native auth (plan §4, §8).
 *
 * This module is renderer-safe: only `zod`, no Node APIs. The renderer
 * (`providers/devin`) consumes the types and may re-run the pure helpers; the
 * supervisor validates the persisted payload authoritatively.
 *
 * Deliberately NOT a second store for thread knobs the shared `ThreadConfig`
 * already owns (model, effort, fast, thinking, approval policy, sandbox):
 * profile defaults for those would create two conflicting sources. This schema
 * carries only the dimensions `ThreadConfig` cannot express:
 *
 * - `auth` — where the login lives: the native default credential root, an
 *   isolated Poracode-managed account root owned by this profile, or a
 *   reference to another profile's isolated root (direct owner ids only,
 *   never reference chains).
 * - `configPath` — the native user-config file passed as `--config`.
 * - `orgId` — `devin.org_id` selection applied to the profile's config view.
 * - `runtimeTarget` — local agent vs the `--cloud` ACP relay.
 * - `agentType` — the CLI's closed root-agent enum (`summarizer | review`);
 *   custom native personas are NOT root agent types (see `personas/`).
 * - `cloudDefaults` (format 2) — provider-owned defaults for the cloud chats
 *   this profile starts: workspace `repositories`, `persona`, and cloud
 *   `platform`. See `devinCloudDefaultsSchema` for the absence semantics.
 *
 * Unknown top-level keys are retained on parse so a hand-edited config never
 * loses data it carries for a newer Poracode version.
 *
 * Format compatibility:
 *
 * - Absent `format` means the latest schema (2).
 * - An explicit `format: 1` is read as legacy, unchanged: format-1 payloads
 *   parse exactly as the format-1 schema did and keep their marker. A format-1
 *   record carrying `cloudDefaults` is INVALID — older readers would apply the
 *   record while silently ignoring the new choices, so the combination is
 *   refused instead of being kept. Saving such a profile from the editor
 *   rewrites it as format 2, which applies the choices.
 * - An explicit format 2 written here is refused by the previous format-1
 *   guard (unknown format → disabled, payload preserved), so an old Poracode
 *   artifact can never silently ignore these settings.
 */
export const DEVIN_PROFILE_CONFIG_FORMAT = 2;

/** The previous format, still read explicitly-marked payloads of unchanged. */
export const DEVIN_PROFILE_CONFIG_FORMAT_LEGACY = 1;

/** Version marker persisted inside a Poracode-provisioned isolated account root. */
export const DEVIN_ACCOUNT_ROOT_FORMAT = 1;

export const devinProfileRuntimeTargetSchema = z.enum(["local", "cloud"]);
export type DevinProfileRuntimeTarget = z.infer<typeof devinProfileRuntimeTargetSchema>;

/**
 * Root agent types `devin acp --agent-type` actually accepts (live clap enum
 * on 3000.11.3). Arbitrary custom personas are native subagents, not values.
 */
export const devinProfileAgentTypeSchema = z.enum(["summarizer", "review"]);
export type DevinProfileAgentType = z.infer<typeof devinProfileAgentTypeSchema>;

/**
 * Cloud platforms Devin cloud workspaces run on (native CLI values). An
 * explicit platform is an exact request: it fails visibly when the
 * organization has no cloud machines of that kind, and there is deliberately
 * no guessed fallback.
 */
export const DEVIN_CLOUD_PLATFORMS = ["linux", "macos", "windows"] as const;
export const devinCloudPlatformSchema = z.enum(DEVIN_CLOUD_PLATFORMS);
export type DevinCloudPlatform = z.infer<typeof devinCloudPlatformSchema>;

/**
 * One workspace repository identifier, opaque `owner/name`. Values travel
 * CSV-comma-separated on the native wire (live probe echo), so a comma or
 * control character can never appear inside one entry, and the length cap is
 * a sensible bound — not a provider ID pattern (none is invented here).
 */
const devinCloudRepositorySchema = z
  .string()
  .min(1)
  .max(512)
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point (CSV wire format)
  .regex(/^[^,\u0000-\u001f\u007f]+$/, "must not contain commas or control characters");

const devinCloudRepositoriesSchema = z
  .array(devinCloudRepositorySchema)
  .max(100)
  .refine((repositories) => new Set(repositories).size === repositories.length, {
    message: "repositories must be unique",
  });

/**
 * Provider-owned defaults applied when this profile starts a cloud chat —
 * before the chat's first message. Every field is optional and its ABSENCE
 * means "leave Devin's current choice", including on a pending session retry:
 *
 * - `repositories` absent → Devin keeps choosing workspaces on its own;
 *   `[]` → explicitly clear all repositories; otherwise the exact list.
 * - `persona` absent → Devin keeps its current persona; `""` → explicitly the
 *   native Agent (an empty string is a real choice here, never dropped);
 *   otherwise the exact persona slug, which must exist in Devin's own
 *   configuration and fails visibly otherwise.
 * - `platform` absent → Devin keeps choosing; otherwise the exact platform.
 *
 * Unknown keys inside `cloudDefaults` are retained on parse, like unknown
 * top-level keys.
 */
export const devinCloudDefaultsSchema = z
  .object({
    repositories: devinCloudRepositoriesSchema.optional(),
    persona: z.string().max(512).optional(),
    platform: devinCloudPlatformSchema.optional(),
  })
  .passthrough();
export type DevinCloudDefaults = z.infer<typeof devinCloudDefaultsSchema>;

/**
 * Owner ids are opaque `AgentInstanceId` values, never labels or paths; the
 * execution context derives filesystem roots from them deterministically.
 */
const devinProfileOwnerRefSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9_\-:.]*$/i);

export const devinProfileAuthSourceSchema = z.discriminatedUnion("kind", [
  /**
   * Use the native default login in its existing location. No credential is
   * copied and no root is redirected — several profiles may share one login.
   */
  z.object({ kind: z.literal("native-default") }).passthrough(),
  /**
   * This profile owns a stable, isolated account root in Poracode-managed
   * storage; its own login is performed through that root.
   */
  z.object({ kind: z.literal("isolated-owner") }).passthrough(),
  /**
   * Share another profile's isolated root. References point directly at the
   * owner id; the root is derived deterministically, never stored as a path.
   */
  z
    .object({ kind: z.literal("owner-reference"), ownerId: devinProfileOwnerRefSchema })
    .passthrough(),
]);
export type DevinProfileAuthSource = z.infer<typeof devinProfileAuthSourceSchema>;

/** Format-2 record shape: everything format 1 carried, plus `cloudDefaults`. */
export const devinProfileConfigSchema = z
  .object({
    format: z.number().int().default(DEVIN_PROFILE_CONFIG_FORMAT),
    auth: devinProfileAuthSourceSchema.default({ kind: "native-default" }),
    /** Native user-config override passed as `devin --config <path>` (leading `~/` allowed). */
    configPath: z.string().min(1).max(4096).optional(),
    /**
     * `devin.org_id` for this profile's config view. Org belongs to the
     * configuration, not to the credential: two profiles may share one login
     * while targeting different authorized orgs.
     */
    orgId: z.string().min(1).max(200).optional(),
    runtimeTarget: devinProfileRuntimeTargetSchema.optional(),
    agentType: devinProfileAgentTypeSchema.optional(),
    cloudDefaults: devinCloudDefaultsSchema.optional(),
  })
  .passthrough();

/**
 * The previous format-1 record shape, kept verbatim so an explicitly marked
 * legacy payload parses exactly as it always did. No `cloudDefaults` here —
 * a legacy record carrying that key is refused by `parseDevinProfileConfig`
 * before this schema would have passthrough'd it.
 */
export const devinProfileConfigSchemaFormat1 = z
  .object({
    format: z.number().int().default(DEVIN_PROFILE_CONFIG_FORMAT_LEGACY),
    auth: devinProfileAuthSourceSchema.default({ kind: "native-default" }),
    configPath: z.string().min(1).max(4096).optional(),
    orgId: z.string().min(1).max(200).optional(),
    runtimeTarget: devinProfileRuntimeTargetSchema.optional(),
    agentType: devinProfileAgentTypeSchema.optional(),
  })
  .passthrough();

export type DevinProfileConfig = z.infer<typeof devinProfileConfigSchema>;

export type DevinProfileConfigParseResult =
  | { status: "ok"; config: DevinProfileConfig }
  /**
   * A future format: the raw payload is preserved (callers keep it persisted
   * untouched) and the profile is disabled with this explanation instead of
   * being interpreted as base-native auth.
   */
  | { status: "unsupported-format"; formatVersion: unknown; reason: string }
  | { status: "invalid"; reason: string };

function rawFormatOf(value: unknown): unknown {
  if (value !== undefined && value !== null && typeof value === "object") {
    return (value as { format?: unknown }).format;
  }
  return undefined;
}

/** Parse a persisted `AgentInstanceConfig.config` payload. */
export function parseDevinProfileConfig(value: unknown): DevinProfileConfigParseResult {
  const rawFormat = rawFormatOf(value);
  if (
    rawFormat !== undefined &&
    rawFormat !== DEVIN_PROFILE_CONFIG_FORMAT &&
    rawFormat !== DEVIN_PROFILE_CONFIG_FORMAT_LEGACY
  ) {
    return {
      status: "unsupported-format",
      formatVersion: rawFormat,
      reason: `Unknown Devin profile config format ${String(rawFormat)}; the stored settings are preserved but this profile stays disabled until Poracode learns that format.`,
    };
  }
  // An explicitly marked format-1 record is read by the legacy schema so the
  // format-2 additions can never change what a legacy payload means.
  const schema =
    rawFormat === DEVIN_PROFILE_CONFIG_FORMAT_LEGACY
      ? devinProfileConfigSchemaFormat1
      : devinProfileConfigSchema;
  if (
    rawFormat === DEVIN_PROFILE_CONFIG_FORMAT_LEGACY &&
    value !== null &&
    typeof value === "object" &&
    "cloudDefaults" in (value as Record<string, unknown>)
  ) {
    return {
      status: "invalid",
      reason:
        "cloudDefaults requires Devin profile config format 2. This record is explicitly marked format 1, which older Poracode builds read while silently ignoring cloudDefaults — carrying the choices under format 1 is refused instead. Saving the profile from this Poracode rewrites it as format 2, which applies them.",
    };
  }
  const parsed = schema.safeParse(value ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      status: "invalid",
      reason: issue
        ? `Invalid Devin profile config at "${issue.path.join(".")}": ${issue.message}`
        : "Invalid Devin profile config.",
    };
  }
  return { status: "ok", config: parsed.data };
}

/** True when a parse result yields a usable profile configuration. */
export function isUsableDevinProfileConfig(
  result: DevinProfileConfigParseResult,
): result is Extract<DevinProfileConfigParseResult, { status: "ok" }> {
  return result.status === "ok";
}

/** Human-readable explanation for a disabled profile, or undefined when usable. */
export function describeDevinProfileConfigUnavailability(
  result: DevinProfileConfigParseResult,
): string | undefined {
  return result.status === "ok" ? undefined : result.reason;
}

/**
 * Deterministic 32-bit FNV-1a hash rendered as 8 hex characters. Shared
 * identity helper: config generations and filesystem-safe root segments use
 * it so distinct identities stay distinct without storing paths. NEVER feed
 * secret values into a string that is persisted or logged — callers hash
 * key names, not values.
 */
export function devinStableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Canonical JSON: object keys sorted recursively so nested payloads
 * (`auth.kind`, `auth.ownerId`, `cloudDefaults.repositories`, unknown nested
 * objects) serialize deterministically regardless of insertion order.
 * `undefined`-valued keys are dropped, matching `JSON.stringify` semantics.
 */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, member]) => member !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`).join(",")}}`;
  }
  return value === undefined ? "null" : (JSON.stringify(value) ?? "null");
}

/**
 * Stable identity of the profile configuration content. Feeds the model-catalog
 * cache key so a config edit (org, auth source, config path, cloud defaults)
 * invalidates derived catalogs without a persisted version bump (in-memory
 * cache only). Unknown keys participate — they are part of the configuration —
 * at every nesting level, so two profiles that differ only in their auth
 * binding (for example `native-default` vs `isolated-owner`, or two different
 * owner references) always hash differently.
 */
export function devinProfileConfigGeneration(config: DevinProfileConfig): string {
  return devinStableHash(canonicalJson(config));
}
