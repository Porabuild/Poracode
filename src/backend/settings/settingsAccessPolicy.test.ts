import { describe, expect, it } from "vitest";
import { sensitiveAgentSettingKeys } from "@/shared/agentSecrets";
import { AGENT_PROFILE_DRIVERS } from "@/shared/contracts/agentProfiles";
import { defaultSharedSettings, type SharedSettings } from "@/shared/settings";
import type { SettingsEdit, SettingsSubject } from "@/shared/settingsTransactions";
import {
  authorizeSettingsCommandSubjects,
  authorizeSettingsPreferences,
} from "./settingsAccessPolicy";

const profileDriver = AGENT_PROFILE_DRIVERS[0]!.driver;
const profile = {
  id: "work",
  driver: profileDriver,
  environment: { TOKEN: { value: "lc-safe:v1:fixture", sensitive: true } },
};
const profileSubject = { kind: "entry", field: "agentInstances", key: "work" } as const;
function settings(): SharedSettings {
  return {
    ...structuredClone(defaultSharedSettings),
    agentInstances: { work: structuredClone(profile) },
  };
}
function edit(subject: SettingsSubject): SettingsEdit {
  return { subject, expectedRevision: "missing", operation: "delete" };
}

describe("settings access policy", () => {
  it("refuses a driver change that previously bypassed the profile environment guard", () => {
    const previous = settings();
    const next = settings();
    next.agentInstances.work = {
      ...profile,
      driver: "fixture-plugin",
      environment: { TOKEN: { value: "ordinary-replacement", sensitive: false } },
    };
    expect(authorizeSettingsPreferences([edit(profileSubject)], previous, next)).toBe(false);
  });

  it.each([
    "classification",
    "plaintext replacement",
    "environment removal",
    "auth acknowledgement",
  ])("refuses ordinary %s changes on a retained profile", (change) => {
    const previous = settings();
    const next = settings();
    const instance = next.agentInstances.work!;
    if (change === "classification") instance.environment!.TOKEN!.sensitive = false;
    else if (change === "plaintext replacement") instance.environment!.TOKEN!.value = "replacement";
    else if (change === "environment removal") delete instance.environment;
    else instance.authAcknowledged = { native: true };
    expect(authorizeSettingsPreferences([edit(profileSubject)], previous, next)).toBe(false);
  });

  it("allows profile identity/config edits preserving credentials and intentional profile deletion", () => {
    const previous = settings();
    const renamed = settings();
    renamed.agentInstances.work = {
      ...renamed.agentInstances.work!,
      displayName: "Renamed",
      config: { ordinary: true },
    };
    expect(authorizeSettingsPreferences([edit(profileSubject)], previous, renamed)).toBe(true);
    delete renamed.agentInstances.work;
    expect(authorizeSettingsPreferences([edit(profileSubject)], previous, renamed)).toBe(true);
  });

  it("requires the sealing command to create an environment but permits empty profile configuration", () => {
    const previous = settings();
    delete previous.agentInstances.work;
    const next = settings();
    expect(authorizeSettingsPreferences([edit(profileSubject)], previous, next)).toBe(false);
    delete next.agentInstances.work!.environment;
    expect(authorizeSettingsPreferences([edit(profileSubject)], previous, next)).toBe(true);
  });

  it("keeps undeclared instance types owner-managed without naming providers", () => {
    const previous = settings();
    previous.agentInstances.work = {
      id: "work",
      driver: "fixture-plugin",
      environment: { TOKEN: { value: "ordinary" } },
    };
    const next = structuredClone(previous);
    next.agentInstances.work!.environment!.TOKEN!.sensitive = true;
    expect(authorizeSettingsPreferences([edit(profileSubject)], previous, next)).toBe(false);
    delete next.agentInstances.work;
    expect(authorizeSettingsPreferences([edit(profileSubject)], previous, next)).toBe(false);
  });

  it.each([
    "acpRegistryInstalledAgents",
    "acpRegistryAutoInstallOptOuts",
    "agentHookSupport",
    "crossagentSelectionUsage",
    "crossagentRoutingOverrides",
  ] as const)("refuses ordinary %s commands even when their value is unchanged", (field) => {
    const previous = settings();
    expect(authorizeSettingsPreferences([edit({ kind: "field", field })], previous, previous)).toBe(
      false,
    );
  });

  it("protects declared sensitive agent keys through whole-field and machine edits", () => {
    const kind = AGENT_PROFILE_DRIVERS.find(
      ({ driver }) => sensitiveAgentSettingKeys(driver).length > 0,
    )!.driver;
    const key = sensitiveAgentSettingKeys(kind)[0]!;
    const previous = settings();
    previous.agentSettings = { [kind]: { [key]: "lc-safe:v1:fixture", ordinary: true } };
    const next = structuredClone(previous);
    next.agentSettings[kind]![key] = "plaintext";
    expect(
      authorizeSettingsPreferences(
        [edit({ kind: "field", field: "agentSettings" })],
        previous,
        next,
      ),
    ).toBe(false);
    expect(
      authorizeSettingsPreferences(
        [edit({ kind: "agent-setting", agentKind: kind, key })],
        previous,
        previous,
      ),
    ).toBe(false);
    next.agentSettings = structuredClone(previous.agentSettings);
    next.agentSettings[kind]!.ordinary = false;
    expect(
      authorizeSettingsPreferences(
        [edit({ kind: "agent-setting", agentKind: kind, key: "ordinary" })],
        previous,
        next,
      ),
    ).toBe(true);
    next.machineSettings = { fixture: { agentSettings: { [kind]: { [key]: "plaintext" } } } };
    expect(
      authorizeSettingsPreferences(
        [edit({ kind: "field", field: "machineSettings" })],
        previous,
        next,
      ),
    ).toBe(false);
  });

  it("scopes a trusted command to exactly its selected subjects", () => {
    const authorize = authorizeSettingsCommandSubjects([profileSubject]);
    const previous = settings();
    expect(authorize([edit(profileSubject)], previous, previous)).toBe(true);
    expect(authorize([edit({ ...profileSubject, key: "other" })], previous, previous)).toBe(false);
    expect(
      authorize(
        [edit(profileSubject), edit({ kind: "field", field: "themeMode" })],
        previous,
        previous,
      ),
    ).toBe(false);
    expect(authorize([], previous, previous)).toBe(false);
  });
});
