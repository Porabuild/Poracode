import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AGENT_PROFILE_DRIVERS } from "@/shared/contracts/agentProfiles";
import { sensitiveAgentSettingKeys } from "@/shared/agentSecrets";
import { defaultSharedSettings, type SharedSettings } from "@/shared/settings";
import * as secretStorage from "@/shared/secretStorage";
import { settingsSubjectId, type SettingsSubject } from "@/shared/settingsTransactions";
import { HostOwnerController } from "../ownership/HostOwnerController";
import { SettingsAuthority } from "./SettingsAuthority";
import { SettingsCommandService } from "./SettingsCommandService";

const freeEnvironmentDriver = AGENT_PROFILE_DRIVERS.find(
  (entry) => !entry.credentialEnvVar,
)!.driver;
const credentialDriver = AGENT_PROFILE_DRIVERS.find((entry) => entry.credentialEnvVar)!;
const profileSubject = { kind: "entry", field: "agentInstances", key: "work" } as const;
const cleanup: Array<() => Promise<void>> = [];

async function fixture(mode: "headless" | "session-only" = "headless") {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-settings-command-")));
  const owner = HostOwnerController.acquire(join(root, "profile"), "headless");
  const runtime = await owner.initialize({ mode });
  secretStorage.configureSecretStorageKey(runtime.secretStorageKey);
  const settings: SharedSettings = {
    ...structuredClone(defaultSharedSettings),
    agentInstances: {
      work: {
        id: "work",
        driver: freeEnvironmentDriver,
        displayName: "Work",
        environment: {
          TOKEN: { value: secretStorage.encryptSecret("", "original"), sensitive: true },
        },
      },
    },
  };
  writeFileSync(runtime.paths.settingsPath, JSON.stringify(settings));
  const assertCanPersistSecrets = vi.fn<() => void>(() =>
    runtime.credentialCapabilities.assertCanPersistSecrets(),
  );
  const authority = await SettingsAuthority.open({
    lease: runtime.lease,
    assertPersistentCredentials: assertCanPersistSecrets,
  });
  const service = new SettingsCommandService(authority, { assertCanPersistSecrets });
  cleanup.push(async () => {
    await authority.close();
    await owner.close();
    rmSync(root, { recursive: true, force: true });
  });
  function expected(subject: SettingsSubject = profileSubject) {
    const snapshot = authority.snapshot([subject]);
    return {
      authorityId: snapshot.authorityId,
      expectedRevision: snapshot.revisions[settingsSubjectId(subject)]!,
    };
  }
  function mutation(subject: SettingsSubject, value: unknown) {
    const expectation = expected(subject);
    return {
      version: 1,
      authorityId: expectation.authorityId,
      edits: [
        {
          subject,
          expectedRevision: expectation.expectedRevision,
          ...(value === undefined ? { operation: "delete" } : { operation: "set", value }),
        },
      ],
    };
  }
  const bytes = () => readFileSync(runtime.paths.settingsPath, "utf8");
  return { authority, service, settings, expected, mutation, bytes, assertCanPersistSecrets };
}

afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
  vi.restoreAllMocks();
});

