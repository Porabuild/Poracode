import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBackendSettingsAccess } from "@/backend/BackendSettingsService";
import {
  observeSupervisorSettingsEditsEvent,
  type BackendSupervisorSettingsEditsOptions,
} from "@/backend/BackendSupervisorSettingsEdits";
import {
  SETTINGS_DOCUMENT_VERSION,
  SETTINGS_DOCUMENT_VERSION_KEY,
} from "@/backend/settings/settingsDocument";
import type { AcpRegistryListResult, AgentKind } from "@/shared/contracts";
import { decryptSecret, encryptSecret } from "@/shared/secretStorage";
import type { SharedSettings } from "@/shared/settings";
import { AgentRegistryService } from "../runtime/agentRegistryService";
import type { SupervisorSharedSettingsCache } from "../runtime/supervisorSharedSettings";
import {
  settingsOwnerEdits,
  SupervisorSettingsEditsChannel,
} from "../runtime/supervisorSettingsWriter";

const probeAcpGenericInstanceMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
    installed: true,
    authState: "missing",
    authMethods: [],
  })),
);
vi.mock("./acp-generic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./acp-generic")>()),
  probeAcpGenericInstance: probeAcpGenericInstanceMock,
}));
// No real WSL command or icon download: each test opts in with its own fake.
const batchWslCommandsAsyncMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<{ ok: boolean }[]>>(async () => {
    throw new Error("Unexpected WSL command");
  }),
);
const cacheAcpRegistryIconMock = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<string>>(async () => {
    throw new Error("Unexpected icon download");
  }),
);
vi.mock("./base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./base")>()),
  batchWslCommandsAsync: batchWslCommandsAsyncMock,
}));
vi.mock("./acpRegistryIcons", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./acpRegistryIcons")>()),
  cacheAcpRegistryIcon: cacheAcpRegistryIconMock,
}));
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFile: (...args: unknown[]) =>
    (args.at(-1) as (error: Error | null, stdout: string, stderr: string) => void)(null, "", ""),
}));

import {
  cacheLocalAcpRegistryIcons,
  installAcpRegistryAgent,
  readAcpRegistrySettings,
  repairAcpRegistryInstallLayouts,
  setAcpGenericAgentAuthAcknowledged,
  setAcpRegistryAgentAuth,
} from "./acpRegistry";

const registry: AcpRegistryListResult = {
  version: "1.0.0",
  agents: [
    {
      id: "fixture-acp",
      name: "Fixture ACP",
      version: "1.0.0",
      description: "Registry fixture",
      distribution: { npx: { package: "fixture-acp@1.0.0" } },
    },
  ],
};

/** Real desktop settings access + the supervisor's event/confirm channel. */
function ownedSettings(root: string) {
  const settingsPath = join(root, "settings.json");
  const access = createBackendSettingsAccess({
    settingsPath: () => settingsPath,
    lease: () => ({ paths: { dataRoot: root }, generation: "fixture", assertActive: () => {} }),
    // Unit dependency only; no SQLite preparation claim.
    assertPreparedDatabaseForWrite: () => {},
    onChanged: () => {},
  });
  const supervisor = {
    call: async (_name: string, payload: unknown) => {
      channel.confirm(payload as Parameters<SupervisorSettingsEditsChannel["confirm"]>[0]);
    },
  } as unknown as BackendSupervisorSettingsEditsOptions["supervisor"];
  const channel: SupervisorSettingsEditsChannel = new SupervisorSettingsEditsChannel({
    emit: (event) =>
      observeSupervisorSettingsEditsEvent(
        { commitOwnerSettingsEdits: access.commitOwnerEdits, supervisor },
        event,
      ),
    invalidateSettings: () => {},
  });
  const install = () =>
    installAcpRegistryAgent({
      agentId: "fixture-acp",
      baseDir: root,
      iconsDir: join(root, "icons"),
      registry,
      settingsPath,
      settingsWriter: channel,
    });
  const createProfile = (id: string) =>
    access.call("createProfile", { driver: "claude", id, displayName: id });
  const raw = () => JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, any>;
  const target = { settingsPath, settingsWriter: channel };
  return { settingsPath, access, channel, target, install, createProfile, raw };
}

