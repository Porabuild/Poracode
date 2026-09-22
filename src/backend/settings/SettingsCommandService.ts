import { z } from "zod";
import {
  applyAgentSecretSetting,
  applyCreateProfile,
  applyProfileEnvironment,
} from "@/host/sharedSettingsFile";
import { agentProfileDriver, isAgentProfileDriver } from "@/shared/contracts/agentProfiles";
import { isSensitiveAgentSetting } from "@/shared/agentSecrets";
import type { AgentInstanceEnvVar } from "@/shared/contracts";
import {
  removeCrossagentRoutingOverride,
  removeCrossagentSelectionUsageEntry,
  retagCrossagentSelectionUsageEntry,
} from "@/shared/crossagentRanking";
import { settingsProcedures } from "@/shared/ipc/procedures/settings";
import { isEncryptedSecret } from "@/shared/secretFormat";
import type { SharedSettings } from "@/shared/settings";
import {
  SETTINGS_TRANSACTION_VERSION,
  settingsRevisionSchema,
  settingsSubjectField,
  settingsSubjectId,
  settingsSubjectSchema,
  type SettingsEdit,
  type SettingsMutationResult,
  type SettingsSubject,
} from "@/shared/settingsTransactions";
import type { HostCredentialCapabilities } from "../ownership/hostCredentialState";
import type { SettingsAuthority } from "./SettingsAuthority";
import {
  authorizeSettingsCommandSubjects,
  authorizeSettingsPreferences,
} from "./settingsAccessPolicy";
import { getSettingsSubjectValue, settingsSubjectState } from "./settingsSubjects";

const expectationSchema = z.strictObject({
  authorityId: z.string().uuid(),
  expectedRevision: settingsRevisionSchema,
});
/** Internal adapter input until the coordinated IPC/remote/native activation. */
export type SettingsCommandExpectation = z.infer<typeof expectationSchema>;

/** Adapter for existing preference and credential commands. The composition owns
 * one authority and drains it after every admitted command has settled. */
export class SettingsCommandService {
  constructor(
    private readonly authority: SettingsAuthority,
    private readonly credentials: Pick<HostCredentialCapabilities, "assertCanPersistSecrets">,
  ) {}

  getSnapshot() {
    return this.authority.snapshot();
  }

  mutateSettings(input: unknown): Promise<SettingsMutationResult> {
    return this.authority.mutate(input, authorizeSettingsPreferences);
  }

  async setAgentSecretSetting(
    input: unknown,
    expectation: SettingsCommandExpectation,
  ): Promise<SettingsMutationResult> {
    const payload = settingsProcedures.setAgentSecretSetting.payloadSchema.parse(input);
    if (!isSensitiveAgentSetting(payload.agentKind, payload.key))
      throw new Error("Unsupported sensitive agent setting.");
    const subject = {
      kind: "agent-setting",
      agentKind: payload.agentKind,
      key: payload.key,
    } as const;
    return this.commit(subject, expectation, (settings) => {
      const value = payload.value.trim();
      if (value && !isEncryptedSecret(value)) this.credentials.assertCanPersistSecrets();
      return getSettingsSubjectValue(
        applyAgentSecretSetting(settings, payload, "").settings,
        subject,
      );
    });
  }

  async setProfileEnvironment(
    input: unknown,
    expectation: SettingsCommandExpectation,
  ): Promise<SettingsMutationResult> {
    const payload = settingsProcedures.setProfileEnvironment.payloadSchema.parse(input);
    const subject = { kind: "entry", field: "agentInstances", key: payload.instanceId } as const;
    return this.commit(
      subject,
      expectation,
      (settings) => {
        const instance = settings.agentInstances[payload.instanceId];
        if (instance) this.assertCanSealEnvironment(instance.driver, payload.environment);
        return applyProfileEnvironment(settings, payload, "").instance;
      },
      (settings) => {
        const instance = settings.agentInstances[payload.instanceId];
        if (instance && !isAgentProfileDriver(instance.driver))
          throw new Error("Agent instance does not support profile environments.");
      },
    );
  }

  async createProfile(
    input: unknown,
    expectation: SettingsCommandExpectation,
  ): Promise<SettingsMutationResult> {
    const payload = settingsProcedures.createProfile.payloadSchema.parse(input);
    if (!isAgentProfileDriver(payload.driver)) throw new Error("Driver does not support profiles.");
    const subject = { kind: "entry", field: "agentInstances", key: payload.id } as const;
    return this.commit(subject, expectation, (settings) => {
      this.assertCanSealEnvironment(payload.driver, payload.environment ?? {});
      return applyCreateProfile(settings, payload, "").instance;
    });
  }