describe("settings command service", () => {
  it("refuses the former driver/classification bypass without writing any bytes", async () => {
    const test = await fixture();
    const before = test.bytes();
    await expect(
      test.service.mutateSettings(
        test.mutation(profileSubject, {
          ...test.settings.agentInstances.work,
          driver: "fixture-plugin",
          environment: { TOKEN: { value: "ordinary-replacement", sensitive: false } },
        }),
      ),
    ).rejects.toThrow("not authorized");
    expect(test.bytes()).toBe(before);
    expect(test.authority.snapshot().sequence).toBe(0);
  });

  it("preserves credentials during a profile rename and permits intentional profile deletion", async () => {
    const test = await fixture();
    const instance = { ...test.settings.agentInstances.work!, displayName: "Renamed" };
    await expect(
      test.service.mutateSettings(test.mutation(profileSubject, instance)),
    ).resolves.toMatchObject({ status: "committed", sequence: 1 });
    expect(test.authority.readSettings().agentInstances.work!.environment).toEqual(
      instance.environment,
    );
    await expect(
      test.service.mutateSettings(test.mutation(profileSubject, undefined)),
    ).resolves.toMatchObject({ status: "committed", sequence: 2 });
    expect(test.authority.readSettings().agentInstances.work).toBeUndefined();
  });

  it("returns an explicit stale command conflict before sealing or changing current state", async () => {
    const test = await fixture();
    const expectation = test.expected();
    await test.service.mutateSettings(
      test.mutation(profileSubject, {
        ...test.settings.agentInstances.work,
        displayName: "Other client",
      }),
    );
    const before = test.bytes();
    const encrypt = vi.spyOn(secretStorage, "encryptSecret");
    await expect(
      test.service.setProfileEnvironment(
        {
          instanceId: "work",
          environment: { TOKEN: { value: "stale replacement", sensitive: true } },
        },
        expectation,
      ),
    ).resolves.toMatchObject({ status: "conflict", reason: "revision-changed", sequence: 1 });
    expect(test.assertCanPersistSecrets).not.toHaveBeenCalled();
    expect(encrypt).not.toHaveBeenCalled();
    expect(test.bytes()).toBe(before);
  });

  it("atomically refuses one of two concurrent changes to the same profile without automatic reapply", async () => {
    const test = await fixture();
    const expectation = test.expected();
    const change = (value: string) =>
      test.service.setProfileEnvironment(
        { instanceId: "work", environment: { TOKEN: { value, sensitive: true } } },
        expectation,
      );
    const results = await Promise.all([change("first"), change("second")]);
    expect(results.map((result) => result.status)).toEqual(["committed", "conflict"]);
    expect(test.authority.snapshot().sequence).toBe(1);
    expect(
      secretStorage.decryptSecret(
        "",
        test.authority.readSettings().agentInstances.work!.environment!.TOKEN!.value,
      ),
    ).toBe("first");
  });

  it("commits disjoint preference and credential intent from the same snapshot", async () => {
    const test = await fixture();
    const theme = test.mutation({ kind: "field", field: "themeMode" }, "light");
    const secret = test.service.setProfileEnvironment(
      { instanceId: "work", environment: { TOKEN: { value: "new secret", sensitive: true } } },
      test.expected(),
    );
    const results = await Promise.all([secret, test.service.mutateSettings(theme)]);
    expect(results.every((result) => result.status === "committed")).toBe(true);
    expect(test.authority.readSettings().themeMode).toBe("light");
    expect(test.authority.snapshot().sequence).toBe(2);
  });

  it("rejects new session-only ciphertext before invoking the sealing helper", async () => {
    const test = await fixture("session-only");
    const encrypt = vi.spyOn(secretStorage, "encryptSecret");
    const before = test.bytes();
    await expect(
      test.service.setProfileEnvironment(
        {
          instanceId: "work",
          environment: { TOKEN: { value: "unrecoverable next launch", sensitive: true } },
        },
        test.expected(),
      ),
    ).rejects.toThrow("session-only");
    expect(encrypt).not.toHaveBeenCalled();
    expect(test.bytes()).toBe(before);
  });

  it("preserves unchanged ciphertext in session-only mode without requiring a persistent key", async () => {
    const test = await fixture("session-only");
    const environment = test.settings.agentInstances.work!.environment!;
    await expect(
      test.service.setProfileEnvironment({ instanceId: "work", environment }, test.expected()),
    ).resolves.toMatchObject({ status: "committed" });
    expect(test.assertCanPersistSecrets).not.toHaveBeenCalled();
    expect(test.authority.readSettings().agentInstances.work!.environment).toEqual(environment);
  });

  it.each(["headless", "session-only"] as const)(
    "requires persistent custody when the same ordinary value becomes sensitive (%s)",
    async (mode) => {
      const test = await fixture(mode);
      await test.service.setProfileEnvironment(
        { instanceId: "work", environment: { TOKEN: { value: "same value", sensitive: false } } },
        test.expected(),
      );
      const before = test.bytes();
      const markingSensitive = test.service.setProfileEnvironment(
        { instanceId: "work", environment: { TOKEN: { value: "same value", sensitive: true } } },
        test.expected(),
      );
      const outcome = await markingSensitive.then(
        (result) => ({ status: result.status, error: null }),
        (error: unknown) => ({ status: "rejected", error: String(error) }),
      );
      const variable = test.authority.readSettings().agentInstances.work!.environment!.TOKEN!;
      expect(outcome.status).toBe(mode === "session-only" ? "rejected" : "committed");
      expect(outcome.error?.includes("session-only") ?? false).toBe(mode === "session-only");
      expect(test.bytes() === before).toBe(mode === "session-only");
      expect(variable.sensitive).toBe(mode === "session-only" ? undefined : true);
      expect(secretStorage.isEncryptedSecret(variable.value)).toBe(mode === "headless");
      expect(secretStorage.decryptSecret("", variable.value)).toBe("same value");
    },
  );

  it("does not substitute a current revision when command expectations are absent", async () => {
    const test = await fixture();
    const before = test.bytes();
    await expect(
      test.service.setProfileEnvironment(
        { instanceId: "work", environment: { TOKEN: { value: "unchecked", sensitive: true } } },
        undefined as never,
      ),
    ).rejects.toThrow("Invalid input");
    expect(test.assertCanPersistSecrets).not.toHaveBeenCalled();
    expect(test.bytes()).toBe(before);
  });

  it.each(["delete", "store as plain text"])(
    "allows an explicit %s command without creating durable ciphertext",
    async (action) => {
      const test = await fixture("session-only");
      const environment =
        action === "delete" ? {} : { TOKEN: { value: "intentional plaintext", sensitive: false } };
      await expect(
        test.service.setProfileEnvironment({ instanceId: "work", environment }, test.expected()),
      ).resolves.toMatchObject({ status: "committed" });
      expect(test.assertCanPersistSecrets).not.toHaveBeenCalled();
      expect(test.authority.readSettings().agentInstances.work!.environment).toEqual(
        action === "delete" ? undefined : { TOKEN: { value: "intentional plaintext" } },
      );
    },
  );

  it("uses declared credential slots to seal a newly created profile in one commit", async () => {
    const test = await fixture();
    const subject = { ...profileSubject, key: "second" };
    const result = await test.service.createProfile(
      {
        id: "second",
        driver: credentialDriver.driver,
        displayName: "Second",
        environment: {
          [credentialDriver.credentialEnvVar!]: { value: "credential", sensitive: false },
        },
      },
      test.expected(subject),
    );
    expect(result).toMatchObject({ status: "committed", sequence: 1 });
    const variable =
      test.authority.readSettings().agentInstances.second!.environment![
        credentialDriver.credentialEnvVar!
      ]!;
    expect(variable.sensitive).toBe(true);
    expect(secretStorage.decryptSecret("", variable.value)).toBe("credential");
    expect(test.bytes()).not.toContain('"value": "credential"');
    await expect(
      test.service.createProfile(
        { id: "second", driver: credentialDriver.driver, displayName: "Duplicate" },
        { authorityId: test.authority.authorityId, expectedRevision: "missing" },
      ),
    ).resolves.toMatchObject({ status: "conflict", reason: "revision-changed" });
  });

  it("seals and clears only the declared global sensitive key", async () => {
    const test = await fixture();
    const agentKind = AGENT_PROFILE_DRIVERS.find(
      ({ driver }) => sensitiveAgentSettingKeys(driver).length > 0,
    )!.driver;
    const key = sensitiveAgentSettingKeys(agentKind)[0]!;
    const subject = { kind: "agent-setting", agentKind, key } as const;
    await expect(
      test.service.setAgentSecretSetting(
        { agentKind, key, value: "global credential" },
        test.expected(subject),
      ),
    ).resolves.toMatchObject({ status: "committed" });
    const sealed = test.authority.readSettings().agentSettings[agentKind]![key] as string;
    expect(secretStorage.decryptSecret("", sealed)).toBe("global credential");
    await expect(
      test.service.setAgentSecretSetting({ agentKind, key, value: "  " }, test.expected(subject)),
    ).resolves.toMatchObject({ status: "committed" });
    expect(test.authority.readSettings().agentSettings[agentKind]?.[key]).toBeUndefined();
    await expect(
      test.service.setAgentSecretSetting(
        { agentKind, key: "ordinary", value: "not a secret" },
        test.expected({ ...subject, key: "ordinary" }),
      ),
    ).rejects.toThrow("Unsupported sensitive");
  });

  it("returns a conflict for a concurrently deleted profile and rejects commands after authority close", async () => {
    const test = await fixture();
    const expectation = test.expected();
    await test.service.mutateSettings(test.mutation(profileSubject, undefined));
    await expect(
      test.service.setProfileEnvironment({ instanceId: "work", environment: {} }, expectation),
    ).resolves.toMatchObject({
      status: "conflict",
      current: [{ subject: profileSubject, revision: "missing" }],
    });
    await test.authority.close();
    await expect(
      test.service.setProfileEnvironment({ instanceId: "work", environment: {} }, expectation),
    ).rejects.toThrow("closing");
  });

  it("commits owner-managed routing fields only through the explicit subject commands", async () => {
    const test = await fixture();
    const overrides = [
      { tags: ["review"], agentKind: "fixture-agent", modelId: "small", updatedAt: 1 },
    ];
    await test.authority.mutate(
      test.mutation({ kind: "field", field: "crossagentRoutingOverrides" }, overrides),
      // The seed mimics the trusted internal writer that owns these records.
      () => true,
    );
    // Ordinary preference intent cannot claim these fields.
    await expect(
      test.service.mutateSettings(
        test.mutation({ kind: "field", field: "crossagentSelectionUsage" }, []),
      ),
    ).rejects.toThrow("not authorized");

    const overridesSubject = { kind: "field", field: "crossagentRoutingOverrides" } as const;
    const stale = test.expected(overridesSubject);
    await expect(
      test.service.removeCrossagentRoutingOverride({ tags: ["review"] }, stale),
    ).resolves.toMatchObject({ status: "committed", changes: [{ value: [] }] });
    expect(test.authority.readSettings().crossagentRoutingOverrides).toEqual([]);

    // A stale command against the owner-managed field conflicts explicitly.
    // Revisions hash content, so the reseeded record must differ to be a
    // genuine successor state.
    await test.authority.mutate(
      test.mutation(overridesSubject, [{ ...overrides[0]!, updatedAt: 2 }]),
      () => true,
    );
    await expect(
      test.service.removeCrossagentRoutingOverride({ tags: ["review"] }, stale),
    ).resolves.toMatchObject({ status: "conflict", reason: "revision-changed" });

    const usageSubject = { kind: "field", field: "crossagentSelectionUsage" } as const;
    await expect(
      test.service.removeCrossagentMemoryEntry(
        {
          entry: {
            agentKind: "fixture-agent",
            modelId: "small",
            fast: false,
            tags: ["review"],
          },
        },
        test.expected(usageSubject),
      ),
    ).resolves.toMatchObject({ status: "committed" });
    await expect(
      test.service.updateCrossagentMemoryEntryTags(
        {
          entry: {
            agentKind: "fixture-agent",
            modelId: "small",
            fast: false,
            tags: ["review"],
          },
          tags: ["ship"],
        },
        test.expected(usageSubject),
      ),
    ).resolves.toMatchObject({ status: "committed" });
  });
});
