import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteDesktopClient } from "@/shared/remote/client";
import type { McpServer, Project } from "@/shared/contracts";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import type { ManagedLoopbackActivationSnapshot } from "@/renderer/hostTransport/loopbackHttpWsTransport";
import { useAppStore } from "@/renderer/state/appStore";
import {
  bumpRemoteServerGeneration,
  __resetEventSocketRegistryForTest,
} from "@/renderer/state/remoteServers/eventSocketRegistry";
import { applyRootCatalogProjectRows } from "@/renderer/state/managedRootCatalog/rootCatalogRows";
import { remoteProjectId } from "@/renderer/state/remoteProjection";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import {
  ensureProjectMcpServersLoaded,
  isProjectMcpServersLoaded,
  loadAuthoritativeProjectMcpServers,
  __resetProjectSettingsLoaderForTest,
} from "./projectSettingsLoader";

const transport = vi.hoisted(() => ({
  activation: null as ManagedLoopbackActivationSnapshot | null,
  listeners: [] as Array<(next: ManagedLoopbackActivationSnapshot | null) => void>,
}));
vi.mock("@/renderer/hostTransport/loopbackHttpWsTransport", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/renderer/hostTransport/loopbackHttpWsTransport")>();
  return {
    ...actual,
    readManagedLoopbackActivation: () => transport.activation,
    subscribeManagedLoopbackActivation: (
      listener: (next: ManagedLoopbackActivationSnapshot | null) => void,
    ) => {
      transport.listeners.push(listener);
      return () => {
        transport.listeners = transport.listeners.filter((entry) => entry !== listener);
      };
    },
  };
});
const commands = vi.hoisted(() => ({ managedRootRuntime: true }));
vi.mock("@/renderer/state/managedRootCatalog/rootCatalogCommands", () => ({
  isManagedRootDesktopRuntime: () => commands.managedRootRuntime,
  managedRootOfflineError: () => new Error("loopback offline"),
}));

const smokeExternal: McpServer = {
  id: "smoke-external-id",
  name: "smoke_external",
  description: "Persisted before the projection existed",
  enabled: true,
  timeoutMs: 30_000,
  transport: { type: "http", url: "http://127.0.0.1:1/mcp", headers: {} },
};
const smokeSecond: McpServer = {
  id: "smoke-second-id",
  name: "smoke_second",
  description: "Added host-side after the first load",
  enabled: true,
  timeoutMs: 30_000,
  transport: { type: "http", url: "http://127.0.0.1:2/mcp", headers: {} },
};

