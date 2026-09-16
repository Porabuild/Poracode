import { z } from "zod";
import { mergeManagedSharedSettings } from "@/main/sharedSettingsFile";
import type { SharedSettings, SharedSettingsInput } from "@/shared/settings";
import {
  SETTINGS_TRANSACTION_VERSION,
  settingsSubjectId,
  type SettingsEdit,
  type SettingsMutationResult,
  type SettingsSubject,
} from "@/shared/settingsTransactions";
import { canonicalSettingsJson } from "./settingsSubjects";
import type { SettingsAuthority } from "./SettingsAuthority";
import {
  authorizeSettingsCommandSubjects,
  authorizeSettingsPreferences,
} from "./settingsAccessPolicy";

/**
 * A trusted write that the settings authority refused after its bounded rebase.
 * `kind` separates the two refusal classes transport mapping cares about: a
 * concurrent-writer conflict (409) and an admission overload (429).
 */
export class SettingsWriteRefusedError extends Error {
  constructor(
    readonly kind: "conflict" | "overloaded",
    message: string,
  ) {
    super(message);
    this.name = "SettingsWriteRefusedError";
  }
}

/**
 * Bounded rebase for trusted adapter writes. A conflict against a *different*
 * authority or an admission refusal is returned immediately; only a
 * revision-changed race (another writer committed between the fresh snapshot
 * and the queued commit) is recomputed from the new committed state.
 */
export const SETTINGS_WRITE_REBASE_ATTEMPTS = 4 as const;

/** Run one trusted write intent, rebasing bounded times onto fresher commits. */
export async function withSettingsRebase(
  run: () => Promise<SettingsMutationResult>,
): Promise<SettingsMutationResult> {
  let result = await run();
  for (let attempt = 1; attempt < SETTINGS_WRITE_REBASE_ATTEMPTS; attempt += 1) {
    if (result.status !== "conflict" || result.reason !== "revision-changed") return result;
    result = await run();
  }
  return result;
}

/**
 * Adapter-side writers that route whole-snapshot and single-field intents
 * through the authority's compare-and-swap. Unlike the client-facing
 * `settingsTransactionMutate` procedure, these run beside the authority and may
 * rebase: the intent (a full snapshot or a recomputed field value) is derived
 * again from the freshest committed state, so concurrent edits to *untouched*
 * subjects survive — but a racing write to the same subject still loses after
 * the bounded attempts instead of silently overwriting it whole-document.
 */
export class SettingsCompatWriter {
  constructor(private readonly authority: SettingsAuthority) {}

  /**
   * Compat translation of a whole-settings write (renderer `setSharedSettings`
   * flush, app-controls `update_settings`). Protected subjects are pinned to
   * the committed state exactly like the former `mergeManagedSharedSettings`
   * file merge, so a stale snapshot can neither clobber secrets, owner-managed
   * records, nor concurrent edits to fields it did not change.
   */
  async commitCompatSnapshot(incoming: SharedSettingsInput): Promise<SharedSettings> {
    const result = await withSettingsRebase(() => this.attemptCompatSnapshot(incoming));
    if (result.status === "committed") return this.authority.readSettings();
    return this.uncommitted("settings snapshot", result);
  }

  /**
   * Compat translation of a partial patch (remote `POST /api/settings`). Only
   * keys present in the patch can produce edits: the base is the committed
   * state, so a patch never reverts concurrent changes to other fields.
   */
  async commitCompatPatch(patch: {
    [K in keyof SharedSettings]?: SharedSettings[K] | undefined;
  }): Promise<SharedSettings> {
    const result = await withSettingsRebase(() => this.attemptCompatPatch(patch));
    if (result.status === "committed") return this.authority.readSettings();
    return this.uncommitted("settings patch", result);
  }

