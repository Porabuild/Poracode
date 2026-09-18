import {
  defaultSharedSettings,
  migrateSharedSettingsValues,
  sanitizeLegacyMcpServerUrls,
  sharedSettingsSchema,
  type SharedSettings,
} from "@/shared/settings";
import { SETTINGS_LIST_FIELDS } from "@/shared/settingsTransactions";
import { parseMachineKey } from "@/shared/machines";
import { isRecord, settingsListEntryId } from "./settingsSubjects";

/** Flat JSON remains readable; absence is the legacy generation, never a future-version bypass. */
export const SETTINGS_DOCUMENT_VERSION = 1 as const;
export const SETTINGS_DOCUMENT_VERSION_KEY = "$poracodeSettingsVersion";

export class SettingsDocumentError extends Error {
  constructor(
    readonly kind: "corrupt" | "unsupported",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SettingsDocumentError";
  }
}

export interface SettingsDocument {
  raw: Record<string, unknown>;
  settings: SharedSettings;
}

/**
 * Delta-map fields hold user-chosen keys, not structural shape: a stored record
 * round-trips exactly as written and the field default applies only when the
 * whole field is absent. Key-filling their defaults here would corrupt
 * whole-field replacements on the settings CAS (a written `{pattern: true}`
 * must read back as itself, not as the default map plus the write). Structural
 * object fields (browser, audio, usage) keep key-level fill in
 * `fillMissing` so newly added sub-keys default in old documents.
 */
const SETTINGS_DELTA_MAP_FIELDS: readonly (keyof SharedSettings)[] = ["searchExclude"];

/** Defaults fill absence only. An invalid existing value must not be silently repaired by a write. */
function fillMissing(value: unknown, defaults: unknown): unknown {
  if (value === undefined) return structuredClone(defaults);
  if (!isRecord(value) || !isRecord(defaults)) return value;
  const result = { ...value };
  for (const [key, fallback] of Object.entries(defaults))
    result[key] = fillMissing(result[key], fallback);
  return result;
}

function fillFieldDefault(field: keyof SharedSettings, value: unknown): unknown {
  const defaults = defaultSharedSettings[field];
  if ((SETTINGS_DELTA_MAP_FIELDS as readonly string[]).includes(field))
    return value === undefined ? structuredClone(defaults) : value;
  return fillMissing(value, defaults);
}

export function decodeSettingsDocument(raw: unknown): SettingsDocument {
  if (!isRecord(raw))
    throw new SettingsDocumentError("corrupt", "Shared settings must be a JSON object.");
  const version = raw[SETTINGS_DOCUMENT_VERSION_KEY];
  if (Object.hasOwn(raw, SETTINGS_DOCUMENT_VERSION_KEY) && version !== SETTINGS_DOCUMENT_VERSION) {
    throw new SettingsDocumentError(
      "unsupported",
      "Shared settings use an unsupported document version.",
    );
  }
  // This named legacy migration precedes the tightened URL schema. All other invalid values fail.
  const source = sanitizeLegacyMcpServerUrls(raw) as Record<string, unknown>;
  const known: Record<string, unknown> = {};
  for (const [field, schema] of Object.entries(sharedSettingsSchema.shape)) {
    const result = schema.safeParse(fillFieldDefault(field as keyof SharedSettings, source[field]));
    if (!result.success)
      throw new SettingsDocumentError(
        "corrupt",
        `Shared settings contain an invalid ${field} value.`,
        { cause: result.error },
      );
    known[field] = result.data;
  }
  for (const key of Object.keys(known.machineSettings as SharedSettings["machineSettings"]))
    if (!parseMachineKey(key))
      throw new SettingsDocumentError("corrupt", "Shared settings contain an invalid machine key.");
  const validated = known as SharedSettings;
  const withUnknown = preserveUnknownSettingsValues(source, validated, validated) as SharedSettings;
  const migrated = migrateSharedSettingsValues(withUnknown, source).settings;
  const settings = sharedSettingsSchema.parse(migrated);
  for (const field of SETTINGS_LIST_FIELDS) {
    const ids = settings[field].map((entry) => settingsListEntryId(field, entry));
    if (new Set(ids).size !== ids.length)
      throw new SettingsDocumentError(
        "corrupt",
        `Shared settings contain duplicate ${field} identities.`,
      );
  }
  return { raw: migrated as unknown as Record<string, unknown>, settings };
}

export function parseSettingsDocument(contents: string): SettingsDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(contents);
  } catch (error) {
    throw new SettingsDocumentError("corrupt", "Shared settings contain malformed JSON.", {
      cause: error,
    });
  }
  return decodeSettingsDocument(raw);
}

/** Reject additions outside the known value schema; provider-owned opaque config remains opaque. */
export function assertKnownSettingsValue(provided: unknown, parsed: unknown): void {
  if (provided !== undefined && parsed === undefined)
    throw new Error("Unknown settings value field.");
  if (Array.isArray(provided) && Array.isArray(parsed)) {
    if (provided.length !== parsed.length) throw new Error("Invalid settings list value.");
    provided.forEach((value, index) => assertKnownSettingsValue(value, parsed[index]));
  } else if (isRecord(provided) && isRecord(parsed)) {
    for (const [key, value] of Object.entries(provided)) {
      if (!Object.hasOwn(parsed, key)) throw new Error(`Unknown settings value field: ${key}`);
      assertKnownSettingsValue(value, parsed[key]);
    }
  }
}

/** Keep future fields already on disk without admitting new unknown fields from a client. */
export function preserveUnknownSettingsValues(
  raw: unknown,
  before: unknown,
  after: unknown,
  listField?: (typeof SETTINGS_LIST_FIELDS)[number],
): unknown {
  if (isRecord(raw) && isRecord(before) && isRecord(after)) {
    const next = { ...after };
    for (const [key, value] of Object.entries(raw)) {
      if (!Object.hasOwn(before, key))
        Object.defineProperty(next, key, {
          value,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      else if (Object.hasOwn(after, key))
        next[key] = preserveUnknownSettingsValues(value, before[key], after[key]);
    }
    return next;
  }
  if (Array.isArray(raw) && Array.isArray(before) && Array.isArray(after)) {
    const identity = (value: unknown): string | undefined =>
      listField
        ? settingsListEntryId(listField, value)
        : isRecord(value) && typeof value.id === "string"
          ? value.id
          : undefined;
    return after.map((value, index) => {
      const id = identity(value);
      const oldIndex =
        id === undefined ? index : before.findIndex((entry) => identity(entry) === id);
      return oldIndex < 0
        ? value
        : preserveUnknownSettingsValues(raw[oldIndex], before[oldIndex], value);
    });
  }
  return after;
}