function rootProject(id: string): Project {
  return {
    id,
    name: "Smoke project",
    location: { kind: "posix", path: "/tmp/smoke" },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function activationFor(seq: number, projectSettings: unknown): ManagedLoopbackActivationSnapshot {
  return {
    seq,
    endpoint: `http://127.0.0.1:${9000 + seq}`,
    client: { projectSettings } as unknown as ManagedLoopbackActivationSnapshot["client"],
  };
}

function publishActivation(next: ManagedLoopbackActivationSnapshot | null): void {
  transport.activation = next;
  for (const listener of [...transport.listeners]) listener(next);
}

function seedProjects(projects: readonly Project[]): void {
  useAppStore.setState({ projects: [...projects] });
}

beforeEach(() => {
  __resetProjectSettingsLoaderForTest();
  __resetEventSocketRegistryForTest();
  transport.activation = null;
  seedProjects([]);
  commands.managedRootRuntime = true;
});

describe("managed-root project settings loading", () => {
  it("loads authoritative settings into the root row and a catalog refresh retains them", async () => {
    const projectSettings = vi.fn<() => Promise<{ mcpServers?: McpServer[] }>>(async () => ({
      mcpServers: [smokeExternal],
    }));
    publishActivation(activationFor(1, projectSettings));
    seedProjects([rootProject("smoke-project")]);
    expect(isProjectMcpServersLoaded(useAppStore.getState().projects[0]!)).toBe(false);

    await ensureProjectMcpServersLoaded("smoke-project");

    expect(projectSettings).toHaveBeenCalledWith("smoke-project");
    const loaded = useAppStore.getState().projects.find((row) => row.id === "smoke-project");
    expect(loaded?.mcpServers).toEqual([smokeExternal]);
    expect(isProjectMcpServersLoaded(loaded!)).toBe(true);

    // A catalog-only refresh replaces the row with a shape that never carries
    // private settings; the loaded projection must survive it.
    applyRootCatalogProjectRows([{ ...rootProject("smoke-project"), name: "Renamed host-side" }]);
    const refreshed = useAppStore.getState().projects.find((row) => row.id === "smoke-project");
    expect(refreshed?.name).toBe("Renamed host-side");
    expect(refreshed?.mcpServers).toEqual([smokeExternal]);
  });

  it("an activation swap fences the late response and retires the loaded marker", async () => {
    let release!: (value: { mcpServers?: McpServer[] }) => void;
    const held = new Promise<{ mcpServers?: McpServer[] }>((resolve) => {
      release = resolve;
    });
    const projectSettings = vi.fn<() => Promise<{ mcpServers?: McpServer[] }>>(() => held);
    publishActivation(activationFor(1, projectSettings));
    seedProjects([rootProject("smoke-project")]);

    const pending = ensureProjectMcpServersLoaded("smoke-project");
    await vi.waitFor(() => expect(projectSettings).toHaveBeenCalledTimes(1));
    // The loopback leg is replaced while the read is in flight.
    publishActivation(activationFor(2, vi.fn<() => Promise<{ mcpServers?: McpServer[] }>>()));
    release({ mcpServers: [smokeExternal] });
    await pending;

    const row = useAppStore
      .getState()
      .projects.find((candidate) => candidate.id === "smoke-project");
    expect(row?.mcpServers).toBeUndefined();
    expect(isProjectMcpServersLoaded(row!)).toBe(false);
  });

  it("an offline managed root rejects the returned promise instead of throwing", async () => {
    // No activation published: the loopback leg is down. Regression — the
    // refusal used to throw synchronously, escaping the `.catch` that every
    // fire-and-forget caller hangs on this promise.
    seedProjects([rootProject("smoke-project")]);
    await expect(ensureProjectMcpServersLoaded("smoke-project")).rejects.toThrow(
      "loopback offline",
    );
    expect(isProjectMcpServersLoaded(useAppStore.getState().projects[0]!)).toBe(false);

    // Once the leg publishes, the same need succeeds without residue.
    const projectSettings = vi.fn<() => Promise<{ mcpServers?: McpServer[] }>>(async () => ({}));
    publishActivation(activationFor(1, projectSettings));
    await ensureProjectMcpServersLoaded("smoke-project");
    expect(projectSettings).toHaveBeenCalledTimes(1);
  });

  it("a refused read changes nothing and the next authoritative load re-reads", async () => {
    const projectSettings = vi.fn<() => Promise<{ mcpServers?: McpServer[] }>>(async () => {
      throw new Error("refused");
    });
    publishActivation(activationFor(1, projectSettings));
    seedProjects([rootProject("smoke-project")]);

    await expect(ensureProjectMcpServersLoaded("smoke-project")).rejects.toThrow("refused");
    const row = useAppStore
      .getState()
      .projects.find((candidate) => candidate.id === "smoke-project");
    expect(row?.mcpServers).toBeUndefined();
    expect(isProjectMcpServersLoaded(row!)).toBe(false);
    // The next authoritative need re-reads instead of trusting the row, and a
    // transport refusal surfaces as itself — the row is never treated as empty.
    await expect(loadAuthoritativeProjectMcpServers("smoke-project")).rejects.toThrow("refused");
    expect(projectSettings).toHaveBeenCalledTimes(2);
  });

  it("refuses an authoritative read for a row that no longer exists", async () => {
    const projectSettings = vi.fn<() => Promise<{ mcpServers?: McpServer[] }>>(async () => ({
      mcpServers: [smokeExternal],
    }));
    publishActivation(activationFor(1, projectSettings));

    await expect(loadAuthoritativeProjectMcpServers("gone-project")).rejects.toThrow(
      /MCP server settings/,
    );
    expect(projectSettings).not.toHaveBeenCalled();
  });

  it("loaded-empty is distinct from not-loaded and the display path stays coalesced", async () => {
    // The endpoint omits `mcpServers` entirely when the project has none.
    const projectSettings = vi.fn<() => Promise<{ mcpServers?: McpServer[] }>>(async () => ({}));
    publishActivation(activationFor(1, projectSettings));
    seedProjects([rootProject("smoke-project")]);

    await loadAuthoritativeProjectMcpServers("smoke-project");
    const row = useAppStore
      .getState()
      .projects.find((candidate) => candidate.id === "smoke-project");
    expect(row?.mcpServers).toBeUndefined();
    expect(isProjectMcpServersLoaded(row!)).toBe(true);
    // The display path resolves from the marker without touching the endpoint.
    await ensureProjectMcpServersLoaded("smoke-project");
    expect(projectSettings).toHaveBeenCalledTimes(1);
  });

  it("the authoritative load re-reads the endpoint instead of serving the display cache", async () => {
    // Regression — the authoritative load used to sit on the first load
    // forever, so a commit path could write an absolute list over another
    // client's host-side change made after that first load.
    const projectSettings = vi
      .fn<() => Promise<{ mcpServers?: McpServer[] }>>()
      .mockResolvedValueOnce({ mcpServers: [smokeExternal] })
      .mockResolvedValue({ mcpServers: [smokeExternal, smokeSecond] });
    publishActivation(activationFor(1, projectSettings));
    seedProjects([rootProject("smoke-project")]);

    await expect(loadAuthoritativeProjectMcpServers("smoke-project")).resolves.toEqual([
      smokeExternal,
    ]);

    // Another client added a server after the first load: the commit-path
    // read must see it, and the row must carry it.
    await expect(loadAuthoritativeProjectMcpServers("smoke-project")).resolves.toEqual([
      smokeExternal,
      smokeSecond,
    ]);
    const row = useAppStore
      .getState()
      .projects.find((candidate) => candidate.id === "smoke-project");
    expect(row?.mcpServers).toEqual([smokeExternal, smokeSecond]);
    expect(projectSettings).toHaveBeenCalledTimes(2);
  });

  it("removing a row retires its loaded marker, so a same-id re-creation re-reads", async () => {
    // Regression — the marker survived a remove + re-create under the same
    // activation, so the re-created row's empty projection counted as
    // "loaded empty" while the host still had servers.
    const projectSettings = vi.fn<() => Promise<{ mcpServers?: McpServer[] }>>(async () => ({
      mcpServers: [smokeExternal],
    }));
    publishActivation(activationFor(1, projectSettings));
    seedProjects([rootProject("smoke-project")]);
    await ensureProjectMcpServersLoaded("smoke-project");
    expect(isProjectMcpServersLoaded(useAppStore.getState().projects[0]!)).toBe(true);

    seedProjects([]);
    seedProjects([rootProject("smoke-project")]);

    expect(isProjectMcpServersLoaded(useAppStore.getState().projects[0]!)).toBe(false);
    await ensureProjectMcpServersLoaded("smoke-project");
    expect(projectSettings).toHaveBeenCalledTimes(2);
  });
});

describe("project-scoped response ordering and row lifetime", () => {
  it("does not suppress one project's read when another project's response arrives first", async () => {
    const held = Promise.withResolvers<{ mcpServers: McpServer[] }>();
    const projectSettings = vi.fn<(id: string) => Promise<{ mcpServers: McpServer[] }>>((id) =>
      id === "a" ? held.promise : Promise.resolve({ mcpServers: [smokeSecond] }),
    );
    publishActivation(activationFor(1, projectSettings));
    seedProjects([rootProject("a"), rootProject("b")]);
    const pendingA = loadAuthoritativeProjectMcpServers("a");
    await expect(loadAuthoritativeProjectMcpServers("b")).resolves.toEqual([smokeSecond]);
    held.resolve({ mcpServers: [smokeExternal] });
    await expect(pendingA).resolves.toEqual([smokeExternal]);
    expect(useAppStore.getState().projects.find((row) => row.id === "a")?.mcpServers).toEqual([
      smokeExternal,
    ]);
  });

  it("rejects a late read after a row is removed and recreated under the same activation", async () => {
    const held = Promise.withResolvers<{ mcpServers: McpServer[] }>();
    const projectSettings = vi.fn<() => Promise<{ mcpServers: McpServer[] }>>(() => held.promise);
    publishActivation(activationFor(1, projectSettings));
    seedProjects([rootProject("a")]);
    const pending = loadAuthoritativeProjectMcpServers("a");
    seedProjects([]);
    seedProjects([rootProject("a")]);
    held.resolve({ mcpServers: [smokeExternal] });
    await expect(pending).rejects.toThrow(/MCP server settings/);
    expect(useAppStore.getState().projects[0]?.mcpServers).toBeUndefined();
    expect(isProjectMcpServersLoaded(useAppStore.getState().projects[0]!)).toBe(false);
    await ensureProjectMcpServersLoaded("a");
    expect(projectSettings).toHaveBeenCalledTimes(2);
  });

  it("keeps a newer successful read when an older display read finishes later", async () => {
    const held = Promise.withResolvers<{ mcpServers: McpServer[] }>();
    const projectSettings = vi
      .fn<() => Promise<{ mcpServers: McpServer[] }>>()
      .mockReturnValueOnce(held.promise)
      .mockResolvedValue({ mcpServers: [smokeSecond] });
    publishActivation(activationFor(1, projectSettings));
    seedProjects([rootProject("a")]);
    const display = ensureProjectMcpServersLoaded("a");
    await expect(loadAuthoritativeProjectMcpServers("a")).resolves.toEqual([smokeSecond]);
    held.resolve({ mcpServers: [smokeExternal] });
    await display;
    expect(useAppStore.getState().projects[0]?.mcpServers).toEqual([smokeSecond]);
  });

  it("does not treat a successor activation's successful read as proof for a retired request", async () => {
    const held = Promise.withResolvers<{ mcpServers: McpServer[] }>();
    publishActivation(
      activationFor(
        1,
        vi.fn(() => held.promise),
      ),
    );
    seedProjects([rootProject("a")]);
    const retired = loadAuthoritativeProjectMcpServers("a");
    publishActivation(
      activationFor(
        2,
        vi.fn(async () => ({ mcpServers: [smokeSecond] })),
      ),
    );
    await expect(loadAuthoritativeProjectMcpServers("a")).resolves.toEqual([smokeSecond]);
    held.resolve({ mcpServers: [smokeExternal] });
    await expect(retired).rejects.toThrow(/MCP server settings/);
    expect(useAppStore.getState().projects[0]?.mcpServers).toEqual([smokeSecond]);
  });

  it("accepts a pending read across a public catalog refresh of the same project", async () => {
    const held = Promise.withResolvers<{ mcpServers: McpServer[] }>();
    publishActivation(
      activationFor(
        1,
        vi.fn(() => held.promise),
      ),
    );
    seedProjects([rootProject("a")]);
    const pending = loadAuthoritativeProjectMcpServers("a");
    applyRootCatalogProjectRows([{ ...rootProject("a"), name: "Renamed" }]);
    held.resolve({ mcpServers: [smokeExternal] });
    await expect(pending).resolves.toEqual([smokeExternal]);
    expect(useAppStore.getState().projects[0]?.name).toBe("Renamed");
  });
});

describe("paired projection settings fence", () => {
  const readSettings = vi.fn<RemoteDesktopClient["projectSettings"]>();

  beforeEach(() => {
    const client = new RemoteDesktopClient("http://127.0.0.1:1");
    readSettings.mockReset().mockResolvedValue({ mcpServers: [smokeExternal] });
    vi.spyOn(client, "projectSettings").mockImplementation(readSettings);
    vi.spyOn(useRemoteServersStore.getState(), "withClient").mockImplementation((_key, invoke) =>
      invoke(client),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("drops a paired response after the row moves to another owner", async () => {
    const held = Promise.withResolvers<{ mcpServers: McpServer[] }>();
    readSettings.mockReturnValueOnce(held.promise);
    seedProjects([remoteProjectIdFixture()]);
    const pending = ensureProjectMcpServersLoaded(remoteProjectId("d1", "p1"));
    seedProjects([{ ...remoteProjectIdFixture(), remoteServerId: "d2" }]);
    held.resolve({ mcpServers: [smokeExternal] });
    await pending;
    expect(readSettings).toHaveBeenCalledWith("p1");
    expect(useAppStore.getState().projects[0]?.mcpServers).toBeUndefined();
    expect(isProjectMcpServersLoaded(useAppStore.getState().projects[0]!)).toBe(false);
  });

  it("refuses an authoritative paired read after its row disappears", async () => {
    const held = Promise.withResolvers<{ mcpServers: McpServer[] }>();
    readSettings.mockReturnValueOnce(held.promise);
    seedProjects([remoteProjectIdFixture()]);
    const pending = loadAuthoritativeProjectMcpServers(remoteProjectId("d1", "p1"));
    seedProjects([]);
    held.resolve({ mcpServers: [smokeExternal] });
    await expect(pending).rejects.toThrow(/MCP server settings/);
    expect(useAppStore.getState().projects).toEqual([]);
  });

  it("a reconnect to the same host retires the marker and fences the old client's read", async () => {
    const id = remoteProjectId("d1", "p1");
    seedProjects([remoteProjectIdFixture()]);
    await ensureProjectMcpServersLoaded(id);
    expect(isProjectMcpServersLoaded(useAppStore.getState().projects[0]!)).toBe(true);
    const held = Promise.withResolvers<{ mcpServers: McpServer[] }>();
    readSettings.mockReturnValueOnce(held.promise);
    const pending = loadAuthoritativeProjectMcpServers(id);
    bumpRemoteServerGeneration("d1");
    expect(isProjectMcpServersLoaded(useAppStore.getState().projects[0]!)).toBe(false);
    held.resolve({ mcpServers: [smokeSecond] });
    await expect(pending).rejects.toThrow(/MCP server settings/);
    expect(useAppStore.getState().projects[0]?.mcpServers).toEqual([smokeExternal]);
  });

  it("removing a paired row retires its marker so same-owner re-projection re-reads", async () => {
    const id = remoteProjectId("d1", "p1");
    seedProjects([remoteProjectIdFixture()]);
    await ensureProjectMcpServersLoaded(id);
    expect(isProjectMcpServersLoaded(useAppStore.getState().projects[0]!)).toBe(true);
    seedProjects([]);
    seedProjects([remoteProjectIdFixture()]);
    expect(isProjectMcpServersLoaded(useAppStore.getState().projects[0]!)).toBe(false);
    await ensureProjectMcpServersLoaded(id);
    expect(readSettings).toHaveBeenCalledTimes(2);
  });
});

describe("local-authority rows", () => {
  it("never fetch and always count as loaded", async () => {
    commands.managedRootRuntime = false;
    const projectSettings = vi.fn<() => Promise<{ mcpServers?: McpServer[] }>>();
    publishActivation(activationFor(1, projectSettings));
    seedProjects([rootProject("local-project")]);

    expect(isProjectMcpServersLoaded(useAppStore.getState().projects[0]!)).toBe(true);
    await ensureProjectMcpServersLoaded("local-project");
    await expect(loadAuthoritativeProjectMcpServers("local-project")).resolves.toEqual([]);
    expect(projectSettings).not.toHaveBeenCalled();
  });

  it("keeps the Home row out of the fetch paths", async () => {
    const projectSettings = vi.fn<() => Promise<{ mcpServers?: McpServer[] }>>();
    publishActivation(activationFor(1, projectSettings));
    seedProjects([rootProject(HOME_PROJECT_ID)]);

    await ensureProjectMcpServersLoaded(HOME_PROJECT_ID);
    expect(projectSettings).not.toHaveBeenCalled();
  });
});

function remoteProjectIdFixture(): Project {
  return {
    id: remoteProjectId("d1", "p1"),
    name: "Remote App",
    location: { kind: "posix", path: "/r/app", remoteServerId: "d1" },
    createdAt: "2026-01-01T00:00:00.000Z",
    remoteServerId: "d1",
    remoteId: "p1",
  } as Project;
}