  /**
   * Trusted internal edit of one whole field (owner-managed routing records,
   * MCP servers). `compute` derives the next value from the freshest committed
   * state, so a revision race re-derives instead of clobbering. Authorized by
   * subject, not by the preference policy: these fields are exactly the ones
   * ordinary settings intent may not touch.
   */
  async editSettingsField<F extends keyof SharedSettings>(
    field: F,
    compute: (current: SharedSettings) => SharedSettings[F] | undefined,
  ): Promise<SettingsMutationResult> {
    const subject: SettingsSubject = { kind: "field", field };
    const result = await withSettingsRebase(() => this.attemptFieldEdit(subject, compute));
    return result;
  }

  private async attemptCompatSnapshot(
    incoming: SharedSettingsInput,
  ): Promise<SettingsMutationResult> {
    const snapshot = this.authority.snapshot();
    // The merge pins protected subjects to the committed values, so the field
    // diff below can never emit an edit for them.
    const merged = mergeManagedSharedSettings(snapshot.settings, incoming);
    return this.commitFieldDiffs(snapshot, snapshot.settings, merged);
  }

  private async attemptCompatPatch(patch: {
    [K in keyof SharedSettings]?: SharedSettings[K] | undefined;
  }): Promise<SettingsMutationResult> {
    const snapshot = this.authority.snapshot();
    const incoming: Record<string, unknown> = { ...snapshot.settings };
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) incoming[key] = value;
    }
    const merged = mergeManagedSharedSettings(snapshot.settings, incoming as SharedSettingsInput);
    return this.commitFieldDiffs(snapshot, snapshot.settings, merged);
  }

  private async attemptFieldEdit<F extends keyof SharedSettings>(
    subject: SettingsSubject & { kind: "field"; field: F },
    compute: (current: SharedSettings) => SharedSettings[F] | undefined,
  ): Promise<SettingsMutationResult> {
    const snapshot = this.authority.snapshot([subject]);
    const value = compute(snapshot.settings);
    return this.authority.mutate(
      {
        version: SETTINGS_TRANSACTION_VERSION,
        authorityId: snapshot.authorityId,
        edits: [this.fieldEdit(subject, snapshot, value)],
      },
      authorizeSettingsCommandSubjects([subject]),
    );
  }

  private async commitFieldDiffs(
    snapshot: ReturnType<SettingsAuthority["snapshot"]>,
    current: SharedSettings,
    next: SharedSettings,
  ): Promise<SettingsMutationResult> {
    const edits = Object.keys(next)
      .map((field) => ({ kind: "field", field }) as SettingsSubject & { kind: "field" })
      .filter(
        (subject) =>
          canonicalSettingsJson(current[subject.field]) !==
          canonicalSettingsJson(next[subject.field]),
      )
      .map((subject) => this.fieldEdit(subject, snapshot, next[subject.field]));
    if (edits.length === 0) {
      // An equal snapshot is a committed no-op: the caller's state is already
      // authoritative and no document bytes change.
      return {
        status: "committed",
        authorityId: snapshot.authorityId,
        sequence: snapshot.sequence,
        changes: [],
        revisions: {},
      };
    }
    return this.authority.mutate(
      {
        version: SETTINGS_TRANSACTION_VERSION,
        authorityId: snapshot.authorityId,
        edits,
      },
      authorizeSettingsPreferences,
    );
  }

  private fieldEdit(
    subject: SettingsSubject & { kind: "field" },
    snapshot: ReturnType<SettingsAuthority["snapshot"]>,
    value: unknown,
  ): SettingsEdit {
    const expectedRevision = snapshot.revisions[settingsSubjectId(subject)]!;
    if (value === undefined) return { subject, expectedRevision, operation: "delete" };
    return { subject, expectedRevision, operation: "set", value: z.json().parse(value) };
  }

  private uncommitted(intent: string, result: SettingsMutationResult): never {
    if (result.status === "conflict")
      throw new SettingsWriteRefusedError(
        "conflict",
        `${intent} conflicted with concurrent changes (${result.reason}) and was not applied.`,
      );
    if (result.status === "overloaded")
      throw new SettingsWriteRefusedError(
        "overloaded",
        `${intent} was refused by the settings authority (${result.reason}); retry later.`,
      );
    throw new Error(`${intent} was not applied by the settings authority.`);
  }
}
