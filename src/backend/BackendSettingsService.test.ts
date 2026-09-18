import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readSharedSettingsFile, writeSharedSettingsFile } from "@/main/sharedSettingsFile";
import { AGENT_PROFILE_DRIVERS } from "@/shared/contracts";
import type { AgentInstanceConfig } from "@/shared/contracts";
import { defaultSharedSettings } from "@/shared/settings";
import type { SupervisorEvent } from "@/shared/ipc";
import {
  configureSecretStorageKey,
  decryptSecret,
  isEncryptedSecret,
} from "@/shared/secretStorage";
import type { SharedSettings } from "@/shared/settings";
import {
  SETTINGS_TRANSACTION_VERSION,
  settingsSubjectId,
  type SettingsEdit,
  type SettingsMutation,
} from "@/shared/settingsTransactions";
import { createBackendSettingsAccess } from "./BackendSettingsService";
import { observeRoutingSettingsEvent } from "./BackendRoutingSettings";

vi.mock("@/shared/agentSecrets", () => ({
  isSensitiveAgentSetting: (agent: string, key: string) =>
    agent === "fixture-agent" && key === "token",
  sensitiveAgentSettingKeys: (agent: string) => (agent === "fixture-agent" ? ["token"] : []),
}));

describe("backend settings authority access", () => {
  let root: string;
  let path: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "backend-settings-"));
    path = join(root, "settings.json");
    configureSecretStorageKey(Buffer.alloc(32, 29).toString("base64"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const secret = { agentKind: "fixture-agent", key: "token", value: "fixture-secret" };

  function access() {
    const onChanged = vi.fn<(settings: SharedSettings) => void>((settings) => {
      expect(readSharedSettingsFile(path)).toEqual(settings);
    });
    const service = {
      ...createBackendSettingsAccess({ settingsPath: () => path, onChanged }),
      onChanged,
    };
    return service;
  }

  function routingOptions(service: ReturnType<typeof access>) {
    return {
      editSettingsField: service.editSettingsField,
      supervisor: { call: vi.fn<(name: string, payload: unknown) => Promise<null>>() } as never,
    };
  }

  const selectionEvent: SupervisorEvent = {
    type: "crossagent-selection-used",
    selections: [
      {
        agentKind: "fixture-agent",
        modelId: "small",
        fast: false,
        tags: ["review"],
        explicitFields: { provider: true, model: true, effort: false, fast: false },
      },
    ],
  };

  it("commits disjoint concurrent writers through one authority without losing either", async () => {
    const service = access();
    try {
      const routing = observeRoutingSettingsEvent(routingOptions(service), selectionEvent);
      expect(routing).toBe(true);
      // A whole-snapshot write from a renderer whose copy predates the routing
      // event must not revert the learned-usage record.
      await service.call("setSharedSettings", {
        ...readSharedSettingsFile(path),
        themeMode: "dark",
      });
      await vi.waitFor(async () => {
        const settings = (await service.call("getSharedSettings", {})) as SharedSettings;
        expect(settings.themeMode).toBe("dark");
        expect(settings.crossagentSelectionUsage).toHaveLength(1);
        expect(settings.crossagentSelectionUsage[0]).toMatchObject({ count: 1, tags: ["review"] });
      });
      // The authority persisted its canonical versioned document.
      expect(JSON.parse(readFileSync(path, "utf8")).$poracodeSettingsVersion).toBe(1);
      expect(readdirSync(root).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    } finally {
      await service.dispose();
    }
  });

  it("keeps sealed settings during a stale renderer replacement and clears them only by command", async () => {
    const service = access();
    try {
      const stale = (await service.call("getSharedSettings", {})) as SharedSettings;
      const { storedValue } = (await service.call("setAgentSecretSetting", secret)) as {
        storedValue: string | null;
      };
      expect(isEncryptedSecret(storedValue!)).toBe(true);
      expect(readFileSync(path, "utf8")).not.toContain(secret.value);

      await service.call("setSharedSettings", { ...stale, themeMode: "dark" });
      expect(
        ((await service.call("getSharedSettings", {})) as SharedSettings).agentSettings[
          secret.agentKind
        ]?.token,
      ).toBe(storedValue);
      expect(await service.call("setAgentSecretSetting", { ...secret, value: "" })).toEqual({
        storedValue: null,
      });
      expect(
        ((await service.call("getSharedSettings", {})) as SharedSettings).agentSettings[
          secret.agentKind
        ]?.token,
      ).toBeUndefined();
    } finally {
      await service.dispose();
    }
  });

  it("seals profile creation and environment edits using the configured host key", async () => {
    const service = access();
    try {
      const descriptor = AGENT_PROFILE_DRIVERS.find((driver) => driver.credentialEnvVar)!;
      const envKey = descriptor.credentialEnvVar!;
      const created = (await service.call("createProfile", {
        driver: descriptor.driver,
        id: "fixture-profile",
        displayName: "Fixture",
        environment: { [envKey]: { value: "first-fixture-secret" } },
      })) as AgentInstanceConfig;
      const first = created.environment![envKey]!.value;
      expect(isEncryptedSecret(first)).toBe(true);
      expect(decryptSecret(root, first)).toBe("first-fixture-secret");
      const updated = (await service.call("setProfileEnvironment", {
        instanceId: created.id,
        environment: { [envKey]: { value: "second-fixture-secret" } },
      })) as AgentInstanceConfig;
      expect(decryptSecret(root, updated.environment![envKey]!.value)).toBe(
        "second-fixture-secret",
      );
      expect(readSharedSettingsFile(path).agentInstances[created.id]).toEqual(updated);
      expect(readFileSync(path, "utf8")).not.toContain("fixture-secret");
    } finally {
      await service.dispose();
    }
  });

  it("does not write or notify when an edit is rejected", async () => {
    const service = access();
    try {
      writeSharedSettingsFile(path, { ...defaultSharedSettings, themeMode: "dark" });
      // An equal snapshot is a committed no-op; a rejected command changes nothing.
      await service.call("setSharedSettings", await service.call("getSharedSettings", {}));
      service.onChanged.mockClear();
      const before = readFileSync(path, "utf8");
      await expect(
        service.call("setAgentSecretSetting", { ...secret, key: "unsupported" }),
      ).rejects.toThrow("Unsupported sensitive agent setting");
      expect(readFileSync(path, "utf8")).toBe(before);
      expect(service.onChanged).not.toHaveBeenCalled();
    } finally {
      await service.dispose();
    }
  });

  it("returns a committed edit even when notification and diagnostic callbacks throw", async () => {
    const notificationError = new Error("Fixture renderer notification unavailable");
    const diagnosticError = new Error("Fixture diagnostic observer unavailable");
    const reportError = vi.fn<(error: unknown) => never>(() => {
      throw diagnosticError;
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const service = createBackendSettingsAccess({
      settingsPath: () => path,
      onChanged: () => {
        throw notificationError;
      },
      reportError,
    });
    try {
      await expect(service.call("setAgentSecretSetting", secret)).resolves.toMatchObject({
        storedValue: expect.any(String),
      });
      expect(
        ((await service.call("getSharedSettings", {})) as SharedSettings).agentSettings[
          secret.agentKind
        ]?.token,
      ).toEqual(expect.any(String));
      await vi.waitFor(() =>
        expect(reportError).toHaveBeenCalledExactlyOnceWith(notificationError),
      );
    } finally {
      warning.mockRestore();
      await service.dispose();
    }
  });

  it("serves the transaction procedures with explicit stale-revision conflicts", async () => {
    const service = access();
    try {
      const snapshot = await service.call("settingsTransactionSnapshot", {});
      expect(snapshot.authorityId).toEqual(expect.any(String));
      expect(snapshot.revisions[settingsSubjectId({ kind: "field", field: "themeMode" })]).toEqual(
        expect.any(String),
      );
      const edit: SettingsEdit = {
        subject: { kind: "field", field: "themeMode" },
        expectedRevision: "missing",
        operation: "set",
        value: "light",
      };
      const stale: SettingsMutation = {
        version: SETTINGS_TRANSACTION_VERSION,
        authorityId: snapshot.authorityId,
        edits: [edit],
      };
      await expect(service.call("settingsTransactionMutate", stale)).resolves.toMatchObject({
        status: "conflict",
        reason: "revision-changed",
      });
      // An unknown authority is refused before any revision comparison.
      await expect(
        service.call("settingsTransactionMutate", { ...stale, authorityId: crypto.randomUUID() }),
      ).resolves.toMatchObject({ status: "conflict", reason: "authority-changed" });
      expect(((await service.call("getSharedSettings", {})) as SharedSettings).themeMode).not.toBe(
        "light",
      );
    } finally {
      await service.dispose();
    }
  });
});