describe("ACP registry persistence through the settings owner", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "acp-registry-owner-"));
    probeAcpGenericInstanceMock.mockClear();
    batchWslCommandsAsyncMock.mockClear();
    cacheAcpRegistryIconMock.mockClear();
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("installs without tearing the document, so a second profile can still be created", async () => {
    const credential = encryptSecret("", "profile-a-secret");
    writeFileSync(
      join(root, "settings.json"),
      JSON.stringify({
        [SETTINGS_DOCUMENT_VERSION_KEY]: SETTINGS_DOCUMENT_VERSION,
        futureTopLevel: { opaque: true },
        agentInstances: {
          "profile-a": {
            id: "profile-a",
            driver: "claude",
            displayName: "A",
            futureNested: "kept",
            environment: { FIXTURE_TOKEN: { value: credential, sensitive: true } },
          },
        },
      }),
    );
    const owned = ownedSettings(root);
    // The live app's owner is already open when the registry writes.
    await owned.access.call("getSharedSettings", {});

    await owned.install();
    // Before the owner seam, the registry's direct file write made this refuse
    // with settings.dataNotPrepared.
    await expect(owned.createProfile("profile-b")).resolves.toMatchObject({ id: "profile-b" });

    const raw = owned.raw();
    expect(raw[SETTINGS_DOCUMENT_VERSION_KEY]).toBe(SETTINGS_DOCUMENT_VERSION);
    expect(raw.futureTopLevel).toEqual({ opaque: true });
    expect(raw.agentInstances["profile-a"].futureNested).toBe("kept");
    expect(raw.agentInstances["profile-a"].environment.FIXTURE_TOKEN.value).toBe(credential);
    expect(Object.keys(raw.agentInstances).sort()).toEqual([
      "fixture-acp",
      "profile-a",
      "profile-b",
    ]);
    expect(raw.acpRegistryInstalledAgents["fixture-acp"]).toMatchObject({ version: "1.0.0" });
    const owner = (await owned.access.call("getSharedSettings", {})) as SharedSettings;
    const disk = readAcpRegistrySettings(owned.settingsPath);
    expect(Object.keys(owner.agentInstances).sort()).toEqual(
      Object.keys(disk.agentInstances).sort(),
    );
    expect(owner.acpRegistryInstalledAgents).toEqual(disk.acpRegistryInstalledAgents);
    await owned.access.dispose();
  });

  it("keeps an owner edit that lands while a registry install is in flight", async () => {
    const owned = ownedSettings(root);
    probeAcpGenericInstanceMock.mockImplementationOnce(async () => {
      await owned.createProfile("profile-during-install");
      return { installed: true, authState: "missing", authMethods: [] };
    });

    await owned.install();

    expect(Object.keys(owned.raw().agentInstances).sort()).toEqual([
      "fixture-acp",
      "profile-during-install",
    ]);
    await owned.access.dispose();
  });

  it("commits stale-baseline registry edits without reverting unrelated owner edits", async () => {
    const owned = ownedSettings(root);
    const stale = readAcpRegistrySettings(owned.settingsPath);
    await owned.createProfile("profile-concurrent");

    await owned.channel.commit(
      settingsOwnerEdits(stale, { ...stale, acpRegistryAutoInstallOptOuts: ["fixture-acp"] }),
    );

    const raw = owned.raw();
    expect(raw.acpRegistryAutoInstallOptOuts).toEqual(["fixture-acp"]);
    expect(Object.keys(raw.agentInstances)).toEqual(["profile-concurrent"]);
    await owned.access.dispose();
  });

  it("refuses before any install side effect when disk changed outside the owner", async () => {
    const owned = ownedSettings(root);
    await owned.createProfile("profile-a");
    const outside = JSON.stringify({ ...owned.raw(), outsideWrite: true });
    writeFileSync(owned.settingsPath, outside);

    await expect(owned.install()).rejects.toThrow("not ready for these settings");

    expect(probeAcpGenericInstanceMock).not.toHaveBeenCalled();
    expect(existsSync(join(root, "acp-registry"))).toBe(false);
    expect(readFileSync(owned.settingsPath, "utf8")).toBe(outside);
    await owned.access.dispose();
  });

  it("refuses a future document version before any install side effect", async () => {
    const future = JSON.stringify({ [SETTINGS_DOCUMENT_VERSION_KEY]: 99, futureTopLevel: 1 });
    writeFileSync(join(root, "settings.json"), future);
    const owned = ownedSettings(root);

    await expect(owned.install()).rejects.toThrow("unsupported document version");

    expect(probeAcpGenericInstanceMock).not.toHaveBeenCalled();
    expect(readFileSync(owned.settingsPath, "utf8")).toBe(future);
    await owned.access.dispose();
  });

  /** An installed registry instance holding one unreadable and one readable credential. */
  function writeCredentialedInstance(extra: Record<string, unknown> = {}) {
    const unreadable = `${encryptSecret("", "lost-key-secret").slice(0, -4)}AAAA`;
    expect(() => decryptSecret("", unreadable)).toThrow("unable to authenticate data");
    const readable = encryptSecret("", "readable-secret");
    writeFileSync(
      join(root, "settings.json"),
      JSON.stringify({
        [SETTINGS_DOCUMENT_VERSION_KEY]: SETTINGS_DOCUMENT_VERSION,
        agentInstances: {
          "fixture-acp": {
            id: "fixture-acp",
            driver: "acp-generic",
            displayName: "Fixture ACP",
            icon: "https://example.invalid/fixture.svg",
            config: { binary: "npx", args: ["-y", "fixture-acp@1.0.0"], cwd: "project" },
            environment: {
              UNREADABLE: { value: unreadable, sensitive: true },
              READABLE: { value: readable, sensitive: true },
            },
          },
        },
        ...extra,
      }),
    );
    return { unreadable, readable };
  }

  it.each([
    {
      edit: "auth acknowledgement",
      run: (owned: ReturnType<typeof ownedSettings>) =>
        setAcpGenericAgentAuthAcknowledged(owned.target, "fixture-acp", undefined, true),
      changed: (instance: Record<string, any>) =>
        expect(instance.authAcknowledged).toEqual({ native: true }),
    },
    {
      edit: "icon localization",
      run: (owned: ReturnType<typeof ownedSettings>) =>
        cacheLocalAcpRegistryIcons({ ...owned.target, iconsDir: join(root, "icons") }),
      changed: (instance: Record<string, any>) =>
        expect(instance.icon).toBe("poracode-local://fixture-acp.svg"),
    },
    {
      edit: "registry update",
      run: (owned: ReturnType<typeof ownedSettings>) => owned.install(),
      changed: (instance: Record<string, any>) => expect(instance.version).toBe("1.0.0"),
    },
  ])("keeps the instance's stored credentials byte-for-byte on a $edit", async (row) => {
    const { unreadable, readable } = writeCredentialedInstance();
    cacheAcpRegistryIconMock.mockResolvedValueOnce("poracode-local://fixture-acp.svg");
    const owned = ownedSettings(root);

    await row.run(owned);

    const instance = owned.raw().agentInstances["fixture-acp"];
    row.changed(instance);
    expect(instance.environment).toEqual({
      UNREADABLE: { value: unreadable, sensitive: true },
      READABLE: { value: readable, sensitive: true },
    });
    await owned.access.dispose();
  });

  it("replaces or removes only the credentials an auth edit names", async () => {
    const { unreadable, readable } = writeCredentialedInstance();
    const owned = ownedSettings(root);

    await setAcpRegistryAgentAuth({
      ...owned.target,
      agentId: "fixture-acp",
      environment: { READABLE: "next" },
    });
    let environment = owned.raw().agentInstances["fixture-acp"].environment;
    expect(environment.UNREADABLE.value).toBe(unreadable);
    expect(environment.READABLE.value).not.toBe(readable);
    expect(decryptSecret("", environment.READABLE.value)).toBe("next");

    await setAcpRegistryAgentAuth({
      ...owned.target,
      agentId: "fixture-acp",
      environment: { UNREADABLE: "" },
    });
    environment = owned.raw().agentInstances["fixture-acp"].environment;
    expect(environment).not.toHaveProperty("UNREADABLE");
    expect(decryptSecret("", environment.READABLE.value)).toBe("next");
    await owned.access.dispose();
  });

  const wslRecord = (id: string, layoutVersion?: number) => ({
    id,
    name: id,
    version: "1.0.0",
    installedAt: "2026-10-09T00:00:00.000Z",
    adapterKind: `acp-generic:${id}`,
    installKind: "generic",
    installations: {
      wsl: {
        Fixture: {
          version: "1.0.0",
          target: "linux-x86_64",
          installedAt: "2026-10-09T00:00:00.000Z",
          ...(layoutVersion === undefined ? {} : { layoutVersion }),
        },
      },
    },
  });

  function writeLayoutRepairFixture(version: number = SETTINGS_DOCUMENT_VERSION) {
    writeFileSync(
      join(root, "settings.json"),
      JSON.stringify({
        [SETTINGS_DOCUMENT_VERSION_KEY]: version,
        agentInstances: {
          "fixture-acp": {
            id: "fixture-acp",
            driver: "acp-generic",
            icon: "https://example.invalid/fixture.svg",
            config: {
              binary: "/fixture/bin/agent",
              environmentCommands: {
                wsl: { Fixture: { binary: "/fixture/bin/agent", args: [] } },
              },
            },
          },
        },
        acpRegistryInstalledAgents: {
          "fixture-acp": wslRecord("fixture-acp"),
          "removed-meanwhile": wslRecord("removed-meanwhile", 99),
        },
      }),
    );
  }

  it("commits only repaired layouts, keeping registry entries changed during the repair", async () => {
    writeLayoutRepairFixture();
    const owned = ownedSettings(root);
    batchWslCommandsAsyncMock.mockImplementationOnce(async () => {
      await owned.access.commitOwnerEdits([
        {
          subject: { kind: "entry", field: "acpRegistryInstalledAgents", key: "concurrent" },
          value: wslRecord("concurrent", 99),
        },
        {
          subject: { kind: "entry", field: "acpRegistryInstalledAgents", key: "removed-meanwhile" },
        },
      ]);
      await owned.createProfile("profile-during-repair");
      return [{ ok: true }];
    });

    await expect(repairAcpRegistryInstallLayouts(owned.target)).resolves.toBe(true);

    const raw = owned.raw();
    expect(Object.keys(raw.acpRegistryInstalledAgents).sort()).toEqual([
      "concurrent",
      "fixture-acp",
    ]);
    expect(
      raw.acpRegistryInstalledAgents["fixture-acp"].installations.wsl.Fixture.layoutVersion,
    ).toBeGreaterThan(0);
    expect(raw.agentInstances).toHaveProperty("profile-during-repair");
    await owned.access.dispose();
  });

  function registryService(owned: ReturnType<typeof ownedSettings>) {
    const closeThreadsForAgentKind = vi.fn<(agentKind: AgentKind) => Promise<void>>(async () => {});
    const service = new AgentRegistryService({
      adapters: new Map(),
      settingsPath: owned.settingsPath,
      settingsWriter: owned.channel,
      baseDir: root,
      acpIconsDir: join(root, "icons"),
      sharedSettingsCache: { invalidate: () => {} } as unknown as SupervisorSharedSettingsCache,
      getAgentStatusService: () => {
        throw new Error("Unexpected status refresh");
      },
      getActiveWslProjectDistros: () => [],
      closeThreadsForAgentKind,
    });
    return { service, closeThreadsForAgentKind };
  }

  it.each([
    { refusal: "a future document version", error: "unsupported document version" },
    { refusal: "an outside disk change", error: "not ready for these settings" },
  ])(
    "refuses maintenance and removal before any effect on $refusal",
    async ({ refusal, error }) => {
      const future = refusal === "a future document version";
      writeLayoutRepairFixture(future ? 99 : SETTINGS_DOCUMENT_VERSION);
      const installDir = join(root, "acp-registry", "fixture-acp");
      mkdirSync(installDir, { recursive: true });
      const owned = ownedSettings(root);
      if (!future) {
        await owned.createProfile("profile-a");
        writeFileSync(owned.settingsPath, JSON.stringify({ ...owned.raw(), outsideWrite: true }));
      }
      const disk = readFileSync(owned.settingsPath, "utf8");
      const { service, closeThreadsForAgentKind } = registryService(owned);

      await expect(service.removeAcpRegistryAgent({ agentId: "fixture-acp" })).rejects.toThrow(
        error,
      );
      await expect(
        cacheLocalAcpRegistryIcons({ ...owned.target, iconsDir: join(root, "icons") }),
      ).rejects.toThrow(error);
      await expect(repairAcpRegistryInstallLayouts(owned.target)).rejects.toThrow(error);

      expect(closeThreadsForAgentKind).not.toHaveBeenCalled();
      expect(cacheAcpRegistryIconMock).not.toHaveBeenCalled();
      expect(batchWslCommandsAsyncMock).not.toHaveBeenCalled();
      expect(existsSync(installDir)).toBe(true);
      expect(readFileSync(owned.settingsPath, "utf8")).toBe(disk);
      await owned.access.dispose();
    },
  );
});
