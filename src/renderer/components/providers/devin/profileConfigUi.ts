/**
 * Renderer-side view helpers for the Devin profile configuration (format 2).
 *
 * The schema itself is authoritative in the pure shared module
 * (`src/shared/agents/devin/profileConfig.ts`, the same module the supervisor
 * validates persisted payloads with) — this file deliberately carries no
 * second classifier. It only adapts the shared parse result to what the
 * settings UI renders — usable, stored-by-a-newer-Poracode-format, or invalid
 * — and keeps the raw persisted record alongside so nothing the user stored
 * is dropped by a display edit. Form/patch helpers below build the
 * persisted payload; the supervisor revalidates it authoritatively on flush.
 */
import type { AgentInstanceConfig } from "@/shared/contracts";
import {
  DEVIN_CLOUD_PLATFORMS,
  DEVIN_PROFILE_CONFIG_FORMAT,
  devinProfileConfigGeneration,
  parseDevinProfileConfig,
  type DevinCloudDefaults,
  type DevinCloudPlatform,
  type DevinProfileAgentType,
  type DevinProfileAuthSource,
  type DevinProfileConfig,
  type DevinProfileRuntimeTarget,
} from "@/shared/agents/devin/profileConfig";

export {
  DEVIN_CLOUD_PLATFORMS,
  DEVIN_PROFILE_CONFIG_FORMAT,
  devinProfileConfigGeneration,
  parseDevinProfileConfig,
  type DevinCloudDefaults,
  type DevinCloudPlatform,
  type DevinProfileAgentType,
  type DevinProfileAuthSource,
  type DevinProfileConfig,
  type DevinProfileRuntimeTarget,
};

export const DEVIN_PROFILE_DRIVER = "devin";

/**
 * How the settings UI should treat one persisted config. `invalid` carries no
 * per-field detail on purpose: the shared parser's prose is supervisor-facing
 * English the renderer cannot localize, and the editor's warning only needs
 * "kept, but saving replaces it".
 */
export type DevinProfileConfigView =
  | { status: "usable"; config: DevinProfileConfig; raw: Record<string, unknown> }
  | {
      status: "unsupported-format";
      formatVersion: unknown;
      raw: Record<string, unknown>;
    }
  | { status: "invalid"; raw: Record<string, unknown> };

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Classify a persisted profile config through the shared parser. The raw
 * record (when the payload is an object) always rides along: patches merge
 * into it so unknown keys from a newer Poracode survive a display edit.
 */
export function devinProfileConfigView(value: unknown): DevinProfileConfigView {
  const raw = asRecord(value);
  const parsed = parseDevinProfileConfig(value);
  switch (parsed.status) {
    case "ok":
      return { status: "usable", config: parsed.config, raw: raw ?? {} };
    case "unsupported-format":
      return { status: "unsupported-format", formatVersion: parsed.formatVersion, raw: raw ?? {} };
    case "invalid":
      return { status: "invalid", raw: raw ?? {} };
  }
}

export function emptyDevinProfileConfig(): Record<string, unknown> {
  return { format: DEVIN_PROFILE_CONFIG_FORMAT, auth: { kind: "native-default" } };
}

/**
 * Canonical JSON: object keys sorted recursively so nested payloads
 * (`auth.kind`, `auth.ownerId`, `cloudDefaults`, unknown nested objects)
 * serialize deterministically regardless of insertion order. `undefined`-valued
 * keys are dropped, matching `JSON.stringify` semantics.
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
 * Collision-free content identity of a persisted config record: the canonical
 * serialization above, compared as a string. Unlike the 32-bit
 * `devinProfileConfigGeneration` hash (cache keys, where collisions are
 * tolerable), this is used to confirm that what the host holds is exactly
 * what the editor wrote — unknown fields and every nesting level included,
 * so a host-side mangle or drop can never read as a confirmed save.
 */
export function devinProfileConfigFingerprint(value: unknown): string {
  return canonicalJson(value);
}

/** Auth source of a usable view, for subtitles and owner resolution. */
export function devinProfileAuthKind(
  config: DevinProfileConfig,
): "native-default" | "isolated-owner" | "owner-reference" {
  return config.auth.kind;
}

/** Owner id of an `owner-reference` auth source, when well-formed. */
export function devinProfileOwnerRef(config: DevinProfileConfig): string | undefined {
  return config.auth.kind === "owner-reference" &&
    typeof config.auth.ownerId === "string" &&
    config.auth.ownerId.length > 0
    ? config.auth.ownerId
    : undefined;
}

// ── Cloud chat setup form ────────────────────────────────────────────────────

/**
 * Per-dimension edit modes for the cloud chat setup section. Every mode is a
 * nonempty string so a Select can never fall back to an empty "Select an
 * item" default key, and "keep" is a real stored-able state (absent field →
 * Devin keeps choosing) rather than a UI-only placeholder.
 */
export type DevinCloudRepositoryMode = "keep" | "none" | "list";
export type DevinCloudPersonaMode = "keep" | "agent" | "custom";
export type DevinCloudPlatformMode = "keep" | "select";

