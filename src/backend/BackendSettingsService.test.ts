import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  patchSharedSettingsFile,
  readSharedSettingsFile,
  writeSharedSettingsFile,
} from "@/main/sharedSettingsFile";
import { AGENT_PROFILE_DRIVERS } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import {
  configureSecretStorageKey,
  decryptSecret,
  isEncryptedSecret,
} from "@/shared/secretStorage";
import type { SharedSettings } from "@/shared/settings";
import { createBackendSettingsHandlers } from "./BackendSettingsService";
import { observeRoutingSettingsEvent } from "./BackendRoutingSettings";

vi.mock("@/shared/agentSecrets", () => ({
  isSensitiveAgentSetting: (agent: string, key: string) =>
    agent === "fixture-agent" && key === "token",
  sensitiveAgentSettingKeys: (agent: string) => (agent === "fixture-agent" ? ["token"] : []),
}));

describe("backend settings commands", () => {
  let root: string;
  let path: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "backend-settings-"));
    path = join(root, "settings.json");
    configureSecretStorageKey(Buffer.alloc(32, 29).toString("base64"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const secret = { agentKind: "fixture-agent", key: "token", value: "fixture-secret" };
  function handlers() {
    const onChanged = vi.fn<(settings: SharedSettings) => void>((settings) => {
      expect(readSharedSettingsFile(path)).toEqual(settings);
    });
    return { ...createBackendSettingsHandlers({ settingsPath: () => path, onChanged }), onChanged };
  }

  it("retains unrelated fields for queued backend commands, remote patches, and routing events", async () => {
    const service = handlers();
    const selection: SupervisorEvent = {
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
    await Promise.all([
      Promise.resolve().then(() => patchSharedSettingsFile(path, { themeMode: "dark" })),
      Promise.resolve().then(() => service.setAgentSecretSetting(secret)),
      Promise.resolve().then(() =>
        observeRoutingSettingsEvent(
          {
            getSharedSettings: () => readSharedSettingsFile(path),
            writeSharedSettings: (settings) => writeSharedSettingsFile(path, settings),
            supervisor: { call: vi.fn<() => Promise<null>>() } as never,
          },
          selection,
        ),
      ),
    ]);

    // A new service reads the persisted result; no process-local cache supplies these values.
    const settings = handlers().getSharedSettings({});
    expect(settings.themeMode).toBe("dark");
    const storedToken = settings.agentSettings[secret.agentKind]?.token;
    expect(typeof storedToken).toBe("string");
    expect(decryptSecret(root, storedToken as string)).toBe(secret.value);
    expect(settings.crossagentSelectionUsage).toHaveLength(1);
    expect(settings.crossagentSelectionUsage[0]).toMatchObject({ count: 1, tags: ["review"] });
    expect(service.onChanged).toHaveBeenCalledOnce();
  });

  it("keeps encrypted settings during a renderer replacement and clears them only by command", () => {
    const service = handlers();
    const stale = service.getSharedSettings({});
    const { storedValue } = service.setAgentSecretSetting(secret);
    expect(isEncryptedSecret(storedValue!)).toBe(true);
    expect(readFileSync(path, "utf8")).not.toContain(secret.value);

    service.setSharedSettings({ ...stale, themeMode: "dark" });
    expect(service.getSharedSettings({}).agentSettings[secret.agentKind]?.token).toBe(storedValue);
    expect(service.setAgentSecretSetting({ ...secret, value: "" })).toEqual({ storedValue: null });
    expect(service.getSharedSettings({}).agentSettings[secret.agentKind]?.token).toBeUndefined();
  });

  it("seals profile creation and environment edits using the configured host key", () => {
    const service = handlers();
    const descriptor = AGENT_PROFILE_DRIVERS.find((driver) => driver.credentialEnvVar)!;
    const envKey = descriptor.credentialEnvVar!;
    const created = service.createProfile({
      driver: descriptor.driver,
      id: "fixture-profile",
      displayName: "Fixture",
      environment: { [envKey]: { value: "first-fixture-secret" } },
    });
    const first = created.environment![envKey]!.value;
    expect(isEncryptedSecret(first)).toBe(true);
    expect(decryptSecret(root, first)).toBe("first-fixture-secret");
    const updated = service.setProfileEnvironment({
      instanceId: created.id,
      environment: { [envKey]: { value: "second-fixture-secret" } },
    });
    expect(decryptSecret(root, updated.environment![envKey]!.value)).toBe("second-fixture-secret");
    expect(readSharedSettingsFile(path).agentInstances[created.id]).toEqual(updated);
    expect(readFileSync(path, "utf8")).not.toContain("fixture-secret");
    expect(service.onChanged).toHaveBeenCalledTimes(2);
  });

  it("does not write or notify when an edit is rejected", () => {
    const service = handlers();
    service.setSharedSettings(service.getSharedSettings({}));
    service.onChanged.mockClear();
    const before = readFileSync(path, "utf8");
    expect(() => service.setAgentSecretSetting({ ...secret, key: "unsupported" })).toThrow(
      "Unsupported sensitive agent setting",
    );
    expect(readFileSync(path, "utf8")).toBe(before);
    expect(service.onChanged).not.toHaveBeenCalled();
  });

  it("returns a committed edit even when notification and diagnostic callbacks throw", () => {
    const notificationError = new Error("Fixture renderer notification unavailable");
    const diagnosticError = new Error("Fixture diagnostic observer unavailable");
    const reportError = vi.fn<(error: unknown) => never>(() => {
      throw diagnosticError;
    });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const service = createBackendSettingsHandlers({
      settingsPath: () => path,
      onChanged: () => {
        throw notificationError;
      },
      reportError,
    });
    try {
      expect(() => service.setAgentSecretSetting(secret)).not.toThrow();
      expect(service.getSharedSettings({}).agentSettings[secret.agentKind]?.token).toEqual(
        expect.any(String),
      );
      expect(reportError).toHaveBeenCalledExactlyOnceWith(notificationError);
      expect(warning).toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });
});
