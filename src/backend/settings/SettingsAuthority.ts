import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SharedSettings } from "@/shared/settings";
import {
  SETTINGS_LIST_FIELDS,
  settingsMutationSchema,
  settingsSubjectId,
  settingsSubjectField,
  type SettingsEdit,
  type SettingsMutationResult,
  type SettingsSnapshot,
} from "@/shared/settingsTransactions";
import { reportSettingsError } from "../BackendSettingsNotifications";
import { persistSettingsDocument } from "./persistSettingsDocument";
import { assertSettingsCredentialPersistence } from "./settingsCredentials";
import {
  SETTINGS_DOCUMENT_VERSION,
  SETTINGS_DOCUMENT_VERSION_KEY,
  assertKnownSettingsValue,
  decodeSettingsDocument,
  parseSettingsDocument,
  preserveUnknownSettingsValues,
  type SettingsDocument,
} from "./settingsDocument";
import {
  allSettingsSubjects,
  assertIndependentSettingsSubjects,
  assertOnlyDeclaredSettingsSubjectsChanged,
  getSettingsSubjectValue,
  replaceSettingsSubject,
  settingsSubjectState,
} from "./settingsSubjects";

/** Matches the live root lease capability; the caller must finish root preparation first. */
export interface SettingsAuthorityLease {
  readonly paths: { readonly dataRoot: string };
  readonly generation: string;
  assertActive(expectedGeneration?: string): void;
}

export type SettingsMutationAuthorizer = (
  edits: readonly SettingsEdit[],
  previous: Readonly<SharedSettings>,
  next: Readonly<SharedSettings>,
) => boolean;

export interface SettingsAuthorityOptions {
  lease: SettingsAuthorityLease;
  /** Omit for session-only credentials. Captures the prepared owner's generation and key mode. */
  assertPersistentCredentials?(): void;
  onCommitted?(result: SettingsMutationResult, settings: SharedSettings): void;
  reportError?(error: unknown): void;
}

/** One committed in-memory view and one async write queue for a leased settings document. */
export class SettingsAuthority {
  readonly authorityId = randomUUID();
  readonly settingsPath: string;
  private readonly generation: string;
  private pending: Promise<void> = Promise.resolve();
  private closing = false;

  private constructor(
    private readonly options: SettingsAuthorityOptions,
    private document: SettingsDocument,
  ) {
    this.generation = options.lease.generation;
    this.settingsPath = join(options.lease.paths.dataRoot, "settings.json");
  }

  static async open(options: SettingsAuthorityOptions): Promise<SettingsAuthority> {
    const generation = options.lease.generation;
    options.lease.assertActive(generation);
    let document: SettingsDocument;
    try {
      document = parseSettingsDocument(
        await readFile(join(options.lease.paths.dataRoot, "settings.json"), "utf8"),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      document = decodeSettingsDocument({});
    }
    options.lease.assertActive(generation);
    return new SettingsAuthority(options, document);
  }

  readSettings(): SharedSettings {
    this.assertReadable();
    return structuredClone(this.document.settings);
  }

  snapshot(subjects = allSettingsSubjects(this.document.settings)): SettingsSnapshot {
    this.assertReadable();
    return {
      authorityId: this.authorityId,
      settings: structuredClone(this.document.settings),
      revisions: Object.fromEntries(
        subjects.map((subject) => [
          settingsSubjectId(subject),
          settingsSubjectState(this.document.settings, subject).revision,
        ]),
      ),
    };
  }

  /** The trusted adapter supplies authorization; it is never accepted from a serialized request. */
  async mutate(
    input: unknown,
    authorize: SettingsMutationAuthorizer,
  ): Promise<SettingsMutationResult> {
    if (this.closing) throw new Error("Settings authority is closing.");
    const request = settingsMutationSchema.parse(input);
    const result = this.pending.then(async (): Promise<SettingsMutationResult> => {
      this.assertLease();
      const subjects = request.edits.map((edit) => edit.subject);
      assertIndependentSettingsSubjects(subjects);
      const current = subjects.map((subject) =>
        settingsSubjectState(this.document.settings, subject),
      );
      const raw = structuredClone(this.document.raw);
      for (const edit of request.edits) {
        replaceSettingsSubject(
          raw,
          edit.subject,
          edit.operation === "delete" ? undefined : edit.value,
        );
      }
      const candidate = decodeSettingsDocument(raw);
      for (const edit of request.edits) {
        if (edit.operation === "delete") continue;
        const parsed = getSettingsSubjectValue(candidate.settings, edit.subject);
        assertKnownSettingsValue(edit.value, parsed);
        const field = settingsSubjectField(edit.subject);
        replaceSettingsSubject(
          raw,
          edit.subject,
          preserveUnknownSettingsValues(
            getSettingsSubjectValue(this.document.raw, edit.subject),
            getSettingsSubjectValue(this.document.settings, edit.subject),
            parsed,
            edit.subject.kind === "field" &&
              (SETTINGS_LIST_FIELDS as readonly string[]).includes(field)
              ? (field as (typeof SETTINGS_LIST_FIELDS)[number])
              : undefined,
          ),
        );
      }
      const next = decodeSettingsDocument(raw);
      assertOnlyDeclaredSettingsSubjectsChanged(this.document.settings, next.settings, subjects);
      // Give validators copies so a callback cannot mutate the committed cache.
      if (
        !authorize(
          structuredClone(request.edits),
          structuredClone(this.document.settings),
          structuredClone(next.settings),
        )
      ) {
        throw new Error("Settings mutation is not authorized.");
      }
      // Conflicts contain current values, so authorize before revealing them.
      if (request.authorityId !== this.authorityId)
        return {
          status: "conflict",
          authorityId: this.authorityId,
          reason: "authority-changed",
          current,
        };
      if (current.some((state, index) => state.revision !== request.edits[index]!.expectedRevision))
        return {
          status: "conflict",
          authorityId: this.authorityId,
          reason: "revision-changed",
          current,
        };
      assertSettingsCredentialPersistence(
        this.document.settings,
        next.settings,
        this.options.assertPersistentCredentials,
      );
      next.raw[SETTINGS_DOCUMENT_VERSION_KEY] = SETTINGS_DOCUMENT_VERSION;
      await persistSettingsDocument(this.settingsPath, `${JSON.stringify(next.raw, null, 2)}\n`, {
        assertActive: () => this.assertLease(),
        committed: () => {
          this.document = next;
        },
        ...(this.options.reportError ? { reportError: this.options.reportError } : {}),
      });
      const committed: SettingsMutationResult = {
        status: "committed",
        authorityId: this.authorityId,
        changes: subjects.map((subject) => settingsSubjectState(this.document.settings, subject)),
      };
      try {
        this.options.onCommitted?.(
          structuredClone(committed),
          structuredClone(this.document.settings),
        );
      } catch (error) {
        reportSettingsError(error, this.options.reportError);
      }
      return committed;
    });
    // Rejections belong to the requester; a failed write does not poison the next transaction.
    this.pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async close(): Promise<void> {
    this.closing = true;
    await this.pending;
  }

  private assertLease(): void {
    this.options.lease.assertActive(this.generation);
  }
  private assertReadable(): void {
    if (this.closing) throw new Error("Settings authority is closing.");
    this.assertLease();
  }
}
