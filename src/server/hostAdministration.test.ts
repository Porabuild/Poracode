import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { HostOwnerController } from "@/backend/ownership/HostOwnerController";
import { HostControlServer } from "@/backend/ownership/HostControlServer";
import { callHostControl } from "@/backend/ownership/hostControlClient";
import { SettingsAuthority } from "@/backend/settings/SettingsAuthority";
import { SettingsCompatWriter } from "@/backend/settings/settingsCompatWrites";
import { configureSecretStorageKey, decryptSecret, encryptSecret } from "@/shared/secretStorage";
import {
  hostServiceCapabilities,
  HOST_CONTROL_PROTOCOL_VERSION,
  hostControlRequestSchema,
} from "@/shared/hostControlProtocol";
import {
  HOST_ADMIN_VERSION,
  HOST_ADMIN_V4_VERSION,
  HOST_ADMIN_V6_VERSION,
  hostAdminRequest,
  hostAdminMcpPreparationSchema,
  hostAdminProfilePreparationSchema,
  hostAdminMcpAuthStatusSchema,
  type HostAdminCommand,
} from "@/shared/hostAdminProtocol";
import { threadSchema } from "@/shared/contracts/thread";
import { createPersistentRemoteAuthStore } from "@/host/remote/auth";
import { saveUploadedAttachmentFile } from "@/host/attachments/attachmentStorage";
import { RemoteAccessServer } from "@/host/remote/RemoteAccessServer";
import { agentCapabilitySchema } from "@/shared/contracts/agent";
import {
  hostRunDirectoryOptionsSchema,
  hostRunDirectoryPreparationSchema,
} from "@/shared/contracts/hostRun";
import { mcpServerSchema } from "@/shared/contracts/mcpServer";
import { AGENT_PROFILE_DRIVERS } from "@/shared/contracts/agentProfiles";
import {
  AGENT_PLUGINS_MANIFEST_SCHEMA_URL,
  AGENT_PLUGINS_MCP_SCHEMA_URL,
  EMPTY_PORACODE_EXTENSION,
} from "@/shared/plugins/spec";
import { createHostAdministration } from "./hostAdministration";
import { requestHostAdministration } from "./cliAdmin";
import type { AdminSupervisorCall } from "./hostProviderAuth";
import { controlMcpAuthenticationPayloadSchema } from "@/shared/contracts/mcpAuthentication";
import type { HostSessionReads } from "./hostSessionAdministration";
import { McpOAuthService } from "@/supervisor/mcp/McpOAuthService";
import { PluginRegistry } from "@/supervisor/plugins/PluginRegistry";
import { initDatabase, closeDatabase } from "@/host/db/connection";
import {
  dbGetProject,
  dbGetProjects,
  dbUpdateProject,
  dbGetThread,
  dbGetThreadsPage,
  dbUpsertProject,
  dbUpsertThread,
} from "@/host/db";
import {
  PluginAccountService,
  pluginAccountCredentialKey,
} from "@/supervisor/plugins/PluginAccountService";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
  vi.restoreAllMocks();
});

async function fixture(
  admin = true,
  assertCanPersistSecrets?: () => void,
  initialSettings?: Record<string, unknown>,
  sessions?: HostSessionReads,
  withAttachments = true,
) {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "poracode-admin-owner-")));
  const namespace = join(root, "profile");
  const owner = HostOwnerController.acquire(namespace, "headless");
  cleanups.push(async () => {
    await owner.close();
    rmSync(root, { recursive: true, force: true });
  });
  const runtime = await owner.initialize({ mode: "headless" });
  configureSecretStorageKey(runtime.secretStorageKey);
  writeFileSync(runtime.paths.settingsPath, JSON.stringify(initialSettings ?? {}));
  const authority = await SettingsAuthority.open({
    lease: runtime.lease,
    assertPreparedDatabaseForWrite() {},
    assertPersistentCredentials: () => runtime.credentialCapabilities.assertCanPersistSecrets(),
  });
  cleanups.push(() => authority.close());
  const writes = new SettingsCompatWriter(authority);
  const statuses = [
    {
      kind: "fixture",
      label: "Fixture",
      installed: true,
      authState: "authenticated",
      envKind: process.platform === "win32" ? "windows" : "posix",
      capabilities: agentCapabilitySchema.parse({}),
      loginCommand: "fixture login",
      authMethods: [
        {
          id: "key",
          name: "Key",
          type: "terminal",
          env: { FIXTURE_SECRET: "synthetic-hidden-value" },
        },
      ],
      providerMetadata: { authenticatedAs: "fixture@example.test" },
    },
  ];
  const call = vi.fn<AdminSupervisorCall>(async (name) => {
    if (name === "refreshAgentStatuses")
      return {
        windows: statuses,
        wsl: statuses.map((status) => ({ ...status, envKind: "wsl", envDistro: "Ubuntu" })),
        fromCache: false,
      } as never;
    if (name === "manageAgentCredentials")
      return {
        providers: [
          {
            id: "fixture-account",
            label: "Fixture account",
            detail: "synthetic account",
            secret: "never-return",
          },
        ],
      } as never;
    if (name === "closeThreadConfirmed") return { confirmed: true } as never;
    return undefined as never;
  });
  const authStore = createPersistentRemoteAuthStore(runtime.paths.baseDir);
  const server = new RemoteAccessServer({
    appVersion: "2.0.0-test",
    identity: { desktopId: "fixture-host", label: "Fixture" },
    host: "127.0.0.1",
    port: 0,
    authStore,
    callSupervisor: call,
    truncateThreadRuntime() {},
  });
  cleanups.push(() => server.dispose());
  const save = vi.fn<(input: Parameters<typeof saveUploadedAttachmentFile>[1]) => string>((input) =>
    saveUploadedAttachmentFile(runtime.paths, input),
  );
  const administration = createHostAdministration({
    ...(withAttachments ? { attachments: { save } } : {}),
    statusCachePath: runtime.paths.statusCachePath,
    call,
    sessions: sessions ?? {
      readThread: () => null,
      readPage: async () => ({ threads: [], nextCursor: null }),
    },
    server,
    settings: writes,
    readSettings: () => authority.readSettings(),
    assertCanPersistSecrets:
      assertCanPersistSecrets ?? (() => runtime.credentialCapabilities.assertCanPersistSecrets()),
  });
  cleanups.push(() => administration.dispose());
  const control = new HostControlServer({
    lease: runtime.lease,
    describe: () => ({
      state: "ready",
      remoteProtocolVersion: 12,
      endpoint: null,
      capabilities: hostServiceCapabilities(),
    }),
    issuePairing: () => "https://fixture.test/pair#synthetic",
    ...(admin ? { administer: administration.administer } : {}),
  });
  cleanups.push(() => control.dispose());
  await control.start();
  const execute = (command: HostAdminCommand) => requestHostAdministration(namespace, command);
  return {
    execute,
    owner,
    runtime,
    authority,
    writes,
    authStore,
    call,
    server,
    control,
    namespace,
    save,
  };
}

