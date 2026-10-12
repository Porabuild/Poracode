import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readSharedSettingsFile, writeSharedSettingsFile } from "@/host/sharedSettingsFile";
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
import * as persistence from "./settings/persistSettingsDocument";
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

  function admission() {
    const custody = {
      paths: { dataRoot: root },
      generation: "fixture",
      assertActive: vi.fn<() => void>(),
    };
    return {
      lease: () => custody,
      // Unit dependency only; no SQLite preparation claim.
      assertPreparedDatabaseForWrite: vi.fn<() => void>(),
    };
  }

  function access() {
    const onChanged = vi.fn<(settings: SharedSettings) => void>((settings) => {
      expect(readSharedSettingsFile(path)).toEqual(settings);
    });
    const service = {
      ...createBackendSettingsAccess({ settingsPath: () => path, onChanged, ...admission() }),
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
      expect(JSON.parse(readFileSync(path, "utf8")).$poracodeSettingsVersion).toBe(2);
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
      ...admission(),
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

  it("refuses a settings path outside its explicit leased root", async () => {
    const service = createBackendSettingsAccess({
      ...admission(),
      settingsPath: () => join(root, "foreign.json"),
      onChanged: () => {},
    });
    await expect(service.call("getSharedSettings", {})).rejects.toThrow("leased data root");
    await service.dispose();
    expect(readdirSync(root)).toEqual([]);
  });

  it.each(["lease", "database"])("forwards live %s refusal without writing", async (kind) => {
    const guards = admission();
    const onChanged = vi.fn<() => void>();
    const service = createBackendSettingsAccess({ ...guards, settingsPath: () => path, onChanged });
    await service.call("getSharedSettings", {});
    const guard =
      kind === "lease" ? guards.lease().assertActive : guards.assertPreparedDatabaseForWrite;
    guard.mockImplementation(() => {
      throw new Error("fixture admission lost");
    });
    await expect(service.editSettingsField("themeMode", () => "light")).rejects.toThrow(
      "fixture admission lost",
    );
    expect(readdirSync(root)).toEqual([]);
    expect(onChanged).not.toHaveBeenCalled();
    await service.dispose();
  });

  it("drains already queued mutations when disposed and rejects new calls", async () => {
    const service = access();
    const ready = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const actual = persistence.persistSettingsDocument;
    const persist = vi
      .spyOn(persistence, "persistSettingsDocument")
      .mockImplementationOnce(async (...args) => {
        ready.resolve();
        await release.promise;
        await actual(...args);
      });
    try {
      const first = service.editSettingsField("themeMode", () => "light");
      await ready.promise;
      const queued = service.editSettingsField("guiChatFontSize", () => 18);
      // Let the wrapper enqueue the second mutation before closing admission.
      await Promise.resolve();
      const closing = service.dispose();
      await expect(service.call("getSharedSettings", {})).rejects.toThrow("closed");
      release.resolve();
      await expect(first).resolves.toMatchObject({ status: "committed", sequence: 1 });
      await expect(queued).resolves.toMatchObject({ status: "committed", sequence: 2 });
      await closing;
      expect(readSharedSettingsFile(path)).toMatchObject({
        themeMode: "light",
        guiChatFontSize: 18,
      });
    } finally {
      release.resolve();
      await service.dispose();
      persist.mockRestore();
    }
  });

  it("obtains and captures custody only when the authority first opens", async () => {
    const guards = admission();
    const lease = vi.fn<typeof guards.lease>(guards.lease);
    const service = createBackendSettingsAccess({
      ...guards,
      lease,
      settingsPath: () => path,
      onChanged: () => {},
    });
    expect(lease).not.toHaveBeenCalled();
    await service.call("getSharedSettings", {});
    await service.editSettingsField("themeMode", () => "light");
    expect(lease).toHaveBeenCalledOnce();
    await service.dispose();
  });

  it("fails closed when lazy custody acquisition refuses", async () => {
    const service = createBackendSettingsAccess({
      ...admission(),
      lease: () => {
        throw new Error("fixture custody unavailable");
      },
      settingsPath: () => path,
      onChanged: () => {},
    });
    await expect(service.call("getSharedSettings", {})).rejects.toThrow(
      "fixture custody unavailable",
    );
    await service.dispose();
    expect(readdirSync(root)).toEqual([]);
  });
});
