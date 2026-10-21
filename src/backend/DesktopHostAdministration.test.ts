import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolvePoracodePaths } from "@/shared/poracodePaths";
import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { HostOwnerLease } from "./ownership/hostOwnerLease";
import { HostDataFence } from "./ownership/hostDataFence";
import { resolveHostRootPaths } from "./ownership/hostRootPaths";
import { delegatedDesktopControl } from "./ownership/delegatedHostControl";
import { createBackendSettingsAccess } from "./BackendSettingsService";
import { DesktopHostAdministration } from "./DesktopHostAdministration";
import { configureSecretStorageKey, decryptSecret } from "@/shared/secretStorage";
import { readSharedSettingsFile } from "@/host/sharedSettingsFile";
import { hostServiceCapabilities } from "@/shared/hostControlProtocol";
import { hostAdminRequest } from "@/shared/hostAdminProtocol";
import { callHostControl } from "./ownership/hostControlClient";
import { requestHostAdministration } from "@/server/cliAdmin";
import type { AdminSupervisorCall } from "@/server/hostProviderAuth";
import type { HostAdministrationServer } from "@/server/hostAdministration";
import type { HostSessionReads } from "@/server/hostSessionAdministration";
import {
  initDatabase,
  closeDatabase,
  dbGetThread,
  dbGetProjects,
  dbGetThreadsPage,
  dbUpsertProject,
  dbUpsertThread,
} from "@/host/db";
import { threadSchema } from "@/shared/contracts/thread";
import { agentCapabilitySchema } from "@/shared/contracts/agent";
import {
  hostRunDirectoryOptionsSchema,
  hostRunDirectoryPreparationSchema,
} from "@/shared/contracts/hostRun";
import { saveUploadedAttachmentFile } from "@/host/attachments/attachmentStorage";

const closing: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closing.splice(0).reverse()) await close();
});
async function fixture(
  call: AdminSupervisorCall = vi.fn<AdminSupervisorCall>(async () => undefined as never),
  sessions: HostSessionReads = {
    readThread: () => null,
    readPage: async () => ({ threads: [], nextCursor: null }),
  },
) {
  const root = mkdtempSync(join(process.cwd(), "tmp/desktop-admin-"));
  const paths = resolveHostRootPaths(join(root, "profile"));
  const owner = HostOwnerLease.acquire(paths, "desktop");
  const fence = HostDataFence.acquire(paths.dataFencePath);
  mkdirSync(paths.dataRoot);
  configureSecretStorageKey(Buffer.alloc(32, 71).toString("base64"));
  const authority = delegatedDesktopControl({
    grant: {
      version: 1,
      profileNamespace: paths.profileNamespace,
      ownerGeneration: owner.generation,
    },
    dataRoot: paths.dataRoot,
    dataFencePath: paths.dataFencePath,
    custody: fence,
    ownerPid: process.pid,
    assertParentActive() {},
  });
  const settings = createBackendSettingsAccess({
    settingsPath: () => join(paths.dataRoot, "settings.json"),
    lease: () => ({
      paths,
      generation: fence.generation,
      assertActive: () => fence.assertActive(),
    }),
    assertPreparedDatabaseForWrite() {},
    onChanged() {},
  });
  closing.push(async () => {
    await settings.dispose();
    fence.release();
    owner.release();
    rmSync(root, { recursive: true, force: true });
  });
  function server(): HostAdministrationServer {
    return {
      issueIndependentPairingGrant: vi.fn<HostAdministrationServer["issueIndependentPairingGrant"]>(
        () => {
          throw new Error("No pairing requested by this fixture");
        },
      ),
      listAccessSessions: vi.fn<HostAdministrationServer["listAccessSessions"]>(() => []),
      listPairingCredentials: vi.fn<HostAdministrationServer["listPairingCredentials"]>(() => []),
      publishCatalogChanged: vi.fn<HostAdministrationServer["publishCatalogChanged"]>(),
      revokeAccessSession: vi.fn<HostAdministrationServer["revokeAccessSession"]>(() => true),
      revokePairingCredentialById: vi.fn<HostAdministrationServer["revokePairingCredentialById"]>(
        () => true,
      ),
    };
  }
  let current = server();
  const admin = new DesktopHostAdministration({
    authority,
    call,
    server: () => current,
    capabilities: hostServiceCapabilities(),
    settings,
    readSettings: () => readSharedSettingsFile(join(paths.dataRoot, "settings.json")),
    statusCachePath: resolvePoracodePaths(paths.dataRoot).statusCachePath,
    assertCanPersistSecrets: () => authority.assertActive(),
    sessions,
    attachments: {
      save: (input) => saveUploadedAttachmentFile(resolvePoracodePaths(paths.dataRoot), input),
    },
  });
  closing.push(() => admin.dispose());
  await admin.start();
  owner.setPhase("ready");
  return {
    owner,
    fence,
    paths,
    admin,
    settings,
    server,
    get current() {
      return current;
    },
    replace(next: HostAdministrationServer) {
      current = next;
    },
  };
}