  /** Owner-managed learned-routing records. Ordinary preference intent cannot
   * write these fields (`authorizeSettingsPreferences` refuses them), so the
   * explicit commands are the only renderer path and are authorized by subject. */
  async removeCrossagentRoutingOverride(
    input: unknown,
    expectation: SettingsCommandExpectation,
  ): Promise<SettingsMutationResult> {
    const payload = settingsProcedures.removeCrossagentRoutingOverride.payloadSchema.parse(input);
    return this.commit(
      { kind: "field", field: "crossagentRoutingOverrides" },
      expectation,
      (settings) =>
        removeCrossagentRoutingOverride(settings.crossagentRoutingOverrides, payload.tags),
    );
  }

  async removeCrossagentMemoryEntry(
    input: unknown,
    expectation: SettingsCommandExpectation,
  ): Promise<SettingsMutationResult> {
    const payload = settingsProcedures.removeCrossagentMemoryEntry.payloadSchema.parse(input);
    return this.commit(
      { kind: "field", field: "crossagentSelectionUsage" },
      expectation,
      (settings) =>
        removeCrossagentSelectionUsageEntry(settings.crossagentSelectionUsage, payload.entry),
    );
  }

  async updateCrossagentMemoryEntryTags(
    input: unknown,
    expectation: SettingsCommandExpectation,
  ): Promise<SettingsMutationResult> {
    const payload = settingsProcedures.updateCrossagentMemoryEntryTags.payloadSchema.parse(input);
    return this.commit(
      { kind: "field", field: "crossagentSelectionUsage" },
      expectation,
      (settings) =>
        retagCrossagentSelectionUsageEntry(
          settings.crossagentSelectionUsage,
          payload.entry,
          payload.tags,
        ),
    );
  }

  private assertCanSealEnvironment(
    driver: string,
    environment: Record<string, AgentInstanceEnvVar>,
  ): void {
    const credential = agentProfileDriver(driver)?.credentialEnvVar;
    for (const [name, variable] of Object.entries(environment))
      if (
        variable.value &&
        (variable.sensitive || name.trim() === credential) &&
        !isEncryptedSecret(variable.value)
      ) {
        // The authority also checks newly classified/replaced ciphertext at
        // commit. This earlier guard prevents producing new ciphertext with a
        // session-only key even when a later CAS would refuse persistence.
        this.credentials.assertCanPersistSecrets();
        return;
      }
  }

  private async commit(
    inputSubject: SettingsSubject,
    inputExpectation: SettingsCommandExpectation,
    value: (settings: SharedSettings) => unknown,
    validateCurrent?: (settings: SharedSettings) => void,
  ): Promise<SettingsMutationResult> {
    const subject = settingsSubjectSchema.parse(inputSubject);
    const expectation = expectationSchema.parse(inputExpectation);
    const snapshot = this.authority.snapshot([
      subject,
      { kind: "field", field: settingsSubjectField(subject) },
    ]);
    validateCurrent?.(snapshot.settings);
    // A stale command returns its current scoped state before sealing or
    // deriving an edit from a profile that another client may have removed.
    if (
      expectation.authorityId !== snapshot.authorityId ||
      expectation.expectedRevision !== snapshot.revisions[settingsSubjectId(subject)]
    )
      return {
        status: "conflict",
        authorityId: snapshot.authorityId,
        sequence: snapshot.sequence,
        reason:
          expectation.authorityId !== snapshot.authorityId
            ? "authority-changed"
            : "revision-changed",
        current: [settingsSubjectState(snapshot.settings, subject)],
        revisions: snapshot.revisions,
      };
    const next = value(snapshot.settings);
    const edit: SettingsEdit = {
      subject,
      expectedRevision: expectation.expectedRevision,
      ...(next === undefined
        ? { operation: "delete" }
        : { operation: "set", value: z.json().parse(next) }),
    };
    return this.authority.mutate(
      {
        version: SETTINGS_TRANSACTION_VERSION,
        authorityId: expectation.authorityId,
        edits: [edit],
      },
      authorizeSettingsCommandSubjects([subject]),
    );
  }
}
