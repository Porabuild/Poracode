import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import { PORACODE_CLIENT_RUNTIME_VERSION } from "@/shared/clientRuntime";
import { IPC_PROCEDURE_MAP_VERSION } from "@/shared/ipc";
import type { Project, Thread } from "@/shared/contracts";
import type { RemoteBoundedShellSnapshotPage, RemoteDesktopClient } from "@/shared/remote/client";
import { dispatchRemoteProjectReorder, dispatchRemoteThreadReorder } from "./remoteCatalogIntents";

/**
 * Bounded-catalog consumer ownership regression (B4 paired-order correction).
 *
 * The controller used to keep ONE module-global deps object, so whichever of
 * the two production consumers configured last owned every key: in the real
 * managed-desktop bootstrap order the paired store's deps replaced the managed
 * root's, and a paired key committed into the paired runtime while the root
 * path was silently inert (see the frozen collision probe). The fix is an
 * explicit, stable per-connection owner registry: registering one consumer
 * never displaces another, in either module evaluation order.
 *
 * These tests use the ACTUAL root adapter wiring and the ACTUAL paired store
 * module (dynamic imports, real module registry) with two paired connection
 * keys plus the managed-root key, and pin:
 *
 * - both module evaluation orders commit each key into its own consumer;
 * - two paired keys never mutate each other's runtime (per-key order fence);
 * - a retired connection drops late reads (disconnect fence);
 * - an in-flight local order intent defers an authoritative pass instead of
 *   clobbering the optimistic paint.
 *
 * The real HTTP/SQLite convergence path lives in the adapted fixture
 * integration suite (`pairedCatalogOrder.integration.test.ts`).
 */

const KEY_A = "paired-order-a";
const KEY_B = "paired-order-b";
const MANAGED_ROOT_KEY = "managed-root";

function fakeHost(): ElectronHostBridge {
  return {
    clientRuntimeVersion: PORACODE_CLIENT_RUNTIME_VERSION,
    arch: "x64",
    platform: "darwin",
    onSupervisorEvent: () => () => {},
    onBackendSupervisorReset: () => () => {},
    ipcProcedureMapVersion: IPC_PROCEDURE_MAP_VERSION,
    invokeProcedure: (async () => null) as ElectronHostBridge["invokeProcedure"],
  } as unknown as ElectronHostBridge;
}