it("registers directory selections through delegated desktop v20 without widening outer capabilities", async () => {
  const call = vi.fn<AdminSupervisorCall>(
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
  const f = await fixture(call);
  initDatabase(resolvePoracodePaths(f.paths.dataRoot).dbPath);
  const directory = join(f.paths.dataRoot, "..", "directory repo");
  mkdirSync(directory);
  try {
    const before = await callHostControl(f.paths, "describe");
    const command = { action: "run-directory-options" as const, directory, agentKind: "fixture" };
    await expect(
      callHostControl(f.paths, "admin", {
        expectedGeneration: "foreign-generation",
        payload: hostAdminRequest(command),
      }),
    ).rejects.toThrow("changed");
    expect(dbGetProjects()).toEqual([]);
    expect(call).not.toHaveBeenCalled();
    const result = hostRunDirectoryOptionsSchema.parse(
      await requestHostAdministration(f.paths.profileNamespace, command),
    );
    expect(result.created).toBe(true);
    expect(result.options.projectId).toBe(result.project.id);
    expect(dbGetProjects().map((project) => project.id)).toEqual([result.project.id]);
    expect(f.current.publishCatalogChanged).toHaveBeenCalledOnce();
    const after = await callHostControl(f.paths, "describe");
    expect(after.result.operations).toEqual(before.result.operations);
    expect(after.result.capabilities).toEqual(before.result.capabilities);
  } finally {
    closeDatabase();
  }
});

it.each([false, true])(
  "forwards native file preparation through delegated desktop custody (interactive: %s)",
  async (interactive) => {
    const call = vi.fn<AdminSupervisorCall>(
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
    const f = await fixture(call);
    initDatabase(resolvePoracodePaths(f.paths.dataRoot).dbPath);
    const directory = join(f.paths.dataRoot, "file repo");
    mkdirSync(directory);
    const source = join(directory, "source.txt");
    writeFileSync(source, "desktop fixture");
    const preparation = {
      action: "run-directory-files-prepare" as const,
      directory,
      files: [source],
      agentKind: "fixture",
      model: "fixture",
      prompt: "Explain",
    };
    const command = interactive
      ? { action: "run-interactive-prepare" as const, command: preparation }
      : preparation;
    try {
      const before = await callHostControl(f.paths, "describe");
      await expect(
        callHostControl(f.paths, "admin", {
          expectedGeneration: "foreign-generation",
          payload: hostAdminRequest(command),
        }),
      ).rejects.toThrow("changed");
      expect(dbGetProjects()).toEqual([]);
      expect(call).not.toHaveBeenCalled();
      const result = hostRunDirectoryPreparationSchema.parse(
        await requestHostAdministration(f.paths.profileNamespace, command),
      );
      expect(result.created).toBe(true);
      expect(dbGetProjects()).toHaveLength(1);
      expect(call.mock.calls.every(([name]) => name === "probeSelectedAgent")).toBe(true);
      await requestHostAdministration(f.paths.profileNamespace, {
        action: "run-cancel",
        runId: result.run.runId,
      });
      const after = await callHostControl(f.paths, "describe");
      expect(after.result.operations).toEqual(before.result.operations);
      expect(after.result.capabilities).toEqual(before.result.capabilities);
    } finally {
      closeDatabase();
    }
  },
);

it("prepares an exact saved session through desktop administration without an outer capability or catalog change", async () => {
  const call = vi.fn<AdminSupervisorCall>(
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
          capabilities: agentCapabilitySchema.parse({
            models: [{ id: "fixture", label: "Fixture" }],
            supportsResume: true,
            presentationMode: "gui",
          }),
        },
      }) as never,
  );
  const f = await fixture(call);
  initDatabase(resolvePoracodePaths(f.paths.dataRoot).dbPath);
  try {
    dbUpsertProject(
      {
        id: "project",
        name: "Fixture",
        createdAt: "2026-10-21T00:00:00Z",
        location: {
          kind: process.platform === "win32" ? "windows" : "posix",
          path: f.paths.dataRoot,
        },
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
    const before = await callHostControl(f.paths, "describe");
    const prepared = (await requestHostAdministration(f.paths.profileNamespace, {
      action: "run-resume-prepare",
      threadId: saved.id,
      prompt: "Continue exactly",
    })) as { runId: string };
    expect(prepared).toMatchObject({
      formatVersion: 1,
      scope: "controlled-run",
      threadId: saved.id,
    });
    await requestHostAdministration(f.paths.profileNamespace, {
      action: "run-cancel",
      runId: prepared.runId,
    });
    expect(call).toHaveBeenCalledExactlyOnceWith("probeSelectedAgent", {
      version: 1,
      agentKind: "fixture",
    });
    expect(dbGetThread(saved.id)).toEqual(persisted);
    expect(f.current.publishCatalogChanged).not.toHaveBeenCalled();
    expect((await callHostControl(f.paths, "describe")).result).toEqual(before.result);
  } finally {
    closeDatabase();
  }
});

it("applies authenticated v18 session metadata through the desktop owner without changing outer operations", async () => {
  const call = vi.fn<AdminSupervisorCall>(async () => ({ confirmed: true }) as never);
  const f = await fixture(call, {
    readThread: dbGetThread,
    readPage: async (query) => dbGetThreadsPage(query),
  });
  initDatabase(resolvePoracodePaths(f.paths.dataRoot).dbPath);
  try {
    dbUpsertProject(
      {
        id: "project",
        name: "Fixture",
        location: { kind: "windows", path: f.paths.dataRoot },
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
        createdAt: "2026-10-21T00:00:00Z",
        updatedAt: "2026-10-21T00:00:00Z",
      }),
      0,
    );
    const before = await callHostControl(f.paths, "describe");
    expect(
      await requestHostAdministration(f.paths.profileNamespace, {
        action: "sessions-update",
        threadId: "thread",
        change: { kind: "rename", title: "From CLI" },
      }),
    ).toMatchObject({ runtime: "unchanged", session: { title: "From CLI" } });
    expect(call).not.toHaveBeenCalled();
    expect(
      await requestHostAdministration(f.paths.profileNamespace, {
        action: "sessions-update",
        threadId: "thread",
        change: { kind: "archive" },
      }),
    ).toMatchObject({ runtime: "retired", session: { archived: true } });
    expect(call).toHaveBeenCalledExactlyOnceWith("closeThreadConfirmed", { threadId: "thread" });
    expect(dbGetThread("thread")).toMatchObject({ title: "From CLI", archived: true });
    expect((await callHostControl(f.paths, "describe")).result).toEqual(before.result);
    expect(f.current.publishCatalogChanged).toHaveBeenCalledTimes(2);
  } finally {
    closeDatabase();
  }
});