/**
 * Editor state for the cloud chat setup choices. Modes say whether a
 * dimension is explicitly set; the paired text/select values carry the
 * explicit choice. No account or repository listing feeds this state —
 * values are exactly what the user typed.
 */
export interface DevinCloudDefaultsForm {
  repositoryMode: DevinCloudRepositoryMode;
  /** Comma-separated owner/name entries; owned when `repositoryMode` is `"list"`. */
  repositoriesText: string;
  personaMode: DevinCloudPersonaMode;
  /** Persona slug; owned when `personaMode` is `"custom"` (never empty there). */
  personaSlug: string;
  platformMode: DevinCloudPlatformMode;
  /** Exact platform; owned when `platformMode` is `"select"`. */
  platform: DevinCloudPlatform | undefined;
}

/** All-keep form: every cloud dimension stays with Devin's current choice. */
export function emptyDevinCloudDefaultsForm(): DevinCloudDefaultsForm {
  return {
    repositoryMode: "keep",
    repositoriesText: "",
    personaMode: "keep",
    personaSlug: "",
    platformMode: "keep",
    platform: undefined,
  };
}

/**
 * Seed the editor from stored cloud defaults so dormant choices survive a
 * save that never opened the cloud section: `[]` re-seeds as "no
 * repositories", `""` as the explicit Agent, any other persona as the custom
 * slug it is.
 */
export function devinCloudDefaultsFormFromConfig(
  config: DevinProfileConfig,
): DevinCloudDefaultsForm {
  const stored = asRecord(config.cloudDefaults);
  const form = emptyDevinCloudDefaultsForm();
  if (stored === undefined) return form;
  if (Array.isArray(stored.repositories)) {
    const repositories = stored.repositories.filter(
      (entry): entry is string => typeof entry === "string",
    );
    form.repositoryMode = repositories.length > 0 ? "list" : "none";
    form.repositoriesText = repositories.join(", ");
  }
  if (typeof stored.persona === "string") {
    form.personaMode = stored.persona === "" ? "agent" : "custom";
    form.personaSlug = stored.persona;
  }
  if (typeof stored.platform === "string") {
    form.platformMode = "select";
    form.platform = DEVIN_CLOUD_PLATFORMS.includes(stored.platform as DevinCloudPlatform)
      ? (stored.platform as DevinCloudPlatform)
      : undefined;
  }
  return form;
}

/**
 * Split the comma-separated repository text into wire entries: commas are the
 * CSV delimiter the native probe echoes, so they never live inside an entry.
 * Blank segments (trailing commas, double commas) are dropped.
 */