function threadRow(id: string, projectId: string): Thread {
  return {
    id,
    projectId,
    title: id,
    agentKind: "claude",
    config: {},
    status: "idle",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as Thread;
}

function projectRow(id: string): Project {
  return {
    id,
    name: id,
    location: { kind: "posix", path: `/tmp/${id}` },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function shellPage(input: {
  readonly threads: readonly Thread[];
  readonly projects: readonly Project[];
}): RemoteBoundedShellSnapshotPage {
  return {
    snapshotSeq: 1,
    projects: [...input.projects],
    threads: [...input.threads],
    runtimeSummariesByThread: {},
    reads: "bounded-v1",
    threadsNextCursor: null,
    projectsNextCursor: null,
    updatedAt: "now",
  };
}

interface FakePairedClient {
  readonly client: RemoteDesktopClient;
  /** Manual page-1 order returned by the next bounded paint read. */
  setManualThreadOrder(ids: readonly string[]): void;
  setManualProjectOrder(ids: readonly string[]): void;
  /** Hold the next page-mode thread read until released. */
  holdNextThreadPage(): () => void;
}

function makeFakePairedClient(): FakePairedClient {
  let manualThreads: readonly string[] = [];
  let manualProjects: readonly string[] = [];
  let held: Promise<void> | null = null;
  const client = {
    setTokenLifecycle: () => {},
    setCertFingerprintPin: () => {},
    boundedThreadListPage: async (options: { mode?: string }) => {
      if (held) await held;
      if (options.mode === "inventory") {
        return {
          negotiation: "bounded" as const,
          page: {
            threads: manualThreads.map((id) => threadRow(id, "p-a")),
            runtimeSummariesByThread: {},
            nextCursor: null,
            reads: "bounded-v1" as const,
          },
        };
      }
      return {
        negotiation: "bounded" as const,
        page: {
          threads: manualThreads.map((id) => threadRow(id, "p-a")),
          runtimeSummariesByThread: {},
          nextCursor: null,
          reads: "bounded-v1" as const,
        },
      };
    },
    boundedProjectListPage: async () => ({
      projects: manualProjects.map(projectRow),
      projectsNextCursor: null,
      reads: "bounded-v1" as const,
    }),
    boundedCatalogMembership: async (request: {
      threadIds?: readonly string[];
      projectIds?: readonly string[];
    }) => ({
      existingThreadIds: [...(request.threadIds ?? [])],
      existingProjectIds: [...(request.projectIds ?? [])],
    }),
  } as unknown as RemoteDesktopClient;
  return {
    client,
    setManualThreadOrder: (ids) => {
      manualThreads = [...ids];
    },
    setManualProjectOrder: (ids) => {
      manualProjects = [...ids];
    },
    holdNextThreadPage: () => {
      let release = () => {};
      held = new Promise<void>((resolve) => {
        release = () => {
          held = null;
          resolve();
        };
      });
      return release;
    },
  };
}

type ModuleGraph = {
  readonly controller: typeof import("@/renderer/state/remoteServers/catalog/boundedCatalogController");
  readonly appStore: typeof import("@/renderer/state/appStore");
  readonly projection: typeof import("@/renderer/state/remoteProjection");
  readonly fence: typeof import("@/renderer/state/remoteServers/catalog/catalogOrderFence");
  readonly store: typeof import("@/renderer/state/remoteServersStore");
  readonly root: typeof import("@/renderer/state/managedRootCatalog/rootCatalogAdapter");
  readonly clients: ReadonlyMap<string, FakePairedClient>;
  readonly resetPairing: () => void;
};

/**
 * Reset the module registry and install the two real consumers in the given
 * order. The paired store is seeded with two connection keys BEFORE it is
 * imported, so its consumer claims both from the moment it registers.
 */
async function installConsumers(input: {
  readonly order: "root-first" | "paired-first";
}): Promise<ModuleGraph> {
  vi.resetModules();
  const host = fakeHost();
  window.poracodeHost = host;
  const { installElectronClientRuntime } = await import("@/renderer/clientRuntime");
  installElectronClientRuntime(host);
  const clients = new Map<string, FakePairedClient>([
    [KEY_A, makeFakePairedClient()],
    [KEY_B, makeFakePairedClient()],
  ]);
  const seedPairedStore = async () => {
    const storeModule = await import("@/renderer/state/remoteServersStore");
    // Persisted servers/runtime hydrate asynchronously; finish that read BEFORE
    // seeding so a late rehydration cannot replace the two connection records.
    await storeModule.useRemoteServersStore.persist.rehydrate();
    storeModule.useRemoteServersStore.getState().setClientFactory((endpoint) => {
      const key = endpoint.includes(KEY_A) ? KEY_A : KEY_B;
      return clients.get(key)!.client;
    });
    const recordFor = (connectionId: string) =>
      ({
        connectionId,
        desktopId: `host-${connectionId}`,
        label: connectionId,
        endpoint: `http://127.0.0.1/${connectionId}/`,
        accessToken: `token-${connectionId}`,
        scopes: [],
        appVersion: "1.0.0",
        browserForwardAvailable: false,
        transport: { kind: "direct" },
      }) as never;
    storeModule.useRemoteServersStore.setState({
      servers: [recordFor(KEY_A), recordFor(KEY_B)],
      runtime: {
        [KEY_A]: { status: "online", projects: [], threads: [] },
        [KEY_B]: { status: "online", projects: [], threads: [] },
      } as never,
    });
    return storeModule;
  };

  let storeModule: typeof import("@/renderer/state/remoteServersStore");
  let rootModule: typeof import("@/renderer/state/managedRootCatalog/rootCatalogAdapter");
  if (input.order === "root-first") {
    rootModule = await import("@/renderer/state/managedRootCatalog/rootCatalogAdapter");
    rootModule.installManagedRootCatalogRuntime();
    storeModule = await seedPairedStore();
  } else {
    storeModule = await seedPairedStore();
    rootModule = await import("@/renderer/state/managedRootCatalog/rootCatalogAdapter");
    rootModule.installManagedRootCatalogRuntime();
  }

  const controller =
    await import("@/renderer/state/remoteServers/catalog/boundedCatalogController");
  const appStore = await import("@/renderer/state/appStore");
  // The same applies to the app store: settle its persisted-preference
  // hydration before the test installs catalog rows.
  await appStore.useAppStore.persist.rehydrate();
  const projection = await import("@/renderer/state/remoteProjection");
  const fence = await import("@/renderer/state/remoteServers/catalog/catalogOrderFence");
  return {
    controller,
    appStore,
    projection,
    fence,
    store: storeModule,
    root: rootModule,
    clients,
    resetPairing: () => {
      storeModule.__resetRemoteServersStoreForTest();
      rootModule.__resetManagedRootCatalogRuntimeForTest();
      controller.__resetBoundedCatalogForTest();
    },
  };
}

function runtimeIds(
  store: ModuleGraph["store"],
  key: string,
  kind: "threads" | "projects",
): string[] {
  const runtime = store.useRemoteServersStore.getState().runtime[key];
  const rows = kind === "threads" ? (runtime?.threads ?? []) : (runtime?.projects ?? []);
  return rows.map((row) => row.id);
}

function appViewIds(graph: ModuleGraph, key: string, kind: "threads" | "projects"): string[] {
  const prefix = kind === "threads" ? `remote:${key}:thread:` : `remote:${key}:project:`;
  const rows =
    kind === "threads"
      ? graph.appStore.useAppStore.getState().threads
      : graph.appStore.useAppStore.getState().projects;
  return rows.filter((row) => row.id.startsWith(prefix)).map((row) => row.id.slice(prefix.length));
}

describe("bounded catalog consumer ownership", () => {
  afterEach(() => {
    vi.resetModules();
    Reflect.deleteProperty(window, "poracode");
    Reflect.deleteProperty(window, "poracodeHost");
  });

  for (const order of ["root-first", "paired-first"] as const) {
    it(`commits each key into its own consumer when installed ${order}`, async () => {
      const graph = await installConsumers({ order });
      graph.controller.installBoundedCatalogShellPage(
        KEY_A,
        shellPage({
          threads: [threadRow("a1", "p-a")],
          projects: [projectRow("p-a")],
        }),
      );
      graph.controller.installBoundedCatalogShellPage(
        KEY_B,
        shellPage({
          threads: [threadRow("b1", "p-b")],
          projects: [projectRow("p-b")],
        }),
      );

      expect(runtimeIds(graph.store, KEY_A, "threads")).toEqual(["a1"]);
      expect(runtimeIds(graph.store, KEY_B, "threads")).toEqual(["b1"]);
      expect(runtimeIds(graph.store, KEY_A, "projects")).toEqual(["p-a"]);
      expect(runtimeIds(graph.store, KEY_B, "projects")).toEqual(["p-b"]);
      // The root consumer keeps its own key in the same process.
      expect(graph.controller.hasBoundedCatalogConsumerFor(MANAGED_ROOT_KEY)).toBe(true);
      expect(graph.controller.hasBoundedCatalogConsumerFor(KEY_A)).toBe(true);
      expect(graph.controller.hasBoundedCatalogConsumerFor(KEY_B)).toBe(true);
      expect(graph.controller.isBoundedCatalogControllerConfigured()).toBe(true);
      graph.resetPairing();
    });
  }

  it("applies each connection's authoritative order to its own runtime and app slots only", async () => {
    const graph = await installConsumers({ order: "root-first" });
    graph.controller.installBoundedCatalogShellPage(
      KEY_A,
      shellPage({
        threads: [threadRow("a1", "p-a"), threadRow("a2", "p-a")],
        projects: [projectRow("p-a")],
      }),
    );
    graph.controller.installBoundedCatalogShellPage(
      KEY_B,
      shellPage({
        threads: [threadRow("b1", "p-b"), threadRow("b2", "p-b")],
        projects: [projectRow("p-b")],
      }),
    );
    // The shell install commits threads before projects, so one paint refresh
    // after the project cache exists performs the app-store projection.
    graph.controller.requestManualPaintRefresh(KEY_A, "threads");
    graph.controller.requestManualPaintRefresh(KEY_B, "threads");
    await vi.waitFor(() => expect(appViewIds(graph, KEY_A, "threads")).toEqual(["a1", "a2"]));
    await vi.waitFor(() => expect(appViewIds(graph, KEY_B, "threads")).toEqual(["b1", "b2"]));

    // Host A reorders externally; host B stays as it was.
    const clientA = graph.clients.get(KEY_A)!;
    clientA.setManualThreadOrder(["a2", "a1"]);
    graph.controller.requestManualPaintRefresh(KEY_A, "threads");

    await vi.waitFor(() => {
      expect(runtimeIds(graph.store, KEY_A, "threads")).toEqual(["a2", "a1"]);
    });
    expect(appViewIds(graph, KEY_A, "threads")).toEqual(["a2", "a1"]);
    // No cross-key mutation: the other connection keeps its runtime order and
    // its projected app slots.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(runtimeIds(graph.store, KEY_B, "threads")).toEqual(["b1", "b2"]);
    expect(appViewIds(graph, KEY_B, "threads")).toEqual(["b1", "b2"]);
    graph.resetPairing();
  });

  it("drops a retired connection's late read and never touches a sibling key", async () => {
    const graph = await installConsumers({ order: "paired-first" });
    graph.controller.installBoundedCatalogShellPage(
      KEY_A,
      shellPage({ threads: [threadRow("a1", "p-a")], projects: [projectRow("p-a")] }),
    );
    graph.controller.installBoundedCatalogShellPage(
      KEY_B,
      shellPage({ threads: [threadRow("b1", "p-b")], projects: [projectRow("p-b")] }),
    );

    const clientA = graph.clients.get(KEY_A)!;
    const release = clientA.holdNextThreadPage();
    clientA.setManualThreadOrder(["a1"]);
    graph.controller.requestManualPaintRefresh(KEY_A, "threads");
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Disconnect/removal retires the connection while its page is in flight.
    graph.store.useRemoteServersStore.getState().removeServer(KEY_A);
    expect(graph.controller.hasBoundedCatalogConsumerFor(KEY_A)).toBe(false);
    release();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(graph.store.useRemoteServersStore.getState().runtime[KEY_A]).toBeUndefined();
    expect(runtimeIds(graph.store, KEY_B, "threads")).toEqual(["b1"]);
    graph.resetPairing();
  });

  it("keeps a paired reorder local while the host has not advertised catalog mutations", async () => {
    const graph = await installConsumers({ order: "paired-first" });
    graph.controller.installBoundedCatalogShellPage(
      KEY_A,
      shellPage({
        threads: [threadRow("a1", "p-a"), threadRow("a2", "p-a")],
        projects: [projectRow("p-a"), projectRow("p-b")],
      }),
    );
    graph.controller.requestManualPaintRefresh(KEY_A, "threads");
    await vi.waitFor(() => {
      expect(appViewIds(graph, KEY_A, "threads")).toEqual(["a1", "a2"]);
    });

    const source = graph.projection.remoteThreadId(KEY_A, "a2");
    const target = graph.projection.remoteThreadId(KEY_A, "a1");
    graph.appStore.useAppStore.getState().reorderThreads(source, target, "before");
    // No descriptor proof of `catalogMutations`: the historical local-only
    // paint is authoritative and no command is dispatched.
    expect(dispatchRemoteThreadReorder(source, target, "before")).toBe(false);
    expect(
      dispatchRemoteProjectReorder(
        graph.projection.remoteProjectId(KEY_A, "p-a"),
        graph.projection.remoteProjectId(KEY_A, "p-b"),
        "before",
      ),
    ).toBe(false);
    expect(appViewIds(graph, KEY_A, "threads")).toEqual(["a2", "a1"]);
    graph.resetPairing();
  });

  it("defers an authoritative pass while a local order intent is in flight", async () => {
    const graph = await installConsumers({ order: "root-first" });
    const clientA = graph.clients.get(KEY_A)!;
    graph.controller.installBoundedCatalogShellPage(
      KEY_A,
      shellPage({
        threads: [threadRow("a1", "p-a"), threadRow("a2", "p-a")],
        projects: [projectRow("p-a")],
      }),
    );
    graph.controller.requestManualPaintRefresh(KEY_A, "threads");
    await vi.waitFor(() => {
      expect(appViewIds(graph, KEY_A, "threads")).toEqual(["a1", "a2"]);
    });

    // The user's optimistic move paints [a2, a1]; the host's older order is
    // still [a1, a2] on the next paint read.
    graph.appStore.useAppStore.setState((state) => ({
      threads: [...state.threads].reverse(),
    }));
    const settle = graph.fence.beginCatalogOrderIntentFor(KEY_A, "threads");
    clientA.setManualThreadOrder(["a1", "a2"]);
    graph.controller.requestManualPaintRefresh(KEY_A, "threads");
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Deferred, not clobbered: the optimistic paint survives the older pass.
    expect(appViewIds(graph, KEY_A, "threads")).toEqual(["a2", "a1"]);

    settle();
    graph.controller.requestManualPaintRefresh(KEY_A, "threads");
    await vi.waitFor(() => {
      expect(appViewIds(graph, KEY_A, "threads")).toEqual(["a1", "a2"]);
    });
    graph.resetPairing();
  });
});