it("serves authenticated CLI administration through existing desktop settings without enabling attach/stop", async () => {
  const f = await fixture();
  const described = await callHostControl(f.paths, "describe");
  expect(described.result).toMatchObject({ mode: "desktop", state: "ready", endpoint: null });
  expect(described.ownerGeneration).toBe(f.owner.generation);
  await expect(callHostControl(f.paths, "shutdown")).rejects.toThrow("not supported");
  await expect(callHostControl(f.paths, "issue-pairing")).rejects.toThrow("unavailable");
  await requestHostAdministration(f.paths.profileNamespace, {
    action: "providers-add",
    profile: {
      id: "owned-profile",
      driver: "codex",
      displayName: "Owned profile",
      config: { homeDir: "~/.fixture-only" },
      environment: { FIXTURE_KEY: { value: "local-only-value", sensitive: true } },
    },
  });
  const saved = readSharedSettingsFile(join(f.paths.dataRoot, "settings.json"));
  expect(
    decryptSecret(
      f.paths.dataRoot,
      saved.agentInstances["owned-profile"]!.environment!.FIXTURE_KEY!.value,
    ),
  ).toBe("local-only-value");
  expect(JSON.stringify(saved)).not.toContain("local-only-value");
  const reply = await requestHostAdministration(f.paths.profileNamespace, {
    action: "clients-list",
  });
  expect(reply).toEqual({ clients: [] });
  expect(
    await requestHostAdministration(f.paths.profileNamespace, {
      action: "providers-inventory",
      refresh: false,
    }),
  ).toMatchObject({
    formatVersion: 1,
    observation: { source: "saved-cache", state: "missing" },
    providers: [],
    profiles: [{ id: "owned-profile", environmentNames: ["FIXTURE_KEY"] }],
  });
  await expect(
    callHostControl(f.paths, "admin", {
      expectedGeneration: randomUUID(),
      payload: { adminVersion: 1, command: { action: "clients-list" } },
    }),
  ).rejects.toThrow("changed");
  f.owner.assertActive();
  f.fence.assertActive();
});
it("uses the current listener's client/grant inventory after remote listener replacement", async () => {
  const f = await fixture();
  const previous = f.current;
  const current = f.server();
  f.replace(current);
  await requestHostAdministration(f.paths.profileNamespace, { action: "clients-list" });
  await requestHostAdministration(f.paths.profileNamespace, { action: "pairings-list" });
  await requestHostAdministration(f.paths.profileNamespace, {
    action: "clients-revoke",
    sessionId: "fixture-session",
  });
  expect(current.listAccessSessions).toHaveBeenCalledOnce();
  expect(current.listPairingCredentials).toHaveBeenCalledOnce();
  expect(current.revokeAccessSession).toHaveBeenCalledWith("fixture-session");
  expect(previous.listAccessSessions).not.toHaveBeenCalled();
  expect(previous.revokeAccessSession).not.toHaveBeenCalled();
});
it.each(["caller", "shutdown"])(
  "joins held ACP authentication and its cancellation after %s",
  async (trigger) => {
    const entered = Promise.withResolvers<void>();
    const cancelled = Promise.withResolvers<void>();
    const start = Promise.withResolvers<void>();
    const retirement = Promise.withResolvers<void>();
    const call = vi.fn<AdminSupervisorCall>(async (name, payload) => {
      if (name === "refreshAgentStatuses")
        return {
          windows: [
            { kind: "fixture", installed: true, authMethods: [{ id: "oauth", name: "OAuth" }] },
          ],
          wsl: [],
          fromCache: false,
        } as never;
      if (name === "controlAcpAuthentication") {
        if ((payload as { action: string }).action === "start") {
          entered.resolve();
          await start.promise;
        } else {
          cancelled.resolve();
          await retirement.promise;
        }
        return undefined as never;
      }
      throw new Error(`Unexpected call ${name}`);
    });
    const f = await fixture(call);
    const controller = new AbortController();
    const login = requestHostAdministration(
      f.paths.profileNamespace,
      { action: "auth-login", agentKind: "fixture", methodId: "oauth" },
      controller.signal,
    ).then(
      () => "unexpected authentication",
      () => "cancelled",
    );
    await entered.promise;
    let joined = false;
    const stopping =
      trigger === "shutdown"
        ? f.admin.dispose().then(() => {
            joined = true;
          })
        : undefined;
    if (trigger === "caller") controller.abort();
    await cancelled.promise;
    // Even a late successful start cannot retire or authenticate before the
    // supervisor confirms its cancellation/process+pipe join.
    start.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    expect(joined).toBe(false);
    f.owner.assertActive();
    f.fence.assertActive();
    retirement.resolve();
    await stopping;
    expect(await login).toBe("cancelled");
    expect(joined).toBe(trigger === "shutdown");
  },
);