export function parseDevinCloudRepositoryEntries(text: string): string[] {
  return text
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * The `cloudDefaults` value a form state stands for, or `undefined` when
 * every dimension is "keep" (absent → Devin keeps choosing).
 */
export function devinCloudDefaultsFromForm(
  form: DevinCloudDefaultsForm,
): DevinCloudDefaults | undefined {
  const value: Record<string, unknown> = {};
  if (form.repositoryMode === "none") {
    value.repositories = [];
  } else if (form.repositoryMode === "list") {
    value.repositories = parseDevinCloudRepositoryEntries(form.repositoriesText);
  }
  if (form.personaMode === "agent") {
    // An empty persona IS the explicit Agent choice — never dropped.
    value.persona = "";
  } else if (form.personaMode === "custom") {
    value.persona = form.personaSlug.trim();
  }
  if (form.platformMode === "select" && form.platform !== undefined) {
    value.platform = form.platform;
  }
  return Object.keys(value).length > 0 ? (value as DevinCloudDefaults) : undefined;
}

/** Why the current cloud form cannot be saved yet; empty means savable. */
export type DevinCloudFormIssue =
  | "repository-entry"
  | "repository-duplicate"
  | "repository-overflow"
  | "persona-empty"
  | "persona-overflow";

// eslint-disable-next-line no-control-regex -- rejecting control characters is the point (CSV wire format)
const DEVIN_CLOUD_REPOSITORY_PATTERN = /^[^,\u0000-\u001f\u007f]+$/;

export function devinCloudFormIssues(form: DevinCloudDefaultsForm): DevinCloudFormIssue[] {
  const issues: DevinCloudFormIssue[] = [];
  if (form.repositoryMode === "list") {
    const entries = parseDevinCloudRepositoryEntries(form.repositoriesText);
    if (
      entries.some((entry) => entry.length > 512 || !DEVIN_CLOUD_REPOSITORY_PATTERN.test(entry))
    ) {
      issues.push("repository-entry");
    }
    if (new Set(entries).size !== entries.length) issues.push("repository-duplicate");
    if (entries.length > 100) issues.push("repository-overflow");
  }
  if (form.personaMode === "custom") {
    const slug = form.personaSlug.trim();
    if (slug.length === 0) issues.push("persona-empty");
    if (slug.length > 512) issues.push("persona-overflow");
  }
  return issues;
}

export interface DevinProfileConfigForm {
  authKind: "native-default" | "isolated-owner" | "owner-reference";
  /** Required when `authKind` is `owner-reference`. */
  ownerId: string | undefined;
  /** Native user-config override (`--config`); empty string removes the field. */
  configPath: string;
  /** `devin.org_id` for this profile's config view; empty string removes it. */
  orgId: string;
  runtimeTarget: DevinProfileRuntimeTarget | undefined;
  agentType: DevinProfileAgentType | undefined;
  /** Cloud chat setup choices; applied only when `runtimeTarget` is `"cloud"`. */
  cloud: DevinCloudDefaultsForm;
}

function setOrDelete(record: Record<string, unknown>, key: string, value: unknown): void {
  if (value === undefined || value === "") delete record[key];
  else record[key] = value;
}

/**
 * Merge the form's cloud chat setup choices into the raw record's
 * `cloudDefaults`, preserving keys this editor does not own (a newer
 * Poracode's unknown nested fields survive a display edit). Only the three
 * owned dimensions are set or removed; a value of all-keep leaves just the
 * unknown keys, and a record with nothing left is dropped entirely so the
 * absent field means "leave the native choice".
 */
function applyCloudDefaultsPatch(
  next: Record<string, unknown>,
  cloud: DevinCloudDefaultsForm,
): void {
  const carried = asRecord(next.cloudDefaults);
  const value: Record<string, unknown> = carried ? { ...carried } : {};
  delete value.repositories;
  if (cloud.repositoryMode === "none") value.repositories = [];
  else if (cloud.repositoryMode === "list")
    value.repositories = parseDevinCloudRepositoryEntries(cloud.repositoriesText);
  delete value.persona;
  if (cloud.personaMode === "agent") value.persona = "";
  else if (cloud.personaMode === "custom") value.persona = cloud.personaSlug.trim();
  delete value.platform;
  if (cloud.platformMode === "select" && cloud.platform !== undefined)
    value.platform = cloud.platform;
  if (Object.keys(value).length === 0) delete next.cloudDefaults;
  else next.cloudDefaults = value;
}

/**
 * Merge edited form values into the raw persisted record. Unknown keys —
 * including ones a newer Poracode format might carry — are preserved because
 * the raw record is spread first; only the fields this form owns are set or
 * removed. Stale keys from a previous auth source (`ownerId` after leaving
 * `owner-reference`) are removed so the supervisor never revalidates a
 * leftover reference.
 *
 * Cloud-only rules: a cloud profile ignores the root agent type, so saving
 * removes `agentType` instead of pretending it applies, and the cloud chat
 * setup choices are written from the form. Any other target leaves both
 * `agentType` to the form and `cloudDefaults` exactly as stored — dormant
 * choices ride along untouched.
 */
export function devinProfileConfigPatch(
  raw: Record<string, unknown>,
  form: DevinProfileConfigForm,
): Record<string, unknown> {
  const auth =
    form.authKind === "owner-reference"
      ? { kind: "owner-reference", ownerId: form.ownerId ?? "" }
      : { kind: form.authKind };
  const next: Record<string, unknown> = {
    ...raw,
    format: DEVIN_PROFILE_CONFIG_FORMAT,
    auth,
  };
  setOrDelete(next, "configPath", form.configPath.trim());
  setOrDelete(next, "orgId", form.orgId.trim());
  setOrDelete(next, "runtimeTarget", form.runtimeTarget);
  if (form.runtimeTarget === "cloud") {
    delete next.agentType;
    applyCloudDefaultsPatch(next, form.cloud);
  } else {
    setOrDelete(next, "agentType", form.agentType);
  }
  return next;
}

export interface DevinProfileOwnerCandidate {
  id: string;
  displayName: string;
}

/**
 * Devin instances that can serve as a shared-login owner: usable configs whose
 * auth source is an isolated owner. Unusable (future-format/invalid) profiles
 * are excluded so a broken profile can never become someone's auth source.
 */
export function devinProfileOwnerCandidates(
  instances: Record<string, AgentInstanceConfig>,
  excludeInstanceId?: string,
): DevinProfileOwnerCandidate[] {
  return Object.values(instances)
    .filter(
      (instance) =>
        instance.driver === DEVIN_PROFILE_DRIVER &&
        instance.id !== excludeInstanceId &&
        instance.enabled !== false,
    )
    .filter((instance) => {
      const view = devinProfileConfigView(instance.config);
      return view.status === "usable" && view.config.auth.kind === "isolated-owner";
    })
    .map((instance) => ({
      id: instance.id,
      displayName: instance.displayName ?? instance.id,
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

/**
 * Profiles that share `instanceId`'s isolated login through `owner-reference`.
 * The editor's save guard and the host's persistence guard both consume this;
 * this is the pure lookup.
 */
export function findDevinProfileDependents(
  instanceId: string,
  instances: Record<string, AgentInstanceConfig>,
): AgentInstanceConfig[] {
  return Object.values(instances).filter((instance) => {
    if (instance.driver !== DEVIN_PROFILE_DRIVER) return false;
    const view = devinProfileConfigView(instance.config);
    return view.status === "usable" && devinProfileOwnerRef(view.config) === instanceId;
  });
}