describe("CLI authenticated owner administration", () => {
  it("prepares interactive directory runs through generation-pinned admin23 without widening capabilities", async () => {
    const f = await fixture();
    initDatabase(f.runtime.paths.dbPath);
    try {
      f.call.mockImplementation(
        async () =>
          ({
            version: 1,
            agentKind: "fixture",
            environment: "native",
            status: {
              kind: "fixture",
              label: "Fixture",
              installed: true,
              authState: "authenticated",
              envKind: process.platform === "win32" ? "windows" : "posix",
              capabilities: agentCapabilitySchema.parse({
                models: [{ id: "fixture", label: "Fixture" }],
                presentationMode: "gui",
              }),
            },
          }) as never,
      );
      const command = {
        action: "run-interactive-prepare" as const,
        command: {
          action: "run-directory-prepare" as const,
          directory: f.runtime.paths.baseDir,
          agentKind: "fixture",
          model: "fixture",
          prompt: "Review",
        },
      };
      const before = await callHostControl(f.owner.lease.paths, "describe");
      await expect(
        callHostControl(f.owner.lease.paths, "admin", {
          expectedGeneration: randomUUID(),
          payload: hostAdminRequest(command),
        }),
      ).rejects.toThrow("changed");
      expect(dbGetProjects()).toEqual([]);
      expect(f.call).not.toHaveBeenCalled();
      const selected = hostRunDirectoryPreparationSchema.parse(await f.execute(command));
      expect(
        await f.execute({ action: "run-request-read", runId: selected.run.runId }),
      ).toMatchObject({ ...selected.run, request: null });
      await f.execute({ action: "run-cancel", runId: selected.run.runId });
      const after = await callHostControl(f.owner.lease.paths, "describe");
      expect(after.result.operations).toEqual(before.result.operations);
      expect(after.result.capabilities).toEqual(before.result.capabilities);
    } finally {
      closeDatabase();
    }
  });
  it("prepares directory files under exact v21 owner generation without reading/copying bytes or launching a provider", async () => {
    const f = await fixture();
    initDatabase(f.runtime.paths.dbPath);
    const directory = join(f.runtime.paths.baseDir, "file repo");
    mkdirSync(directory);
    const source = join(directory, "source.txt");
    writeFileSync(source, "owned fixture bytes");
    const command = {
      action: "run-directory-files-prepare" as const,
      directory,
      files: [source],
      agentKind: "fixture",
      model: "fixture",
      prompt: "Explain",
    };
    try {
      await expect(
        callHostControl(f.owner.lease.paths, "admin", {
          expectedGeneration: randomUUID(),
          payload: hostAdminRequest(command),
        }),
      ).rejects.toThrow("changed");
      expect(dbGetProjects()).toEqual([]);
      expect(f.call).not.toHaveBeenCalled();
      f.call.mockImplementation(
        async () =>
          ({
            version: 1,
            agentKind: "fixture",
            environment: "native",
            status: {
              kind: "fixture",
              label: "Fixture",
              installed: true,
              authState: "authenticated",
              envKind: process.platform === "win32" ? "windows" : "posix",
              capabilities: agentCapabilitySchema.parse({
                models: [{ id: "fixture", label: "Fixture" }],
                presentationMode: "gui",
              }),
            },
          }) as never,
      );
      const before = await callHostControl(f.owner.lease.paths, "describe");
      const result = hostRunDirectoryPreparationSchema.parse(await f.execute(command));
      expect(result.created).toBe(true);
      expect(dbGetProjects()).toHaveLength(1);
      expect(f.save).not.toHaveBeenCalled();
      expect(f.call.mock.calls.every(([name]) => name === "probeSelectedAgent")).toBe(true);
      await f.execute({ action: "run-cancel", runId: result.run.runId });
      f.call.mockClear();
      await expect(f.execute({ ...command, files: [source + "-missing"] })).rejects.toThrow(
        "ENOENT",
      );
      expect(f.call).not.toHaveBeenCalled();
      expect(dbGetProjects()).toHaveLength(1);
      const after = await callHostControl(f.owner.lease.paths, "describe");
      expect(after.result.operations).toEqual(before.result.operations);
      expect(after.result.capabilities).toEqual(before.result.capabilities);
    } finally {
      closeDatabase();
    }
  });
  it("refuses missing attachment custody before registering a directory or probing a provider", async () => {
    const f = await fixture(true, undefined, undefined, undefined, false);
    initDatabase(f.runtime.paths.dbPath);
    try {
      await expect(
        f.execute({
          action: "run-directory-files-prepare",
          directory: f.runtime.paths.baseDir,
          files: [join(f.runtime.paths.baseDir, "missing")],
          agentKind: "fixture",
          model: "fixture",
          prompt: "Explain",
        }),
      ).rejects.toThrow("no CLI attachment storage");
      expect(dbGetProjects()).toEqual([]);
      expect(f.call).not.toHaveBeenCalled();
    } finally {
      closeDatabase();
    }
  });
  it.each(["run-directory-options", "run-directory-prepare"] as const)(
    "refuses directory retargeting during %s before provider selection",
    async (action) => {
      const f = await fixture();
      initDatabase(f.runtime.paths.dbPath);
      const directory = join(f.runtime.paths.baseDir, "requested-repo");
      const relocated = join(f.runtime.paths.baseDir, "different-repo");
      mkdirSync(directory);
      mkdirSync(relocated);
      f.call.mockImplementation(
        async () =>
          ({
            version: 1,
            agentKind: "fixture",
            environment: "native",
            status: {
              kind: "fixture",
              label: "Fixture",
              installed: true,
              authState: "authenticated",
              envKind: process.platform === "win32" ? "windows" : "posix",
              capabilities: agentCapabilitySchema.parse({
                models: [{ id: "fixture", label: "Fixture" }],
                presentationMode: "gui",
              }),
            },
          }) as never,
      );
      vi.spyOn(f.server, "publishCatalogChanged").mockImplementationOnce(() => {
        const registered = dbGetProjects().find(
          (project) => project.location.kind !== "wsl" && project.location.path === directory,
        )!;
        dbUpdateProject({
          ...registered,
          location: { kind: process.platform === "win32" ? "windows" : "posix", path: relocated },
        });
      });
      try {
        let failure: unknown;
        let preparation: ReturnType<typeof hostRunDirectoryPreparationSchema.parse> | undefined;
        try {
          const result = await f.execute(
            action === "run-directory-options"
              ? { action, directory, agentKind: "fixture" }
              : {
                  action,
                  directory,
                  agentKind: "fixture",
                  model: "fixture",
                  prompt: "Use the requested directory",
                },
          );
          if (action === "run-directory-prepare")
            preparation = hostRunDirectoryPreparationSchema.parse(result);
        } catch (error) {
          failure = error;
        }
        if (preparation) await f.execute({ action: "run-cancel", runId: preparation.run.runId });
        expect(failure).toMatchObject({
          message: expect.stringContaining("directory selection changed"),
        });
        expect(f.call).not.toHaveBeenCalled();
      } finally {
        closeDatabase();
      }
    },
  );
  it("owns directory registration and preparation under v20, retaining existing settings and exact generation", async () => {
    const f = await fixture();
    initDatabase(f.runtime.paths.dbPath);
    const directory = join(f.runtime.paths.baseDir, "..", "directory repo");
    mkdirSync(directory);
    const command = { action: "run-directory-options" as const, directory, agentKind: "fixture" };
    const changed = vi.spyOn(f.server, "publishCatalogChanged");
    try {
      await expect(
        callHostControl(f.owner.lease.paths, "admin", {
          expectedGeneration: randomUUID(),
          payload: hostAdminRequest(command),
        }),
      ).rejects.toThrow("changed");
      expect(dbGetProjects()).toEqual([]);
      expect(f.call).not.toHaveBeenCalled();
      expect(changed).not.toHaveBeenCalled();
      await expect(
        f.execute({ ...command, directory: "\\\\wsl.localhost\\Selected\\repo" }),
      ).rejects.toThrow("no project was registered");
      await expect(f.execute({ ...command, directory: directory + "-missing" })).rejects.toThrow(
        /ENOENT/u,
      );
      expect(dbGetProjects()).toEqual([]);
      expect(f.call).not.toHaveBeenCalled();
      f.call.mockImplementation(
        async () =>
          ({
            version: 1,
            agentKind: "fixture",
            environment: "native",
            status: {
              kind: "fixture",
              label: "Fixture",
              installed: true,
              authState: "authenticated",
              envKind: process.platform === "win32" ? "windows" : "posix",
              capabilities: agentCapabilitySchema.parse({
                models: [{ id: "fixture", label: "Fixture" }],
                presentationMode: "gui",
              }),
            },
          }) as never,
      );
      const choices = hostRunDirectoryOptionsSchema.parse(await f.execute(command));
      expect(choices.created).toBe(true);
      expect(choices.project.location).toEqual({
        kind: process.platform === "win32" ? "windows" : "posix",
        path: directory,
      });
      expect(choices.options.projectId).toBe(choices.project.id);
      dbUpdateProject({
        ...dbGetProject(choices.project.id)!,
        name: "Keep directory settings",
        scripts: { actions: [], setupScript: "never-run-fixture-script" },
      });
      const stored = dbGetProject(choices.project.id);
      const prepared = hostRunDirectoryPreparationSchema.parse(
        await f.execute({
          action: "run-directory-prepare",
          directory,
          agentKind: "fixture",
          model: "fixture",
          prompt: "Explain exactly",
        }),
      );
      expect(prepared.created).toBe(false);
      expect(prepared.project.id).toBe(choices.project.id);
      expect(dbGetProject(choices.project.id)).toEqual(stored);
      expect(f.call.mock.calls.every(([name]) => name === "probeSelectedAgent")).toBe(true);
      await f.execute({ action: "run-cancel", runId: prepared.run.runId });
      dbUpdateProject({ ...stored!, disabled: true });
      f.call.mockClear();
      await expect(f.execute(command)).rejects.toThrow("disabled");
      expect(f.call).not.toHaveBeenCalled();
      expect(dbGetProjects()).toHaveLength(1);
      const refusedDirectory = directory + "-provider-refusal";
      mkdirSync(refusedDirectory);
      await expect(
        f.execute({
          action: "run-directory-prepare",
          directory: refusedDirectory,
          agentKind: "fixture",
          model: "not-advertised",
          prompt: "Explain",
        }),
      ).rejects.toThrow(/model/iu);
      expect(dbGetProjects()).toHaveLength(2);
      expect(
        dbGetProjects().some(
          (project) =>
            project.location.kind !== "wsl" && project.location.path === refusedDirectory,
        ),
      ).toBe(true);
      expect(dbGetProject(choices.project.id)?.scripts).toEqual(stored!.scripts);
    } finally {
      closeDatabase();
    }
  });
  it("routes exact saved-session preparation through authenticated v19 with owner generation pinning", async () => {
    const f = await fixture();
    initDatabase(f.runtime.paths.dbPath);
    try {
      dbUpsertProject(
        {
          id: "project",
          name: "Fixture",
          createdAt: "2026-10-21T00:00:00Z",
          location: { kind: process.platform === "win32" ? "windows" : "posix", path: f.namespace },
        },
        0,
      );
      const saved = threadSchema.parse({
        id: "thread",
        projectId: "project",
        title: "Preserved",
        agentKind: "fixture",
        config: { model: "fixture" },
        presentationMode: "gui",
        status: "inactive",
        attention: "none",
        sessionRef: {
          providerSessionId: "saved-provider-id",
          discoveredAt: "2026-10-21T00:00:00Z",
          executionIdentity: "provider-owned",
        },
        createdAt: "2026-10-21T00:00:00Z",
        updatedAt: "2026-10-21T00:00:00Z",
      });
      dbUpsertThread(saved, 0);
      const persisted = dbGetThread(saved.id);
      const command = {
        action: "run-resume-prepare" as const,
        threadId: saved.id,
        prompt: "Continue exactly",
      };
      await expect(
        callHostControl(f.owner.lease.paths, "admin", {
          expectedGeneration: randomUUID(),
          payload: hostAdminRequest(command),
        }),
      ).rejects.toThrow("changed");
      expect(f.call).not.toHaveBeenCalled();
      f.call.mockResolvedValueOnce({
        version: 1,
        agentKind: "fixture",
        environment: "native",
        status: {
          kind: "fixture",
          label: "Fixture",
          installed: true,
          authState: "authenticated",
          capabilities: agentCapabilitySchema.parse({
            models: [{ id: "fixture", label: "Fixture" }],
            supportsResume: true,
            presentationMode: "gui",
          }),
        },
      } as never);
      const prepared = (await f.execute(command)) as { runId: string };
      expect(prepared).toMatchObject({
        formatVersion: 1,
        scope: "controlled-run",
        threadId: saved.id,
      });
      await expect(
        f.execute({ action: "run-cancel", runId: prepared.runId }),
      ).resolves.toMatchObject({ retired: true });
      expect(f.call.mock.calls.map(([name]) => name)).toEqual(["probeSelectedAgent"]);
      expect(dbGetThread(saved.id)).toEqual(persisted);
    } finally {
      closeDatabase();
    }
  });
  it("persists local v18 session changes through the authenticated owner and publishes current metadata", async () => {
    const f = await fixture(true, undefined, undefined, {
      readThread: dbGetThread,
      readPage: async (input) => dbGetThreadsPage(input),
    });
    initDatabase(f.runtime.paths.dbPath);
    try {
      dbUpsertProject(
        {
          id: "project",
          name: "Fixture",
          location: { kind: "windows", path: f.namespace },
          createdAt: "2026-10-21T00:00:00Z",
        },
        0,
      );
      dbUpsertThread(
        threadSchema.parse({
          id: "thread",
          projectId: "project",
          title: "Original",
          agentKind: "fixture",
          config: { model: "fixture" },
          status: "idle",
          attention: "none",
          starred: true,
          createdAt: "2026-10-21T00:00:00Z",
          updatedAt: "2026-10-21T00:00:00Z",
        }),
        0,
      );
      const publish = vi.spyOn(f.server, "publishCatalogChanged");
      await expect(
        callHostControl(f.owner.lease.paths, "admin", {
          expectedGeneration: "different-generation",
          payload: hostAdminRequest({
            action: "sessions-update",
            threadId: "thread",
            change: { kind: "archive" },
          }),
        }),
      ).rejects.toThrow(Error);
      expect(f.call).not.toHaveBeenCalled();
      expect(dbGetThread("thread")?.archived).toBe(false);
      for (const change of [
        { kind: "rename", title: "Renamed" },
        { kind: "archive" },
        { kind: "unarchive" },
        { kind: "done" },
        { kind: "reopen" },
      ] as const) {
        expect(
          await f.execute({ action: "sessions-update", threadId: "thread", change }),
        ).toMatchObject({ change, session: { id: "thread", title: "Renamed" } });
      }
      expect(dbGetThread("thread")).toMatchObject({
        title: "Renamed",
        archived: false,
        done: false,
        starred: false,
      });
      expect(f.call.mock.calls.map(([name]) => name)).toEqual([
        "closeThreadConfirmed",
        "closeThreadConfirmed",
      ]);
      expect(publish).toHaveBeenCalledTimes(5);
    } finally {
      closeDatabase();
    }
  });
  it("reconciles successful custom configuration writes through the exact existing native scoped refresh", async () => {
    const f = await fixture();
    const added = (await f.execute({
      action: "custom-providers",
      command: {
        version: 1,
        action: "add",
        id: "custom",
        displayName: "Custom",
        definition: { binary: process.execPath, cwd: "project", authMode: "none" },
      },
    })) as { agent: { revision: string } };
    expect(f.call).toHaveBeenCalledExactlyOnceWith("refreshAgentStatuses", {
      wslDistros: [],
      scope: { agentKinds: ["acp-generic:custom"], envs: [{ kind: "native" }] },
    });
    f.call.mockClear();
    await f.execute({ action: "custom-providers", command: { version: 1, action: "list" } });
    expect(f.call).not.toHaveBeenCalled();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    f.call.mockRejectedValueOnce(new Error("synthetic-do-not-print"));
    await expect(
      f.execute({
        action: "custom-providers",
        command: {
          version: 1,
          action: "configure",
          id: "custom",
          expectedRevision: added.agent.revision,
          displayName: "Renamed",
        },
      }),
    ).resolves.toMatchObject({ agent: { displayName: "Renamed" } });
    expect(f.authority.readSettings().agentInstances.custom?.displayName).toBe("Renamed");
    expect(
      warning.mock.calls.filter(
        ([message]) => typeof message === "string" && message.startsWith("[host-admin]"),
      ),
    ).toEqual([[expect.stringContaining("configuration was saved")]]);
    expect(JSON.stringify(warning.mock.calls)).not.toContain("synthetic-do-not-print");
  });
  it("serves saved provider inventory through authenticated headless ownership without supervisor calls", async () => {
    const f = await fixture();
    f.call.mockClear();
    expect(await f.execute({ action: "providers-inventory", refresh: false })).toMatchObject({
      formatVersion: 1,
      observation: { source: "saved-cache", state: "missing" },
      providers: [],
    });
    expect(f.call).not.toHaveBeenCalled();
    await expect(
      callHostControl(f.runtime.lease.paths, "admin", {
        expectedGeneration: "foreign-generation",
        payload: { adminVersion: 17, command: { action: "providers-inventory", refresh: false } },
      }),
    ).rejects.toThrow("owner changed");
    expect(f.call).not.toHaveBeenCalled();
  });
  it("registers and pages projects through the authenticated owner without provider or credential effects", async () => {
    const f = await fixture();
    initDatabase(f.runtime.paths.dbPath);
    const changed = vi.spyOn(f.server, "publishCatalogChanged");
    try {
      const directory = join(f.runtime.paths.baseDir, "owned-project");
      mkdirSync(directory);
      const added = (await f.execute({ action: "projects-add", path: directory })) as {
        created: boolean;
        project: { id: string };
      };
      expect(added.created).toBe(true);
      const stored = dbGetProject(added.project.id)!;
      dbUpdateProject({
        ...stored,
        scripts: { actions: [], setupScript: "synthetic-private-script" },
        disabled: true,
      });
      const repeated = await f.execute({ action: "projects-add", path: directory });
      expect(repeated).toMatchObject({
        created: false,
        project: { id: stored.id, disabled: true },
      });
      expect(dbGetProject(stored.id)?.scripts?.setupScript).toBe("synthetic-private-script");
      const inspection = await f.execute({ action: "projects-inspect", projectId: stored.id });
      expect(JSON.stringify(inspection)).not.toContain("synthetic-private-script");
      const second = join(f.runtime.paths.baseDir, "second-project");
      mkdirSync(second);
      await f.execute({ action: "projects-add", path: second });
      const firstPage = (await f.execute({ action: "projects-list", limit: 1 })) as {
        projects: { id: string }[];
        nextCursor: string;
      };
      const nextPage = (await f.execute({
        action: "projects-list",
        limit: 1,
        cursor: firstPage.nextCursor,
      })) as { projects: { id: string }[]; nextCursor: null };
      expect(
        new Set([...firstPage.projects, ...nextPage.projects].map((project) => project.id)).size,
      ).toBe(2);
      expect(nextPage.nextCursor).toBeNull();
      await expect(f.execute({ action: "projects-inspect", projectId: "missing" })).rejects.toThrow(
        "Project not found",
      );
      await expect(
        callHostControl(f.runtime.lease.paths, "admin", {
          expectedGeneration: "foreign-generation",
          payload: hostAdminRequest({
            action: "projects-add",
            path: directory,
            name: "Wrong owner",
          }),
        }),
      ).rejects.toThrow("owner changed");
      expect(dbGetProject(stored.id)?.name).toBe(stored.name);
      expect(f.call).not.toHaveBeenCalled();
      expect(changed).toHaveBeenCalledTimes(3);
    } finally {
      closeDatabase();
    }
  });
  it("checks the exact generation and saved session before local v13 worker admission", async () => {
    const thread = threadSchema.parse({
      id: "saved",
      projectId: "project",
      title: "Saved",
      agentKind: "fixture",
      config: { model: "fixture" },
      status: "idle",
      attention: "none",
      createdAt: "2026-10-21T00:00:00Z",
      updatedAt: "2026-10-21T00:00:00Z",
    });
    const f = await fixture(true, undefined, undefined, {
      readThread: (id) => (id === thread.id ? thread : null),
      readPage: async () => ({ threads: [thread], nextCursor: null }),
    });
    await expect(
      callHostControl(f.owner.lease.paths, "admin", {
        expectedGeneration: randomUUID(),
        payload: hostAdminRequest({ action: "sessions-export-start", threadId: "saved" }),
      }),
    ).rejects.toThrow("owner changed");
    await expect(
      f.execute({ action: "sessions-export-start", threadId: "missing" }),
    ).rejects.toThrow("not found");
    await expect(f.execute({ action: "sessions-export-start", threadId: "saved" })).rejects.toThrow(
      "no session export worker",
    );
    expect(f.call).not.toHaveBeenCalled();
  });
  it("drains an admitted v12 catalog call before retiring private control", async () => {
    const f = await fixture(),
      entered = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>();
    f.call.mockImplementation(async () => {
      entered.resolve();
      await release.promise;
      return { catalogs: [], installations: [] } as never;
    });
    const pending = f.execute({ action: "catalogs-list" }).catch((error: unknown) => error);
    await entered.promise;
    let retired = false;
    const closing = f.control.dispose().then(() => {
      retired = true;
    });
    try {
      await new Promise<void>((done) => setImmediate(done));
      expect(retired).toBe(false);
      f.owner.lease.assertActive();
    } finally {
      release.resolve();
      await pending;
      await closing;
    }
    expect(retired).toBe(true);
    f.owner.lease.assertActive();
  });
  it("forwards v12 catalogs only through the authenticated selected generation", async () => {
    const f = await fixture();
    f.call.mockResolvedValue({ catalogs: [], installations: [] } as never);
    await expect(f.execute({ action: "catalogs-list" })).resolves.toMatchObject({
      formatVersion: 1,
      scope: "global",
      command: { action: "catalogs-list" },
      catalogs: [],
      installations: [],
    });
    expect(f.call).toHaveBeenCalledExactlyOnceWith("pluginCatalog", { action: "list" });
    await expect(
      callHostControl(f.owner.lease.paths, "admin", {
        expectedGeneration: randomUUID(),
        payload: hostAdminRequest({ action: "package-remove", pluginName: "fixture" }),
      }),
    ).rejects.toThrow("owner changed");
    expect(f.call).toHaveBeenCalledOnce();
  });
  it("forwards controlled integration login through authenticated v11 with the same owner generation", async () => {
    const url = "https://issuer.invalid/mcp";
    const f = await fixture(true, undefined, {
      mcpServers: [
        {
          id: "tools",
          name: "Tools",
          transport: { type: "http", url, headers: { "X-Fixture-Key": "synthetic-private-value" } },
        },
      ],
    });
    f.call.mockImplementation(async (name, payload) => {
      if (name === "getMcpOauthStatus") return { authenticatedUrls: [url] } as never;
      if (name === "controlMcpAuthentication") {
        const command = controlMcpAuthenticationPayloadSchema.parse(payload);
        if (command.action === "cancel")
          return {
            version: 1,
            action: "cancel",
            operationId: command.operationId,
            cancelled: true,
          } as never;
        return {
          version: 1,
          action: command.action,
          operationId: command.operationId,
          target: { scope: "saved-user", serverId: "tools" },
          authorization: { status: "authorized" },
        } as never;
      }
      throw new Error("Unexpected fixture procedure");
    });
    const status = hostAdminMcpAuthStatusSchema.parse(
      await f.execute({ action: "mcp-auth-status", serverId: "tools" }),
    );
    const command = {
      action: "mcp-auth-start",
      operationId: randomUUID(),
      serverId: "tools",
      expectedServerRevision: status.serverRevision,
    } as const;
    const result = await f.execute(command);
    expect(result).toMatchObject({
      version: 1,
      action: "start",
      operationId: command.operationId,
      authorization: { status: "authorized" },
    });
    expect(JSON.stringify(result)).not.toContain("synthetic-private-value");
    expect(JSON.stringify(result)).not.toContain("issuer.invalid");
    await expect(
      callHostControl(f.runtime.lease.paths, "admin", {
        expectedGeneration: "wrong-generation",
        payload: hostAdminRequest(command),
      }),
    ).rejects.toThrow("owner changed");
    expect(f.call.mock.calls.filter((call) => call[0] === "controlMcpAuthentication")).toHaveLength(
      1,
    );
  });

  it("leaves unsupported owners running before controlled integration login can start", async () => {
    const f = await fixture(false);
    await expect(
      f.execute({
        action: "mcp-auth-start",
        operationId: randomUUID(),
        serverId: "tools",
        expectedServerRevision: "ab".repeat(32),
      }),
    ).rejects.toThrow("does not support CLI administration");
    expect(f.call).not.toHaveBeenCalled();
    expect((await callHostControl(f.runtime.lease.paths, "describe")).result.state).toBe("ready");
  });
  it("preserves a future MCP credential store and refuses its logout without a fallback", async () => {
    const url = "https://fixture.test/mcp";
    const value = await fixture(true, undefined, {
      mcpServers: [
        mcpServerSchema.parse({ id: "tools", name: "tools", transport: { type: "http", url } }),
      ],
    });
    const storePath = join(value.runtime.paths.baseDir, "mcp-oauth.json");
    const future = JSON.stringify({
      version: 99,
      servers: { [url]: { opaque: "future-custody" } },
    });
    writeFileSync(storePath, future);
    const oauth = new McpOAuthService({ baseDir: value.runtime.paths.baseDir });
    cleanups.push(async () => oauth.dispose());
    value.call.mockImplementation(async (name, payload) => {
      if (name === "getMcpOauthStatus") return oauth.status() as never;
      if (name === "clearMcpServerOauth") {
        oauth.clear(payload as never);
        return undefined as never;
      }
      throw new Error(`Unexpected credential operation: ${name}`);
    });
    // Legacy status intentionally degrades unknown stores to no usable credentials.
    const prepared = hostAdminMcpAuthStatusSchema.parse(
      await value.execute({ action: "mcp-auth-status", serverId: "tools" }),
    );
    expect(prepared.usableCredentials).toBe(false);
    await expect(
      value.execute({
        action: "mcp-auth-logout",
        serverId: "tools",
        expectedServerRevision: prepared.serverRevision,
      }),
    ).rejects.toThrow("Unsupported MCP OAuth store version");
    expect(readFileSync(storePath, "utf8")).toBe(future);
  });

  it("keeps old owners running when integration-account administration is unsupported", async () => {
    const value = await fixture(false);
    for (const command of [
      { action: "plugin-accounts-list", pluginName: "fixture" },
      { action: "mcp-auth-status", serverId: "tools" },
    ] as const)
      await expect(value.execute(command)).rejects.toThrow("does not support CLI administration");
    expect(value.call).not.toHaveBeenCalled();
    value.owner.lease.assertActive();
  });

  it("uses the real sealed plugin and user MCP stores without crossing credential domains", async () => {
    const url = "https://fixture.test/mcp";
    const server = mcpServerSchema.parse({
      id: "user-tools",
      name: "user-tools",
      transport: { type: "http", url },
    });
    const value = await fixture(true, undefined, { mcpServers: [server] });
    await value.execute({
      action: "providers-add",
      profile: {
        id: "work",
        driver: "codex",
        displayName: "Work",
        config: { homeDir: "~/.fixture-only" },
        environment: { SYNTHETIC_KEY: { value: "synthetic-provider-token", sensitive: true } },
      },
    });
    const profilesBefore = JSON.stringify(value.authority.readSettings().agentInstances);
    const baseDir = value.runtime.paths.baseDir;
    const userPlugins = join(baseDir, "plugins");
    const directory = join(userPlugins, "notes");
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, "plugin.json"),
      JSON.stringify({ $schema: AGENT_PLUGINS_MANIFEST_SCHEMA_URL, name: "notes" }),
    );
    writeFileSync(
      join(directory, "mcp.json"),
      JSON.stringify({
        $schema: AGENT_PLUGINS_MCP_SCHEMA_URL,
        mcpServers: { service: { type: "streamable-http", url } },
      }),
    );
    const registry = new PluginRegistry({
      bundledPluginsDir: () => undefined,
      userPluginsDir: () => userPlugins,
    });
    const first = {
      id: randomUUID(),
      pluginName: "notes",
      serverName: "service",
      url,
      label: "Work",
      selected: true,
    };
    const second = { ...first, id: randomUUID(), label: "Personal", selected: false };
    writeFileSync(
      join(baseDir, "plugin-accounts.json"),
      JSON.stringify({ version: 1, accounts: [first, second] }),
    );
    const tokens = (token: string) => ({
      tokens: encryptSecret(
        baseDir,
        JSON.stringify({ access_token: token, token_type: "Bearer", scope: "read" }),
      ),
      tokensSavedAt: Date.now(),
    });
    writeFileSync(
      join(baseDir, "mcp-oauth.json"),
      JSON.stringify({
        version: 1,
        servers: {
          [url]: tokens("synthetic-user-token"),
          [pluginAccountCredentialKey(first)]: tokens("synthetic-first-plugin-token"),
          [pluginAccountCredentialKey(second)]: tokens("synthetic-second-plugin-token"),
        },
      }),
    );
    const oauth = new McpOAuthService({ baseDir });
    cleanups.push(async () => oauth.dispose());
    const accounts = new PluginAccountService({ baseDir, registry, oauth });
    value.call.mockImplementation(async (name, payload) => {
      if (name === "pluginAccounts") return (await accounts.manage(payload as never)) as never;
      if (name === "getMcpOauthStatus") return oauth.status() as never;
      if (name === "clearMcpServerOauth") {
        oauth.clear(payload as never);
        return undefined as never;
      }
      throw new Error(`Unexpected credential boundary: ${name}`);
    });
    const listed = await value.execute({ action: "plugin-accounts-list", pluginName: "notes" });
    expect(JSON.stringify(listed)).not.toMatch(/synthetic-|https:/u);
    expect(listed).toMatchObject({
      accounts: [
        { id: first.id, status: "connected", selected: true },
        { id: second.id, status: "connected", selected: false },
      ],
    });
    await expect(
      value.execute({
        action: "plugin-account-logout",
        pluginName: "notes",
        serverName: "different",
        accountId: second.id,
      }),
    ).rejects.toThrow("support");
    expect(oauth.credentialStatus(pluginAccountCredentialKey(second)).status).toBe("connected");
    await value.execute({
      action: "plugin-account-select",
      pluginName: "notes",
      serverName: "service",
      accountId: second.id,
    });
    const metadata = JSON.parse(readFileSync(join(baseDir, "plugin-accounts.json"), "utf8"));
    expect(metadata.accounts.map((account: { selected: boolean }) => account.selected)).toEqual([
      false,
      true,
    ]);
    await value.execute({
      action: "plugin-account-logout",
      pluginName: "notes",
      serverName: "service",
      accountId: second.id,
    });
    expect(oauth.credentialStatus(pluginAccountCredentialKey(second)).status).toBe("disconnected");
    expect(oauth.credentialStatus(pluginAccountCredentialKey(first)).status).toBe("connected");
    expect(oauth.status().authenticatedUrls).toEqual([url]);
    const prepared = hostAdminMcpAuthStatusSchema.parse(
      await value.execute({ action: "mcp-auth-status", serverId: server.id }),
    );
    await value.execute({
      action: "mcp-auth-logout",
      serverId: server.id,
      expectedServerRevision: prepared.serverRevision,
    });
    expect(oauth.status().authenticatedUrls).toEqual([]);
    expect(oauth.credentialStatus(pluginAccountCredentialKey(first)).status).toBe("connected");
    expect(JSON.stringify(value.authority.readSettings().agentInstances)).toBe(profilesBefore);
    expect(readFileSync(join(baseDir, "mcp-oauth.json"), "utf8")).not.toContain(
      "synthetic-first-plugin-token",
    );
    expect(
      JSON.parse(readFileSync(join(baseDir, "plugin-accounts.json"), "utf8")).accounts,
    ).toHaveLength(2);
  });

  it("forwards exact plugin account custody and returns only public metadata", async () => {
    const value = await fixture();
    const account = {
      id: "a41082c9-a0ae-49cd-a9e4-8ee7bce11f3d",
      pluginName: "fixture",
      serverName: "tools",
      label: "Work",
      status: "connected",
      scopes: ["read"],
      selected: true,
    };
    value.call.mockResolvedValue({
      accounts: [account],
      authorization: {
        status: "redirect",
        flowId: "private-flow",
        authorizationUrl: "https://fixture.test/private-authorization",
      },
    } as never);
    const result = await value.execute({ action: "plugin-accounts-list", pluginName: "fixture" });
    expect(result).toEqual({
      formatVersion: 1,
      scope: "plugin-service-accounts",
      operation: "list",
      pluginName: "fixture",
      accounts: [account],
    });
    expect(value.call).toHaveBeenCalledExactlyOnceWith("pluginAccounts", {
      action: "list",
      pluginName: "fixture",
    });
    expect(JSON.stringify(result)).not.toContain("private");
    value.call.mockClear();
    await value.execute({
      action: "plugin-account-select",
      pluginName: "fixture",
      serverName: "tools",
      accountId: account.id,
    });
    expect(value.call).toHaveBeenCalledExactlyOnceWith("pluginAccounts", {
      action: "select",
      pluginName: "fixture",
      serverName: "tools",
      accountId: account.id,
    });
    value.call.mockResolvedValue({ accounts: [{ ...account, status: "disconnected" }] } as never);
    value.call.mockClear();
    await value.execute({
      action: "plugin-account-logout",
      pluginName: "fixture",
      serverName: "tools",
      accountId: account.id,
    });
    expect(value.call).toHaveBeenCalledExactlyOnceWith("pluginAccounts", {
      action: "logout",
      pluginName: "fixture",
      serverName: "tools",
      accountId: account.id,
    });
  });

  it("reads and clears only the selected user URL slot through an authenticated v10 owner", async () => {
    const url = "https://fixture.test/deployment/mcp?private=synthetic";
    const server = mcpServerSchema.parse({
      id: "tools",
      name: "tools",
      transport: { type: "http", url, headers: { Authorization: "synthetic-private" } },
    });
    const value = await fixture(true, undefined, {
      mcpServers: [server, { ...server, id: "second", name: "second" }],
    });
    value.call.mockResolvedValue({
      authenticatedUrls: [url, "https://other.test/secret"],
    } as never);
    const status = hostAdminMcpAuthStatusSchema.parse(
      await value.execute({ action: "mcp-auth-status", serverId: "tools" }),
    );
    expect(status).toMatchObject({
      usableCredentials: true,
      headerAuthorization: true,
      sharedServerIds: ["second", "tools"],
    });
    expect(JSON.stringify(status)).not.toMatch(/https:|synthetic-private|other.test/u);
    value.call.mockClear();
    value.call.mockResolvedValue(undefined as never);
    expect(
      await value.execute({
        action: "mcp-auth-logout",
        serverId: "tools",
        expectedServerRevision: status.serverRevision,
      }),
    ).toMatchObject({ loggedOut: true, serverId: "tools", headerAuthorization: true });
    expect(value.call).toHaveBeenCalledExactlyOnceWith("clearMcpServerOauth", { url });
    expect(value.authority.readSettings().mcpServers).toHaveLength(2);
  });

  it.each(["target", "sharing"])(
    "refuses a changed MCP %s before logout without credential effects",
    async (change) => {
      const server = mcpServerSchema.parse({
        id: "tools",
        name: "tools",
        transport: { type: "sse", url: "https://fixture.test/mcp" },
      });
      const value = await fixture(true, undefined, { mcpServers: [server] });
      value.call.mockResolvedValue({ authenticatedUrls: [] } as never);
      const prepared = hostAdminMcpAuthStatusSchema.parse(
        await value.execute({ action: "mcp-auth-status", serverId: "tools" }),
      );
      await value.writes.editSettingsField("mcpServers", () =>
        change === "target"
          ? [{ ...server, transport: { ...server.transport, url: "https://different.test/mcp" } }]
          : [server, { ...server, id: "new-sharing", name: "new-sharing" }],
      );
      value.call.mockClear();
      await expect(
        value.execute({
          action: "mcp-auth-logout",
          serverId: "tools",
          expectedServerRevision: prepared.serverRevision,
        }),
      ).rejects.toThrow("changed");
      expect(value.call).not.toHaveBeenCalled();
    },
  );

  it("refuses unsupported stdio and missing saved IDs before reading or clearing OAuth", async () => {
    const value = await fixture(true, undefined, {
      mcpServers: [
        mcpServerSchema.parse({
          id: "tools",
          name: "tools",
          transport: { type: "stdio", command: "fixture" },
        }),
      ],
    });
    for (const serverId of ["tools", "absent"])
      await expect(value.execute({ action: "mcp-auth-status", serverId })).rejects.toThrow(
        /stdio|not found/iu,
      );
    expect(value.call).not.toHaveBeenCalled();
  });

  it("refuses credential writes when this owner's persistent credential authority is unavailable", async () => {
    const value = await fixture(true, () => {
      throw new Error("Credentials require activation.");
    });
    await expect(
      value.execute({
        action: "plugin-account-logout",
        pluginName: "fixture",
        serverName: "tools",
        accountId: "a41082c9-a0ae-49cd-a9e4-8ee7bce11f3d",
      }),
    ).rejects.toThrow("activation");
    expect(value.call).not.toHaveBeenCalled();
  });

  it("forwards local v8 catalog/inspect/confirmed-stop requests through the authenticated owner without exposing config", async () => {
    const thread = threadSchema.parse({
      id: "fixture-thread",
      projectId: "fixture-project",
      title: "Fixture",
      agentKind: "fixture",
      config: { model: "private-model" },
      status: "working",
      attention: "working",
      createdAt: "2026-10-20T00:00:00Z",
      updatedAt: "2026-10-20T00:00:00Z",
    });
    const before = JSON.stringify(thread);
    const reads = {
      readThread: vi.fn<HostSessionReads["readThread"]>((id: string) =>
        id === thread.id ? thread : null,
      ),
      readPage: vi.fn<HostSessionReads["readPage"]>(async () => ({
        threads: [thread],
        nextCursor: null,
      })),
    };
    const value = await fixture(true, undefined, undefined, reads);
    const page = await value.execute({
      action: "sessions-list",
      limit: 1,
      projectId: thread.projectId,
    });
    expect(page).toMatchObject({
      formatVersion: 1,
      scope: "persisted-profile",
      nextCursor: null,
      sessions: [{ id: thread.id, storedStatus: "working" }],
    });
    expect(JSON.stringify(page)).not.toContain("private-model");
    expect(value.call).not.toHaveBeenCalled();
    expect(await value.execute({ action: "sessions-inspect", threadId: thread.id })).toMatchObject({
      session: { id: thread.id },
    });
    expect(await value.execute({ action: "sessions-stop", threadId: thread.id })).toEqual({
      formatVersion: 1,
      scope: "persisted-profile",
      threadId: thread.id,
      retired: true,
    });
    expect(value.call).toHaveBeenCalledExactlyOnceWith("closeThreadConfirmed", {
      threadId: thread.id,
    });
    expect(JSON.stringify(thread)).toBe(before);
    await expect(
      callHostControl(value.owner.lease.paths, "admin", {
        expectedGeneration: randomUUID(),
        payload: hostAdminRequest({ action: "sessions-stop", threadId: thread.id }),
      }),
    ).rejects.toThrow(Error);
    expect(value.call).toHaveBeenCalledTimes(1);
    value.call.mockResolvedValueOnce({ confirmed: false } as never);
    await expect(value.execute({ action: "sessions-stop", threadId: thread.id })).rejects.toThrow(
      "retirement was not confirmed",
    );
    expect(JSON.stringify(thread)).toBe(before);
  });
  it.each(["stdio", "http", "sse"] as const)(
    "adds a canonical %s definition without returning private transport values or invoking providers",
    async (type) => {
      const transport =
        type === "stdio"
          ? { type, command: "synthetic-command", env: { KEY: "synthetic-secret" } }
          : {
              type,
              url: "https://fixture.test/deployment/mcp?token=synthetic-query",
              headers: { Authorization: "synthetic-secret" },
            };
      const server = mcpServerSchema.parse({ id: "exact-id", name: "fixture-server", transport });
      const neighbor = { ...server, id: "neighbor", name: "neighbor" };
      const value = await fixture(true, undefined, {
        mcpServers: [{ ...neighbor, futureNeighbor: true }],
        futureRoot: "preserved",
      });
      const before = JSON.parse(readFileSync(value.authority.settingsPath, "utf8"));
      const result = await value.execute({ action: "mcp-add", server });
      expect(result).toEqual({
        formatVersion: 2,
        scope: "saved-user",
        change: "add",
        serverId: "exact-id",
      });
      expect(JSON.stringify(result)).not.toContain("synthetic-");
      const after = JSON.parse(readFileSync(value.authority.settingsPath, "utf8"));
      expect(after.mcpServers).toEqual([before.mcpServers[0], server]);
      expect(after.futureRoot).toBe("preserved");
      expect(value.call).not.toHaveBeenCalled();
    },
  );

  it("refuses existing IDs, duplicate names and redaction markers without copying secrets or changing records", async () => {
    const server = mcpServerSchema.parse({
      id: "exact-id",
      name: "fixture-server",
      transport: {
        type: "http",
        url: "https://fixture.test/mcp",
        headers: { Authorization: "synthetic-secret" },
      },
    });
    const value = await fixture(true, undefined, { mcpServers: [server] });
    const before = readFileSync(value.authority.settingsPath, "utf8");
    await expect(value.execute({ action: "mcp-add", server })).rejects.toThrow(
      "already uses this ID",
    );
    await expect(
      value.execute({
        action: "mcp-add",
        server: { ...server, id: "other-id", name: "FIXTURE-SERVER" },
      }),
    ).rejects.toThrow("already uses this name");
    await expect(
      value.execute({
        action: "mcp-add",
        server: {
          ...server,
          id: "other-id",
          name: "other",
          transport: {
            type: "http",
            url: "https://fixture.test/mcp",
            headers: { Authorization: "«redacted»" },
          },
        },
      }),
    ).rejects.toThrow("explicit values");
    const prepared = hostAdminMcpPreparationSchema.parse(
      await value.execute({ action: "mcp-prepare-configuration", serverId: server.id }),
    );
    await expect(
      value.execute({
        action: "mcp-configure-checked",
        expectedServerRevision: prepared.serverRevision,
        server: {
          ...server,
          transport: {
            type: "http",
            url: "https://fixture.test/mcp",
            headers: { Authorization: "«redacted»" },
          },
        },
      }),
    ).rejects.toThrow("explicit values");
    expect(readFileSync(value.authority.settingsPath, "utf8")).toBe(before);
    expect(value.call).not.toHaveBeenCalled();
  });

  it("prepares public metadata and replaces the entire known definition only at the prepared revision", async () => {
    const server = mcpServerSchema.parse({
      id: "exact-id",
      name: "fixture-server",
      enabled: false,
      timeoutMs: 500,
      disabledTools: ["old-tool"],
      transport: {
        type: "http",
        url: "https://fixture.test/synthetic-private",
        headers: { Authorization: "synthetic-secret" },
      },
    });
    const neighbor = { ...server, id: "neighbor", name: "neighbor" };
    const value = await fixture(true, undefined, {
      mcpServers: [{ ...server, futureServer: true }, neighbor],
      futureRoot: "preserved",
    });
    const prepared = hostAdminMcpPreparationSchema.parse(
      await value.execute({ action: "mcp-prepare-configuration", serverId: server.id }),
    );
    expect(prepared).toMatchObject({ id: server.id, name: server.name, transport: "http" });
    expect(prepared.serverRevision).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(prepared)).not.toContain("synthetic-");
    const replacement = mcpServerSchema.parse({
      id: server.id,
      name: "replacement",
      transport: { type: "stdio", command: "new-command" },
    });
    expect(
      await value.execute({
        action: "mcp-configure-checked",
        server: replacement,
        expectedServerRevision: prepared.serverRevision,
      }),
    ).toEqual({ formatVersion: 2, scope: "saved-user", change: "configure", serverId: server.id });
    const after = JSON.parse(readFileSync(value.authority.settingsPath, "utf8"));
    expect(after.mcpServers[0]).toEqual({ ...replacement, futureServer: true });
    expect(after.mcpServers[1]).toEqual(neighbor);
    expect(after.futureRoot).toBe("preserved");
    await expect(
      value.execute({
        action: "mcp-configure-checked",
        server: replacement,
        expectedServerRevision: prepared.serverRevision,
      }),
    ).rejects.toThrow("server changed");
    expect(value.call).not.toHaveBeenCalled();
  });

  it.each(["mcp-add", "mcp-prepare-configuration", "mcp-check-add"] as const)(
    "refuses %s without persistence capability before reading or writing private definitions",
    async (action) => {
      const guard = vi.fn<() => never>(() => {
        throw new Error("fixture credential persistence unavailable");
      });
      const value = await fixture(true, guard);
      const sequence = value.authority.snapshot().sequence;
      const server = mcpServerSchema.parse({
        id: "exact-id",
        name: "fixture-server",
        transport: { type: "stdio", command: "fixture" },
      });
      await expect(
        value.execute(
          action === "mcp-add"
            ? { action, server }
            : action === "mcp-check-add"
              ? { action, serverId: server.id, name: server.name }
              : { action, serverId: server.id },
        ),
      ).rejects.toThrow("persistence unavailable");
      expect(guard).toHaveBeenCalledOnce();
      expect(value.authority.snapshot().sequence).toBe(sequence);
      expect(value.call).not.toHaveBeenCalled();
    },
  );

  it("checks only MCP creation metadata without saving and still rejects a raced duplicate in the v7 writer", async () => {
    const existing = mcpServerSchema.parse({
      id: "neighbor",
      name: "existing-name",
      transport: {
        type: "stdio",
        command: "synthetic-private-command",
        env: { KEY: "synthetic-private-value" },
      },
    });
    const value = await fixture(true, undefined, {
      mcpServers: [existing],
      futureRoot: "preserved",
    });
    const before = readFileSync(value.authority.settingsPath, "utf8"),
      sequence = value.authority.snapshot().sequence;
    const metadata = { serverId: "exact-id", name: "new-name" };
    const checked = await value.execute({ action: "mcp-check-add", ...metadata });
    expect(checked).toEqual({ formatVersion: 1, scope: "saved-user", checked: true, ...metadata });
    expect(JSON.stringify(checked)).not.toContain("synthetic-private");
    expect(value.authority.snapshot().sequence).toBe(sequence);
    expect(readFileSync(value.authority.settingsPath, "utf8")).toBe(before);
    for (const collision of [
      { serverId: existing.id, name: "other-name" },
      { serverId: "other-id", name: "EXISTING-NAME" },
    ])
      await expect(value.execute({ action: "mcp-check-add", ...collision })).rejects.toThrow(
        "already uses this ID or name",
      );
    expect(readFileSync(value.authority.settingsPath, "utf8")).toBe(before);
    const raced = { ...existing, id: metadata.serverId, name: metadata.name };
    await value.writes.editSettingsField("mcpServers", () => [existing, raced]);
    const racedBytes = readFileSync(value.authority.settingsPath, "utf8");
    await expect(value.execute({ action: "mcp-add", server: raced })).rejects.toThrow(
      "already uses this ID",
    );
    expect(readFileSync(value.authority.settingsPath, "utf8")).toBe(racedBytes);
    expect(value.call).not.toHaveBeenCalled();
  });

  it.each(["target-change", "target-remove", "neighbor-change"] as const)(
    "rechecks MCP replacement on the fresh CAS snapshot (%s)",
    async (race) => {
      const server = mcpServerSchema.parse({
        id: "exact-id",
        name: "fixture-server",
        transport: { type: "stdio", command: "fixture" },
      });
      const value = await fixture(true, undefined, { mcpServers: [server] });
      const prepared = hostAdminMcpPreparationSchema.parse(
        await value.execute({ action: "mcp-prepare-configuration", serverId: server.id }),
      );
      const stale = value.authority.snapshot([{ kind: "field", field: "mcpServers" }]);
      const raced =
        race === "target-remove"
          ? []
          : race === "target-change"
            ? [{ ...server, name: "raced" }]
            : [server, { ...server, id: "neighbor", name: "neighbor" }];
      await value.writes.editSettingsField("mcpServers", () => raced);
      const before = readFileSync(value.authority.settingsPath, "utf8");
      const snapshots = vi.spyOn(value.authority, "snapshot").mockImplementationOnce(() => stale);
      const pending = value.execute({
        action: "mcp-configure-checked",
        server: { ...server, name: "replacement" },
        expectedServerRevision: prepared.serverRevision,
      });
      const observation = pending.then(
        () => ({
          servers: value.authority.readSettings().mcpServers,
        }),
        (error: Error) => ({
          error: error.message,
          bytes: readFileSync(value.authority.settingsPath, "utf8"),
        }),
      );
      const expectedError = expect.stringContaining(
        race === "target-remove" ? "exact ID" : "server changed",
      );
      expect(await observation).toEqual(
        race === "neighbor-change"
          ? {
              servers: [
                { ...server, name: "replacement" },
                { ...server, id: "neighbor", name: "neighbor" },
              ],
            }
          : {
              error: expectedError,
              bytes: before,
            },
      );
      expect(snapshots.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(value.call).not.toHaveBeenCalled();
    },
  );

  it("binds replacement revisions to the exact server and administration lifetime", async () => {
    const server = mcpServerSchema.parse({
      id: "exact-id",
      name: "fixture-server",
      transport: { type: "stdio", command: "fixture" },
    });
    const value = await fixture(true, undefined, {
      mcpServers: [server, { ...server, id: "other", name: "other" }],
    });
    const prepared = hostAdminMcpPreparationSchema.parse(
      await value.execute({ action: "mcp-prepare-configuration", serverId: server.id }),
    );
    await expect(
      value.execute({
        action: "mcp-configure-checked",
        server: { ...server, id: "other" },
        expectedServerRevision: prepared.serverRevision,
      }),
    ).rejects.toThrow("server changed");
    const otherHost = await fixture(true, undefined, { mcpServers: [server] });
    await expect(
      otherHost.execute({
        action: "mcp-configure-checked",
        server,
        expectedServerRevision: prepared.serverRevision,
      }),
    ).rejects.toThrow("server changed");
    expect(otherHost.authority.readSettings().mcpServers).toEqual([server]);
  });

  it("refuses private definition operations on an older owner without stopping it", async () => {
    const value = await fixture(false);
    const server = mcpServerSchema.parse({
      id: "exact-id",
      name: "fixture-server",
      transport: { type: "stdio", command: "fixture" },
    });
    for (const command of [
      { action: "mcp-add", server },
      { action: "mcp-prepare-configuration", serverId: server.id },
      { action: "mcp-configure-checked", server, expectedServerRevision: "ab".repeat(32) },
    ] as const)
      await expect(value.execute(command)).rejects.toThrow("does not support CLI administration");
    expect(value.authority.readSettings().mcpServers).toEqual([]);
    expect(value.call).not.toHaveBeenCalled();
    value.owner.lease.assertActive();
  });

  it.each(["overloaded", "conflict"] as const)(
    "does not acknowledge an uncommitted full definition (%s)",
    async (status) => {
      const value = await fixture();
      const server = mcpServerSchema.parse({
        id: "exact-id",
        name: "fixture-server",
        transport: { type: "stdio", command: "fixture" },
      });
      const before = readFileSync(value.authority.settingsPath, "utf8");
      vi.spyOn(value.writes, "editSettingsField").mockResolvedValueOnce(
        status === "overloaded"
          ? { status, authorityId: value.authority.authorityId, sequence: 0, reason: "queue-full" }
          : {
              status,
              authorityId: value.authority.authorityId,
              sequence: 0,
              reason: "revision-changed",
              current: [],
              revisions: {},
            },
      );
      await expect(value.execute({ action: "mcp-add", server })).rejects.toThrow(
        `not committed (${status})`,
      );
      expect(readFileSync(value.authority.settingsPath, "utf8")).toBe(before);
      expect(value.call).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    "changes only the exact saved MCP enabled flag and preserves credential/config/future fields (%s)",
    async (enabled) => {
      const server = mcpServerSchema.parse({
        id: "exact-id",
        name: "fixture-server",
        disabledTools: ["disabled-tool"],
        transport: {
          type: "http",
          url: "https://fixture.test/synthetic-private-path?token=synthetic-query",
          headers: { Authorization: "synthetic-header" },
        },
      });
      const neighbor = { ...server, id: "neighbor", name: "neighbor" };
      const value = await fixture(true, undefined, {
        mcpServers: [
          {
            ...server,
            futureServer: { keep: true },
            transport: { ...server.transport, futureTransport: { keep: true } },
          },
          neighbor,
        ],
        futureRoot: { keep: true },
        enabledMcpServers: { crossagents: true, "exact-id": true, neighbor: false },
      });
      const before = JSON.parse(readFileSync(value.authority.settingsPath, "utf8"));
      expect(
        await value.execute({ action: "mcp-set-enabled", serverId: "exact-id", enabled }),
      ).toEqual({
        formatVersion: 1,
        scope: "saved-user",
        change: "set-enabled",
        serverId: "exact-id",
        enabled,
      });
      const after = JSON.parse(readFileSync(value.authority.settingsPath, "utf8"));
      expect(after.mcpServers[0]).toEqual({ ...before.mcpServers[0], enabled });
      expect(after.mcpServers[1]).toEqual(before.mcpServers[1]);
      expect(after.futureRoot).toEqual(before.futureRoot);
      expect(after.enabledMcpServers).toEqual(before.enabledMcpServers);
      expect(value.call).not.toHaveBeenCalled();
    },
  );

  it("removes only exact saved configuration while keeping other servers and selection preferences", async () => {
    const server = mcpServerSchema.parse({
      id: " exact id ",
      name: "fixture-server",
      transport: { type: "stdio", command: "synthetic-command", env: { KEY: "synthetic-secret" } },
    });
    const neighbor = { ...server, id: "neighbor", name: "neighbor" };
    const value = await fixture(true, undefined, {
      mcpServers: [server, { ...neighbor, futureNeighbor: true }],
      enabledMcpServers: { crossagents: true, " exact id ": true },
      futureRoot: "preserved",
    });
    const before = JSON.parse(readFileSync(value.authority.settingsPath, "utf8"));
    const result = await value.execute({ action: "mcp-remove", serverId: " exact id " });
    expect(result).toEqual({
      formatVersion: 1,
      scope: "saved-user",
      change: "remove",
      serverId: " exact id ",
    });
    expect(JSON.stringify(result)).not.toContain("synthetic-");
    const after = JSON.parse(readFileSync(value.authority.settingsPath, "utf8"));
    expect(after.mcpServers).toEqual([before.mcpServers[1]]);
    expect(after.enabledMcpServers).toEqual(before.enabledMcpServers);
    expect(after.futureRoot).toBe("preserved");
    expect(value.call).not.toHaveBeenCalled();
  });

  it.each(["mcp-set-enabled", "mcp-remove"] as const)(
    "refuses %s by display name or missing ID without writing",
    async (action) => {
      const server = mcpServerSchema.parse({
        id: "exact-id",
        name: "fixture-server",
        transport: { type: "stdio", command: "fixture" },
      });
      const value = await fixture(true, undefined, { mcpServers: [server] });
      const before = readFileSync(value.authority.settingsPath, "utf8");
      for (const serverId of ["fixture-server", "missing", " exact-id "])
        await expect(
          value.execute(
            action === "mcp-remove" ? { action, serverId } : { action, serverId, enabled: false },
          ),
        ).rejects.toThrow("exact ID");
      expect(readFileSync(value.authority.settingsPath, "utf8")).toBe(before);
      expect(value.call).not.toHaveBeenCalled();
    },
  );

  it.each(["mcp-set-enabled", "mcp-remove"] as const)(
    "leaves an older owner and saved MCP configuration intact on %s refusal",
    async (action) => {
      const server = mcpServerSchema.parse({
        id: "exact-id",
        name: "fixture-server",
        transport: { type: "stdio", command: "fixture" },
      });
      const value = await fixture(false, undefined, { mcpServers: [server] });
      const before = readFileSync(value.authority.settingsPath, "utf8");
      await expect(
        value.execute(
          action === "mcp-remove"
            ? { action, serverId: "exact-id" }
            : { action, serverId: "exact-id", enabled: false },
        ),
      ).rejects.toThrow("does not support CLI administration");
      expect(readFileSync(value.authority.settingsPath, "utf8")).toBe(before);
      expect(value.call).not.toHaveBeenCalled();
      value.owner.lease.assertActive();
    },
  );

  it("deduplicates MCP removal under the captured owner without removing a later record that reuses its ID", async () => {
    const server = mcpServerSchema.parse({
      id: "exact-id",
      name: "fixture-server",
      transport: { type: "stdio", command: "fixture" },
    });
    const value = await fixture(true, undefined, { mcpServers: [server] });
    const request = {
      requestId: randomUUID(),
      expectedGeneration: value.owner.lease.generation,
      payload: {
        adminVersion: HOST_ADMIN_V6_VERSION,
        command: { action: "mcp-remove" as const, serverId: "exact-id" },
      },
    } as const;
    const first = await callHostControl(value.owner.lease.paths, "admin", request);
    expect(first.result).toEqual({
      adminVersion: 6,
      outcome: {
        ok: true,
        data: { formatVersion: 1, scope: "saved-user", change: "remove", serverId: "exact-id" },
      },
    });
    await value.writes.editSettingsField("mcpServers", () => [{ ...server, name: "replacement" }]);
    const before = readFileSync(value.authority.settingsPath, "utf8");
    expect((await callHostControl(value.owner.lease.paths, "admin", request)).result).toEqual(
      first.result,
    );
    await expect(
      callHostControl(value.owner.lease.paths, "admin", {
        ...request,
        expectedGeneration: randomUUID(),
      }),
    ).rejects.toThrow("owner changed");
    expect(readFileSync(value.authority.settingsPath, "utf8")).toBe(before);
    expect(value.authority.readSettings().mcpServers[0]?.name).toBe("replacement");
    expect(value.call).not.toHaveBeenCalled();
  });

  it("recomputes an MCP toggle on the fresh CAS snapshot without reverting raced configuration or neighbors", async () => {
    const server = mcpServerSchema.parse({
      id: "exact-id",
      name: "fixture-server",
      transport: { type: "stdio", command: "initial" },
    });
    const value = await fixture(true, undefined, { mcpServers: [server] });
    const stale = value.authority.snapshot([{ kind: "field", field: "mcpServers" }]);
    await value.writes.editSettingsField("mcpServers", () => [
      { ...server, transport: { type: "stdio", command: "new-command", args: [], env: {} } },
      { ...server, id: "neighbor", name: "neighbor" },
    ]);
    const snapshots = vi.spyOn(value.authority, "snapshot").mockImplementationOnce(() => stale);
    await value.execute({ action: "mcp-set-enabled", serverId: "exact-id", enabled: false });
    expect(value.authority.readSettings().mcpServers).toMatchObject([
      { id: "exact-id", enabled: false, transport: { command: "new-command" } },
      { id: "neighbor" },
    ]);
    expect(snapshots.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(value.call).not.toHaveBeenCalled();
  });

  it("refuses an MCP change when the target disappears before a rebased attempt", async () => {
    const server = mcpServerSchema.parse({
      id: "exact-id",
      name: "fixture-server",
      transport: { type: "stdio", command: "fixture" },
    });
    const value = await fixture(true, undefined, { mcpServers: [server] });
    const stale = value.authority.snapshot([{ kind: "field", field: "mcpServers" }]);
    await value.writes.editSettingsField("mcpServers", () => []);
    const before = readFileSync(value.authority.settingsPath, "utf8");
    const snapshots = vi.spyOn(value.authority, "snapshot").mockImplementationOnce(() => stale);
    await expect(
      value.execute({ action: "mcp-set-enabled", serverId: "exact-id", enabled: false }),
    ).rejects.toThrow("exact ID");
    expect(readFileSync(value.authority.settingsPath, "utf8")).toBe(before);
    expect(snapshots.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it.each(["overloaded", "conflict"] as const)(
    "reports an uncommitted MCP change without success or provider effects (%s)",
    async (status) => {
      const server = mcpServerSchema.parse({
        id: "exact-id",
        name: "fixture-server",
        transport: { type: "stdio", command: "fixture" },
      });
      const value = await fixture(true, undefined, { mcpServers: [server] });
      const before = readFileSync(value.authority.settingsPath, "utf8");
      vi.spyOn(value.writes, "editSettingsField").mockResolvedValueOnce(
        status === "overloaded"
          ? { status, authorityId: value.authority.authorityId, sequence: 0, reason: "queue-full" }
          : {
              status,
              authorityId: value.authority.authorityId,
              sequence: 0,
              reason: "revision-changed",
              current: [],
              revisions: {},
            },
      );
      await expect(value.execute({ action: "mcp-remove", serverId: "exact-id" })).rejects.toThrow(
        `not committed (${status})`,
      );
      expect(readFileSync(value.authority.settingsPath, "utf8")).toBe(before);
      expect(value.call).not.toHaveBeenCalled();
    },
  );
  it("lists the owner's canonical profile definitions without provider detection or config writes", async () => {
    const value = await fixture();
    const before = value.authority.snapshot().sequence;
    expect(await value.execute({ action: "providers-drivers" })).toEqual({
      formatVersion: 1,
      scope: "saved-profile-drivers",
      drivers: AGENT_PROFILE_DRIVERS.map((driver) => ({
        id: driver.driver,
        credentialEnvironmentName: driver.credentialEnvVar ?? null,
      })),
    });
    expect(value.call).not.toHaveBeenCalled();
    expect(value.authority.snapshot().sequence).toBe(before);
  });

  it("checks creation without storing a profile or sealing placeholders", async () => {
    const value = await fixture();
    const before = value.authority.snapshot().sequence;
    const result = await value.execute({
      action: "providers-check-add",
      profile: {
        id: "work",
        driver: "codex",
        displayName: "Work",
        config: { homeDir: "~/.fixture-profile" },
      },
      environmentNames: ["KEY", "constructor"],
    });
    expect(result).toEqual({ checked: true, profileId: "work", driver: "codex" });
    expect(JSON.stringify(result)).not.toContain("homeDir");
    expect(value.authority.readSettings().agentInstances.work).toBeUndefined();
    expect(value.authority.snapshot().sequence).toBe(before);
    expect(value.call).not.toHaveBeenCalled();
  });

  it("refuses creation checks when the owner cannot persist secrets without saving a placeholder", async () => {
    const unavailable = new Error("fixture credential persistence unavailable");
    const guard = vi.fn<() => never>(() => {
      throw unavailable;
    });
    const value = await fixture(true, guard);
    const before = value.authority.snapshot().sequence;
    await expect(
      value.execute({
        action: "providers-check-add",
        profile: { id: "work", driver: "cursor", displayName: "Work" },
        environmentNames: ["CURSOR_API_KEY"],
      }),
    ).rejects.toThrow(unavailable.message);
    expect(guard).toHaveBeenCalledOnce();
    expect(value.authority.snapshot().sequence).toBe(before);
    expect(value.authority.readSettings().agentInstances.work).toBeUndefined();
    expect(value.call).not.toHaveBeenCalled();
  });

  it.each(["providers-drivers", "providers-check-add"] as const)(
    "leaves an older owner running on %s refusal",
    async (action) => {
      const value = await fixture(false);
      await expect(
        value.execute(
          action === "providers-drivers"
            ? { action }
            : {
                action,
                profile: { id: "work", driver: "cursor", displayName: "Work" },
                environmentNames: ["CURSOR_API_KEY"],
              },
        ),
      ).rejects.toThrow("does not support CLI administration");
      expect(value.call).not.toHaveBeenCalled();
      expect(value.authority.readSettings().agentInstances.work).toBeUndefined();
      value.owner.lease.assertActive();
    },
  );

  it.each([
    { driver: "codex", displayName: "Work" },
    { driver: "fixture-unknown", displayName: "Work" },
    { driver: "cursor", displayName: "Work" },
  ])(
    "refuses missing driver config, unsupported driver or unsupported variable names before creation (%j)",
    async (profile) => {
      const value = await fixture();
      const before = value.authority.snapshot().sequence;
      await expect(
        value.execute({
          action: "providers-check-add",
          profile: { id: "work", ...profile },
          environmentNames: ["WRONG_KEY"],
        }),
      ).rejects.toThrow(Error);
      expect(value.authority.readSettings().agentInstances.work).toBeUndefined();
      expect(value.authority.snapshot().sequence).toBe(before);
      expect(value.call).not.toHaveBeenCalled();
    },
  );

  it("rechecks duplicate IDs instead of reserving or replacing a checked profile", async () => {
    const value = await fixture();
    const profile = {
      id: "work",
      driver: "codex",
      displayName: "Work",
      config: { homeDir: "~/.fixture-profile" },
    };
    await value.execute({ action: "providers-check-add", profile, environmentNames: ["KEY"] });
    await value.execute({ action: "providers-add", profile });
    const before = readFileSync(value.authority.settingsPath, "utf8");
    await expect(
      value.execute({ action: "providers-check-add", profile, environmentNames: ["KEY"] }),
    ).rejects.toThrow("already exists");
    await expect(value.execute({ action: "providers-add", profile })).rejects.toThrow(
      "already exists",
    );
    expect(readFileSync(value.authority.settingsPath, "utf8")).toBe(before);
  });

  it("refuses a new dangling dependency in the existing v1 add writer without changing its neighbor", async () => {
    const value = await fixture();
    await value.execute({
      action: "providers-add",
      profile: {
        id: "neighbor",
        driver: "codex",
        displayName: "Neighbor",
        config: { homeDir: "~/.neighbor" },
      },
    });
    const before = readFileSync(value.authority.settingsPath, "utf8");
    await expect(
      value.execute({
        action: "providers-add",
        profile: {
          id: "dependent",
          driver: "devin",
          displayName: "Dependent",
          config: { format: 2, auth: { kind: "owner-reference", ownerId: "missing" } },
        },
      }),
    ).rejects.toThrow(Error);
    expect(readFileSync(value.authority.settingsPath, "utf8")).toBe(before);
  });

  it.each(["remove", "disable"] as const)(
    "rejects final creation if its owner changes after preflight (%s)",
    async (change) => {
      const value = await fixture();
      await value.writes.editSettingsField("agentInstances", () => ({
        owner: {
          id: "owner",
          driver: "devin",
          displayName: "Owner",
          config: { format: 2, auth: { kind: "isolated-owner" } },
        },
      }));
      const profile = {
        id: "dependent",
        driver: "devin",
        displayName: "Dependent",
        config: { format: 2, auth: { kind: "owner-reference", ownerId: "owner" } },
      };
      await value.execute({ action: "providers-check-add", profile, environmentNames: ["KEY"] });
      if (change === "remove")
        await value.execute({ action: "providers-remove", instanceId: "owner" });
      else
        await value.execute({ action: "providers-configure", instanceId: "owner", enabled: false });
      const before = readFileSync(value.authority.settingsPath, "utf8");
      await expect(
        value.execute({
          action: "providers-add",
          profile: { ...profile, environment: { KEY: { value: "synthetic-do-not-save" } } },
        }),
      ).rejects.toThrow(Error);
      expect(value.authority.readSettings().agentInstances.dependent).toBeUndefined();
      expect(readFileSync(value.authority.settingsPath, "utf8")).toBe(before);
      expect(value.call).not.toHaveBeenCalled();
    },
  );

  it("discards the preflight snapshot and preserves later unrelated profiles on final creation", async () => {
    const value = await fixture();
    const profile = {
      id: "work",
      driver: "codex",
      displayName: "Work",
      config: { homeDir: "~/.fixture-profile" },
    };
    await value.execute({ action: "providers-check-add", profile, environmentNames: ["KEY"] });
    await value.execute({
      action: "providers-add",
      profile: { ...profile, id: "neighbor", displayName: "Keep" },
    });
    await value.execute({
      action: "providers-add",
      profile: { ...profile, environment: { KEY: { value: "synthetic-sealed-key" } } },
    });
    const settings = value.authority.readSettings();
    expect(settings.agentInstances.neighbor!.displayName).toBe("Keep");
    expect(decryptSecret("", settings.agentInstances.work!.environment!.KEY!.value)).toBe(
      "synthetic-sealed-key",
    );
  });

  it("uses the existing plugin RPCs, keeps reads outside receipt capacity and deduplicates a rescan", async () => {
    const value = await fixture();
    value.call.mockResolvedValue({
      plugins: [
        {
          name: "fixture-plugin",
          source: "user",
          root: "synthetic-private-root",
          manifest: {
            $schema: AGENT_PLUGINS_MANIFEST_SCHEMA_URL,
            name: "fixture-plugin",
            version: "1.0.0",
          },
          poracode: EMPTY_PORACODE_EXTENSION,
          skills: [],
          mcpServers: [
            {
              name: "fixture-server",
              entry: { type: "stdio", command: "synthetic-secret-command" },
            },
          ],
          diagnostics: [
            {
              severity: "warning",
              scope: "plugin",
              code: "fixture",
              message: "synthetic-secret-diagnostic",
            },
          ],
        },
      ],
      userPluginsDir: "synthetic-private-directory",
    } as never);
    await value.writes.editSettingsField("installedPlugins", () => ({
      "fixture-plugin": {
        version: "1.0.0",
        enabled: false,
        disabledSkillIds: [],
        disabledMcpServerNames: [],
      },
    }));
    const before = readFileSync(value.authority.settingsPath, "utf8");
    const inventory = {
      formatVersion: 1,
      scope: "global",
      plugins: [
        {
          name: "fixture-plugin",
          version: "1.0.0",
          source: "user",
          installed: true,
          enabled: false,
          hostSupported: true,
          skillCount: 0,
          mcpServerNames: ["fixture-server"],
          errorCount: 0,
          warningCount: 1,
        },
      ],
    };
    for (let index = 0; index < 70; index++)
      expect(await value.execute({ action: "plugins-list" })).toEqual(inventory);
    expect(
      value.call.mock.calls.every(
        ([name, payload]) => name === "listPlugins" && JSON.stringify(payload) === "{}",
      ),
    ).toBe(true);
    value.call.mockClear();
    const request = {
      requestId: randomUUID(),
      expectedGeneration: value.owner.lease.generation,
      payload: {
        adminVersion: HOST_ADMIN_V4_VERSION,
        command: { action: "plugins-refresh" as const },
      },
    } as const;
    for (let index = 0; index < 2; index++) {
      const result = await callHostControl(value.owner.lease.paths, "admin", request);
      expect(result.result).toEqual({ adminVersion: 4, outcome: { ok: true, data: inventory } });
      expect(JSON.stringify(result.result)).not.toContain("synthetic-");
    }
    expect(value.call).toHaveBeenCalledExactlyOnceWith("refreshPlugins", {});
    await expect(
      callHostControl(value.owner.lease.paths, "admin", {
        ...request,
        requestId: randomUUID(),
        expectedGeneration: randomUUID(),
      }),
    ).rejects.toThrow("owner changed");
    expect(value.call).toHaveBeenCalledTimes(1);
    expect(readFileSync(value.authority.settingsPath, "utf8")).toBe(before);
    value.owner.lease.assertActive();
  });

  it("reads the desktop MCP store without exposing configuration values, connecting or calling service auth", async () => {
    const value = await fixture();
    const server = mcpServerSchema.parse({
      id: "exact-id",
      name: "fixture-server",
      transport: {
        type: "http",
        url: "https://fixture.test/synthetic-secret-path?token=synthetic-secret-query",
        headers: { Authorization: "synthetic-secret-header" },
      },
    });
    await value.writes.editSettingsField("mcpServers", () => [server]);
    const before = readFileSync(value.authority.settingsPath, "utf8");
    const listed = await value.execute({ action: "mcp-list" });
    expect(listed).toEqual({
      formatVersion: 1,
      scope: "saved-user",
      servers: [
        {
          id: "exact-id",
          name: "fixture-server",
          enabled: true,
          transport: "http",
          timeoutMs: 30_000,
          disabledToolCount: 0,
        },
      ],
    });
    const inspected = await value.execute({ action: "mcp-inspect", serverId: "exact-id" });
    expect(inspected).toMatchObject({
      scope: "saved-user",
      server: {
        id: "exact-id",
        environmentNames: [],
        headerNames: ["Authorization"],
        disabledTools: [],
      },
    });
    expect(JSON.stringify([listed, inspected])).not.toContain("synthetic-");
    await expect(
      value.execute({ action: "mcp-inspect", serverId: "fixture-server" }),
    ).rejects.toThrow("exact ID");
    expect(value.call).not.toHaveBeenCalled();
    expect(readFileSync(value.authority.settingsPath, "utf8")).toBe(before);
  });

  it.each(["plugins-list", "mcp-list"] as const)(
    "refuses %s on an older owner before integration effects",
    async (action) => {
      const value = await fixture(false);
      await expect(value.execute({ action })).rejects.toThrow(
        "does not support CLI administration",
      );
      expect(value.call).not.toHaveBeenCalled();
      value.owner.lease.assertActive();
    },
  );

  it("reports terminal preference without exposing provider method environments or changing the legacy command", async () => {
    const value = await fixture();
    const result = await value.execute({ action: "auth-methods", agentKind: "fixture" });
    expect(result).toMatchObject({
      terminalLogin: true,
      terminalPreferred: false,
      methods: [{ id: "key", name: "Key", type: "terminal" }],
    });
    expect(JSON.stringify(result)).not.toContain("synthetic-hidden-value");
    expect(value.call.mock.calls.map(([name]) => name)).toEqual(["refreshAgentStatuses"]);
  });
  it.each([undefined, "Ubuntu"])(
    "lists accounts for the exact provider and environment (%s) without extra adapter fields",
    async (wslDistro) => {
      const value = await fixture();
      const result = await value.execute({
        action: "auth-accounts",
        agentKind: "fixture",
        ...(wslDistro ? { wslDistro } : {}),
      });
      expect(result).toEqual({
        agentKind: "fixture",
        environment: wslDistro ? { kind: "wsl", distro: wslDistro } : { kind: "native" },
        providers: [
          { id: "fixture-account", label: "Fixture account", detail: "synthetic account" },
        ],
      });
      expect(value.call).toHaveBeenCalledWith("manageAgentCredentials", {
        agentKind: "fixture",
        action: "list",
        env: wslDistro ? { kind: "wsl", distro: wslDistro } : { kind: "native" },
      });
      expect(JSON.stringify(result)).not.toContain("never-return");
    },
  );

  it("refuses runtime-specific account inventory without falling back or calling a provider", async () => {
    const value = await fixture();
    await expect(
      value.execute({ action: "auth-accounts", agentKind: "fixture", runtime: "other" }),
    ).rejects.toThrow("cannot target a runtime variant");
    expect(value.call).not.toHaveBeenCalled();
  });

  it.each([undefined, "Ubuntu"])(
    "points unsupported logout to credential inventory without removing an account (%s)",
    async (wslDistro) => {
      const value = await fixture();
      await expect(
        value.execute({
          action: "auth-logout",
          agentKind: "fixture",
          ...(wslDistro ? { wslDistro } : {}),
        }),
      ).rejects.toThrow(
        "This provider does not support account logout. Use --credential <id> for an upstream account listed by auth accounts <provider>.",
      );
      expect(value.call.mock.calls.map(([name]) => name)).toEqual(["refreshAgentStatuses"]);
    },
  );

  it.each([{ agentKind: "missing" }, { agentKind: "fixture", wslDistro: "MissingDistro" }])(
    "does not list credentials for a different installed identity (%j)",
    async (target) => {
      const value = await fixture();
      await expect(value.execute({ action: "auth-accounts", ...target })).rejects.toThrow(
        "not installed in this environment",
      );
      expect(value.call.mock.calls.filter(([name]) => name === "manageAgentCredentials")).toEqual(
        [],
      );
    },
  );

  it.each([1, 2] as const)(
    "echoes admin version %s without widening outer capabilities",
    async (adminVersion) => {
      const value = await fixture();
      const result = await callHostControl(value.owner.lease.paths, "admin", {
        expectedGeneration: value.owner.lease.generation,
        payload: { adminVersion, command: { action: "clients-list" } },
      });
      expect(result.result).toEqual({ adminVersion, outcome: { ok: true, data: { clients: [] } } });
      expect(
        (await callHostControl(value.owner.lease.paths, "describe")).result.operations,
      ).toEqual(["describe", "issue-pairing"]);
    },
  );

  it("issues an independent labeled narrowed grant with matching inventory, expiry and one-time exchange", async () => {
    const value = await fixture();
    const info = await value.server.start();
    const before = Date.now();
    const grant = z
      .object({
        id: z.string(),
        pairingUrl: z.string(),
        expiresAt: z.string(),
        scopes: z.array(z.string()),
        label: z.string(),
      })
      .parse(
        await value.execute({
          action: "pairings-create",
          label: "Phone",
          scopes: ["session:read"],
          ttlMs: 10_000,
        }),
      );
    expect(grant.scopes).toEqual(["session:read"]);
    expect(Date.parse(grant.expiresAt)).toBeGreaterThanOrEqual(before + 10_000);
    expect(Date.parse(grant.expiresAt)).toBeLessThanOrEqual(Date.now() + 10_000);
    expect(value.server.getInfo()?.pairingUrl).toBe(info.pairingUrl);
    expect(value.server.listPairingCredentials()).toContainEqual({
      id: grant.id,
      scopes: ["session:read"],
      label: "Phone",
      expiresAt: grant.expiresAt,
    });
    const credential = new URLSearchParams(new URL(grant.pairingUrl).hash.slice(1)).get("token")!;
    expect(() =>
      value.authStore.exchangePairingCredential({ credential, scopes: ["session:operate"] }),
    ).toThrow("does not grant");
    expect(value.authStore.exchangePairingCredential({ credential }).scopes).toEqual([
      "session:read",
    ]);
    expect(() => value.authStore.exchangePairingCredential({ credential })).toThrow(
      "Invalid pairing token",
    );
    const desktopCredential = new URLSearchParams(new URL(info.pairingUrl).hash.slice(1)).get(
      "token",
    )!;
    expect(
      value.authStore.exchangePairingCredential({ credential: desktopCredential }).accessToken,
    ).toBeTruthy();
  });

  it("removes a profile and its scoped preferences while keeping a neighboring profile and sealed credentials", async () => {
    const value = await fixture();
    for (const id of ["work", "workshop"])
      await value.execute({
        action: "providers-add",
        profile: {
          id,
          driver: "cursor",
          displayName: id,
          environment: { CURSOR_API_KEY: { value: "synthetic-secret", sensitive: true } },
        },
      });
    await value.writes.editSettingsFields(["hiddenModels", "providerOrder"], () => ({
      hiddenModels: { "cursor:work": ["small"], "cursor:workshop": ["large"] },
      providerOrder: ["cursor:work", "cursor:workshop"],
    }));
    expect(await value.execute({ action: "providers-remove", instanceId: "work" })).toEqual({
      removed: "work",
    });
    const settings = value.authority.readSettings();
    expect(settings.agentInstances.work).toBeUndefined();
    expect(
      decryptSecret("", settings.agentInstances.workshop!.environment!.CURSOR_API_KEY!.value),
    ).toBe("synthetic-secret");
    expect(settings.hiddenModels).toEqual({ "cursor:workshop": ["large"] });
    expect(settings.providerOrder).toEqual(["cursor:workshop"]);
    expect(readFileSync(value.authority.settingsPath, "utf8")).not.toContain("synthetic-secret");
    await value.execute({
      action: "providers-unset-environment",
      instanceId: "workshop",
      names: ["CURSOR_API_KEY"],
    });
    expect(value.authority.readSettings().agentInstances.workshop!.environment).toBeUndefined();
  });

  it("refuses profile removal that would introduce a dangling dependency without rewriting settings", async () => {
    const value = await fixture();
    await value.writes.editSettingsField("agentInstances", () => ({
      owner: {
        id: "owner",
        driver: "devin",
        displayName: "Owner",
        config: { format: 2, auth: { kind: "isolated-owner" } },
      },
      dependent: {
        id: "dependent",
        driver: "devin",
        displayName: "Dependent",
        config: { format: 2, auth: { kind: "owner-reference", ownerId: "owner" } },
      },
    }));
    const before = readFileSync(value.authority.settingsPath, "utf8");
    await expect(
      value.execute({ action: "providers-remove", instanceId: "owner" }),
    ).rejects.toThrow(Error);
    expect(readFileSync(value.authority.settingsPath, "utf8")).toBe(before);
  });

  it("unsets one environment key while retaining its neighbor's sealed bytes", async () => {
    const value = await fixture();
    await value.execute({
      action: "providers-add",
      profile: {
        id: "work",
        driver: "claude",
        displayName: "Work",
        config: { configDir: join(value.namespace, "profile-config") },
        environment: {
          OLD_KEY: { value: "synthetic-old", sensitive: true },
          KEEP_KEY: { value: "synthetic-keep", sensitive: true },
        },
      },
    });
    const before = value.authority.readSettings().agentInstances.work!.environment!.KEEP_KEY;
    await value.execute({
      action: "providers-unset-environment",
      instanceId: "work",
      names: ["OLD_KEY"],
    });
    const after = value.authority.readSettings().agentInstances.work!.environment!;
    expect(after.OLD_KEY).toBeUndefined();
    expect(after.KEEP_KEY).toEqual(before);
    expect(decryptSecret("", after.KEEP_KEY!.value)).toBe("synthetic-keep");
    expect(readFileSync(value.authority.settingsPath, "utf8")).not.toContain("synthetic-keep");
  });
  it("does not report a different runtime's account when selected-runtime identity is absent", async () => {
    const value = await fixture();
    value.call.mockResolvedValueOnce({
      windows: [
        {
          kind: "fixture",
          installed: true,
          providerMetadata: { authenticatedAs: "another-runtime@example.test" },
          runtimeVariants: {
            cli: {
              installed: true,
              authUsesProviderLogin: true,
              authState: "missing",
              loginCommand: "fixture login",
            },
          },
        },
      ],
      wsl: [],
      fromCache: false,
    } as never);
    const result = await value.execute({
      action: "auth-methods",
      agentKind: "fixture",
      runtime: "cli",
    });
    expect(result).toMatchObject({ provider: { authState: "missing" } });
    expect(JSON.stringify(result)).not.toContain("another-runtime@example.test");
  });
  it("refuses a new profile whose provider-required configuration is missing", async () => {
    const value = await fixture();
    await expect(
      value.execute({
        action: "providers-add",
        profile: { id: "invalid", driver: "codex", displayName: "Invalid" },
      }),
    ).rejects.toThrow("homeDir");
    expect(value.authority.readSettings().agentInstances.invalid).toBeUndefined();
  });

  it("accepts a sealed profile environment larger than the legacy control message limit", async () => {
    const value = await fixture();
    await expect(
      value.execute({
        action: "providers-add",
        profile: {
          id: "large",
          driver: "codex",
          displayName: "Large",
          config: { homeDir: "~/.large" },
          environment: { FIXTURE_KEY: { value: "x".repeat(5000) } },
        },
      }),
    ).resolves.toMatchObject({ saved: true });
    expect(
      value.authority.readSettings().agentInstances.large?.environment?.FIXTURE_KEY?.value,
    ).not.toContain("x".repeat(100));
  });

  it.each([false, true])(
    "uses runtime logout controls, inheriting root controls only when absent: %s",
    async (inherited) => {
      const value = await fixture();
      value.call.mockResolvedValueOnce({
        windows: [
          {
            kind: "fixture",
            installed: true,
            authLogoutSupported: true,
            runtimeVariants: {
              cli: {
                installed: true,
                authUsesProviderLogin: true,
                ...(inherited ? {} : { loginCommand: "fixture login" }),
              },
            },
          },
        ],
        wsl: [],
        fromCache: false,
      } as never);
      const logout = value.execute({ action: "auth-logout", agentKind: "fixture", runtime: "cli" });
      const result = await logout.then(
        (data) => data,
        (error: unknown) => ({ error: error instanceof Error ? error.message : "Unknown error" }),
      );
      expect(result).toMatchObject(
        inherited
          ? { loggedOut: true }
          : {
              error:
                "The selected runtime does not support this logout operation. Use auth methods to inspect its account controls.",
            },
      );
      expect(value.call.mock.calls.some(([name]) => name === "logoutAcpAgent")).toBe(inherited);
    },
  );
  it("creates and configures the desktop profile store with sealed credentials and preserved neighbors", async () => {
    const value = await fixture();
    const original = value.authority.readSettings();
    await value.execute({
      action: "providers-add",
      profile: {
        id: "work",
        driver: "codex",
        displayName: "Work",
        config: { homeDir: "~/.fixture-work" },
        environment: { FIXTURE_KEY: { value: "synthetic-account-secret" } },
      },
    });
    await value.execute({
      action: "providers-configure",
      instanceId: "work",
      displayName: "Office",
      environment: { SECOND_KEY: "second-synthetic-secret" },
    });
    const saved = value.authority.readSettings();
    expect(saved.agentInstances.work?.displayName).toBe("Office");
    expect(saved.agentInstances.work?.environment?.FIXTURE_KEY?.value).toMatch(/^lc-safe:/u);
    expect(decryptSecret("", saved.agentInstances.work!.environment!.FIXTURE_KEY!.value)).toBe(
      "synthetic-account-secret",
    );
    expect(saved.mcpServers).toEqual(original.mcpServers);
    expect(readFileSync(value.authority.settingsPath, "utf8")).not.toContain(
      "synthetic-account-secret",
    );
    const listing = await value.execute({ action: "providers-list" });
    expect(JSON.stringify(listing)).not.toContain("lc-safe:");
    expect(JSON.stringify(listing)).not.toContain("synthetic-hidden-value");
    expect(listing).toMatchObject({
      providers: [
        { kind: "fixture", providerMetadata: { authenticatedAs: "fixture@example.test" } },
      ],
      profiles: [
        { id: "work", displayName: "Office", environmentNames: ["FIXTURE_KEY", "SECOND_KEY"] },
      ],
    });
    await expect(
      value.execute({
        action: "providers-add",
        profile: {
          id: "work",
          driver: "codex",
          displayName: "Duplicate",
          config: { homeDir: "~/.fixture-work" },
        },
      }),
    ).rejects.toThrow("already exists");
  });

  it("prepares a read-only opaque revision and seals a checked edit without returning profile secrets", async () => {
    const value = await fixture();
    await value.execute({
      action: "providers-add",
      profile: {
        id: "work",
        driver: "codex",
        displayName: "Work",
        config: { homeDir: "~/.fixture-work" },
        environment: { FIXTURE_KEY: { value: "synthetic-old-secret" } },
      },
    });
    const before = readFileSync(value.authority.settingsPath, "utf8");
    const prepared = hostAdminProfilePreparationSchema.parse(
      await value.execute({ action: "providers-prepare-configuration", instanceId: "work" }),
    );
    expect(prepared).toEqual({
      profileId: "work",
      driver: "codex",
      displayName: "Work",
      profileRevision: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(readFileSync(value.authority.settingsPath, "utf8")).toBe(before);
    expect(JSON.stringify(prepared)).not.toMatch(/synthetic-|lc-safe:|homeDir/u);
    for (let index = 0; index < 70; index++)
      expect(
        await value.execute({ action: "providers-prepare-configuration", instanceId: "work" }),
      ).toEqual(prepared);
    expect(
      await value.execute({
        action: "providers-configure-checked",
        instanceId: "work",
        expectedProfileRevision: prepared.profileRevision,
        environment: { FIXTURE_KEY: "synthetic-new-secret" },
      }),
    ).toEqual({ profileId: "work", saved: true });
    const saved = value.authority.readSettings().agentInstances.work!.environment!.FIXTURE_KEY!;
    expect(saved.sensitive).toBe(true);
    expect(saved.value).toMatch(/^lc-safe:/u);
    expect(decryptSecret("", saved.value)).toBe("synthetic-new-secret");
    expect(readFileSync(value.authority.settingsPath, "utf8")).not.toContain(
      "synthetic-new-secret",
    );
    await expect(
      value.execute({
        action: "providers-configure-checked",
        instanceId: "work",
        expectedProfileRevision: prepared.profileRevision,
        environment: { FIXTURE_KEY: "late-secret" },
      }),
    ).rejects.toThrow("profile changed");
  });

  it.each(["config", "driver", "environment", "delete"] as const)(
    "refuses a changed selected profile before saving keys (%s)",
    async (change) => {
      const value = await fixture();
      await value.execute({
        action: "providers-add",
        profile: {
          id: "work",
          driver: "codex",
          displayName: "Work",
          config: { homeDir: "~/.fixture-work" },
        },
      });
      const prepared = hostAdminProfilePreparationSchema.parse(
        await value.execute({ action: "providers-prepare-configuration", instanceId: "work" }),
      );
      await value.writes.editSettingsField("agentInstances", (current) => {
        if (change === "delete")
          return Object.fromEntries(
            Object.entries(current.agentInstances).filter(([id]) => id !== "work"),
          );
        const work = current.agentInstances.work!;
        return {
          ...current.agentInstances,
          work: {
            ...work,
            ...(change === "config" ? { config: { homeDir: "~/.different-account" } } : {}),
            ...(change === "driver" ? { driver: "cursor" } : {}),
            ...(change === "environment"
              ? { environment: { FIXTURE_ENDPOINT: { value: "different-endpoint" } } }
              : {}),
          },
        };
      });
      const before = readFileSync(value.authority.settingsPath, "utf8");
      await expect(
        value.execute({
          action: "providers-configure-checked",
          instanceId: "work",
          expectedProfileRevision: prepared.profileRevision,
          environment: { FIXTURE_KEY: "synthetic-do-not-save" },
        }),
      ).rejects.toThrow(change === "delete" ? "does not exist" : "profile changed");
      expect(readFileSync(value.authority.settingsPath, "utf8")).toBe(before);
    },
  );

  it.each([false, true])(
    "rechecks the profile on a fresh CAS attempt, preserving an unrelated edit or refusing a changed target (%s)",
    async (changeTarget) => {
      const value = await fixture();
      await value.execute({
        action: "providers-add",
        profile: {
          id: "work",
          driver: "codex",
          displayName: "Work",
          config: { homeDir: "~/.fixture-work" },
        },
      });
      const prepared = hostAdminProfilePreparationSchema.parse(
        await value.execute({ action: "providers-prepare-configuration", instanceId: "work" }),
      );
      const stale = value.authority.snapshot([{ kind: "field", field: "agentInstances" }]);
      await value.writes.editSettingsField("agentInstances", (current) => ({
        ...current.agentInstances,
        ...(changeTarget
          ? {
              work: {
                ...current.agentInstances.work!,
                config: { homeDir: "~/.different-account" },
              },
            }
          : {
              neighbor: {
                id: "neighbor",
                driver: "codex",
                displayName: "Keep",
                config: { homeDir: "~/.neighbor" },
              },
            }),
      }));
      const before = readFileSync(value.authority.settingsPath, "utf8");
      const snapshots = vi.spyOn(value.authority, "snapshot").mockImplementationOnce(() => stale);
      const update = value.execute({
        action: "providers-configure-checked",
        instanceId: "work",
        expectedProfileRevision: prepared.profileRevision,
        environment: { FIXTURE_KEY: "synthetic-new-secret" },
      });
      const observation = update.then(
        (result) => ({
          result,
          neighbor: value.authority.readSettings().agentInstances.neighbor?.displayName,
          secret: decryptSecret(
            "",
            value.authority.readSettings().agentInstances.work!.environment!.FIXTURE_KEY!.value,
          ),
        }),
        (error: Error) => ({
          error: error.message,
          bytes: readFileSync(value.authority.settingsPath, "utf8"),
        }),
      );
      const expectedError = expect.stringContaining("profile changed");
      expect(await observation).toEqual(
        changeTarget
          ? { error: expectedError, bytes: before }
          : {
              result: { profileId: "work", saved: true },
              neighbor: "Keep",
              secret: "synthetic-new-secret",
            },
      );
      expect(snapshots.mock.calls.length).toBeGreaterThanOrEqual(2);
    },
  );

  it("refuses revisions for another profile, unknown revisions and a previous host instance", async () => {
    const value = await fixture();
    for (const id of ["work", "other"])
      await value.execute({
        action: "providers-add",
        profile: { id, driver: "codex", displayName: id, config: { homeDir: "~/.fixture" } },
      });
    const prepared = hostAdminProfilePreparationSchema.parse(
      await value.execute({ action: "providers-prepare-configuration", instanceId: "work" }),
    );
    const before = readFileSync(value.authority.settingsPath, "utf8");
    for (const [instanceId, expectedProfileRevision] of [
      ["other", prepared.profileRevision],
      ["work", "00".repeat(32)],
    ] as const)
      await expect(
        value.execute({
          action: "providers-configure-checked",
          instanceId,
          expectedProfileRevision,
          displayName: "Do not save",
        }),
      ).rejects.toThrow("profile changed");
    expect(readFileSync(value.authority.settingsPath, "utf8")).toBe(before);
    const otherHost = await fixture();
    await otherHost.writes.editSettingsField(
      "agentInstances",
      () => value.authority.readSettings().agentInstances,
    );
    const otherPrepared = hostAdminProfilePreparationSchema.parse(
      await otherHost.execute({ action: "providers-prepare-configuration", instanceId: "work" }),
    );
    expect(otherPrepared.profileRevision).not.toBe(prepared.profileRevision);
    await expect(
      otherHost.execute({
        action: "providers-configure-checked",
        instanceId: "work",
        expectedProfileRevision: prepared.profileRevision,
        displayName: "Do not save",
      }),
    ).rejects.toThrow("profile changed");
    expect(otherHost.authority.readSettings().agentInstances.work!.displayName).toBe("work");
  });

  it("refuses preparation on an older owner without provider effects or owner shutdown", async () => {
    const value = await fixture(false);
    await expect(
      value.execute({ action: "providers-prepare-configuration", instanceId: "work" }),
    ).rejects.toThrow("does not support CLI administration");
    expect(value.call).not.toHaveBeenCalled();
    value.owner.lease.assertActive();
  });

  it("lists and revokes the same refreshable client grants used by the server", async () => {
    const value = await fixture();
    const pairing = value.authStore.issuePairingCredential({ label: "Phone" });
    const token = value.authStore.exchangePairingCredential({
      credential: pairing.credential,
      client: { label: "Phone" },
    });
    const sessions = value.server.listAccessSessions();
    const clientId = sessions[0]!.id;
    const listed = await value.execute({ action: "clients-list" });
    expect(listed).toMatchObject({ clients: [{ id: clientId, client: { label: "Phone" } }] });
    expect(JSON.stringify(listed)).not.toContain(token.accessToken);
    expect(JSON.stringify(listed)).not.toContain(token.refreshToken);
    await value.execute({ action: "clients-revoke", sessionId: clientId });
    expect(
      createPersistentRemoteAuthStore(value.runtime.paths.baseDir).listAccessSessions(),
    ).toEqual([]);
    expect(() => value.authStore.authenticateBearerToken(token.accessToken)).toThrow(
      "Invalid access token",
    );
    await expect(value.execute({ action: "clients-revoke", sessionId: clientId })).rejects.toThrow(
      "not found",
    );
  });

  it("revokes unused pairing links by non-secret ID and keeps existing clients", async () => {
    const value = await fixture();
    const pairing = value.authStore.issuePairingCredential({ label: "Tablet" });
    const listed = await value.execute({ action: "pairings-list" });
    expect(listed).toMatchObject({ pairings: [{ id: pairing.id, label: "Tablet" }] });
    expect(JSON.stringify(listed)).not.toContain(pairing.credential);
    await value.execute({ action: "pairings-revoke", pairingId: pairing.id });
    expect(() =>
      value.authStore.exchangePairingCredential({ credential: pairing.credential }),
    ).toThrow("pairing");
    expect(await value.execute({ action: "pairings-list" })).toEqual({ pairings: [] });
  });

  it("routes provider credential logout and explicit WSL installs through supervisor contracts", async () => {
    const value = await fixture();
    await value.execute({
      action: "auth-logout",
      agentKind: "fixture",
      credentialId: "upstream-account",
      wslDistro: "Ubuntu",
    });
    expect(value.call).toHaveBeenCalledWith("manageAgentCredentials", {
      action: "remove",
      agentKind: "fixture",
      credentialId: "upstream-account",
      env: { kind: "wsl", distro: "Ubuntu" },
    });
    await value.execute({
      action: "providers-install",
      agentId: "fixture-agent",
      wslDistro: "Ubuntu",
    });
    expect(value.call).toHaveBeenCalledWith("installAcpRegistryAgent", {
      agentId: "fixture-agent",
      target: { kind: "wsl", distro: "Ubuntu" },
    });
  });

  it("deduplicates mutations while allowing repeated terminal polls without exhausting receipts", async () => {
    const value = await fixture();
    const options = {
      requestId: randomUUID(),
      payload: {
        adminVersion: HOST_ADMIN_VERSION,
        command: { action: "providers-install" as const, agentId: "fixture" },
      },
    } as const;
    await callHostControl(value.owner.lease.paths, "admin", options);
    await callHostControl(value.owner.lease.paths, "admin", options);
    expect(
      value.call.mock.calls.filter(([name]) => name === "installAcpRegistryAgent"),
    ).toHaveLength(1);
    for (let index = 0; index < 70; index += 1) await value.execute({ action: "clients-list" });
    expect(await value.execute({ action: "clients-list" })).toEqual({ clients: [] });
    await expect(
      callHostControl(value.owner.lease.paths, "admin", {
        ...options,
        expectedGeneration: randomUUID(),
      }),
    ).rejects.toThrow("owner changed");
  });

  it("leaves an older owner running and rejects future admin versions and unknown operations", async () => {
    const value = await fixture(false);
    await expect(value.execute({ action: "clients-list" })).rejects.toThrow(
      "does not support CLI administration",
    );
    value.owner.lease.assertActive();
    const request = {
      version: HOST_CONTROL_PROTOCOL_VERSION,
      requestId: randomUUID(),
      ownerGeneration: value.owner.lease.generation,
      operation: "admin",
      payload: { adminVersion: 19, command: { action: "clients-list" } },
    };
    expect(hostControlRequestSchema.safeParse(request).success).toBe(false);
    expect(
      hostControlRequestSchema.safeParse({
        ...request,
        payload: {
          adminVersion: HOST_ADMIN_VERSION,
          command: { action: "run-any-shell", command: "unsafe" },
        },
      }).success,
    ).toBe(false);
    expect(
      z.object({ description: z.object({ operations: z.array(z.string()) }) }).parse(
        await callHostControl(value.owner.lease.paths, "describe").then((reply) => ({
          description: reply.result,
        })),
      ).description.operations,
    ).toEqual(["describe", "issue-pairing"]);
  });
});
