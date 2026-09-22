import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import { persist } from "zustand/middleware";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import { PORACODE_CLIENT_RUNTIME_VERSION } from "@/shared/clientRuntime";
import { IPC_PROCEDURE_MAP_VERSION } from "@/shared/ipc";
import type { Thread } from "@/shared/contracts";
import { installElectronClientRuntime, resetClientRuntimeForTest } from "@/renderer/clientRuntime";
import { PreloadIpcTransport } from "@/renderer/hostTransport";
import { isRemoteRoutableProcedure } from "@/renderer/remoteProcedureRoutes";
import { createDbStorage } from "./dbStorage";

/**
 * Managed startup regression (B4 S4): the app store hydrates over the real
 * managed boot chain (bridge → router → ManagedElectronHostTransport →
 * PreloadIpcTransport → fake preload host), and hydration is PREFERENCES ONLY.
 * The catalog is host-owned and arrives over the managed loopback bounded HTTP
 * walk, so no preload procedure may read catalog rows, and `hasHydrated` must
 * release without the loopback leg.
 */

interface InvokeCall {
  readonly name: string;
  readonly args: unknown[];
}

function managedHost(
  calls: InvokeCall[],
  state: Record<string, string | null> = {},
): ElectronHostBridge {
  return {
    clientRuntimeVersion: PORACODE_CLIENT_RUNTIME_VERSION,
    ipcProcedureMapVersion: IPC_PROCEDURE_MAP_VERSION,
    arch: "arm64",
    platform: "darwin",
    hostCapabilities: {},
    onBackendSupervisorReset: () => () => {},
    invokeProcedure: (async (name: string, args: unknown[]) => {
      calls.push({ name, args });
      switch (name) {
        case "dbGetState": {
          const [key] = args as [string];
          return state[key] ?? null;
        }
        default:
          throw new Error(`unexpected IPC procedure ${name}`);
      }
    }) as ElectronHostBridge["invokeProcedure"],
  } as unknown as ElectronHostBridge;
}

interface HydrationState {
  threads: Thread[];
  view: { kind: string; panes?: string[] };
  groupLayouts: Record<string, unknown>;
}

function createHydrationStore() {
  return createStore<HydrationState>()(
    persist(() => ({ threads: [] as Thread[], view: { kind: "home" }, groupLayouts: {} }), {
      name: "poracode-app-v2",
      version: 5,
      storage: createDbStorage(),
      skipHydration: true,
    }),
  );
}

describe("managed app-store hydration over preload IPC (B4 preferences-only)", () => {
  beforeEach(() => {
    resetClientRuntimeForTest();
    Reflect.deleteProperty(window, "poracode");
    Reflect.deleteProperty(window, "poracodeHost");
    localStorage.clear();
  });

  afterEach(() => {
    resetClientRuntimeForTest();
    Reflect.deleteProperty(window, "poracode");
    Reflect.deleteProperty(window, "poracodeHost");
    vi.restoreAllMocks();
  });

  it("hydrates view and groupLayouts and never reads catalog rows", async () => {
    const calls: InvokeCall[] = [];
    const host = managedHost(calls, {
      view: '{"kind":"thread","panes":["thread-1"]}',
      groupLayouts: '{"g1":{"collapsed":true}}',
    });
    window.poracodeHost = host;
    installElectronClientRuntime(host);

    const store = createHydrationStore();
    await store.persist.rehydrate();

    expect(store.persist.hasHydrated()).toBe(true);
    expect(store.getState().view).toEqual({ kind: "thread", panes: ["thread-1"] });
    expect(store.getState().groupLayouts).toEqual({ g1: { collapsed: true } });
    // The catalog keys are absent from the persisted payload, so the merge
    // keeps whatever rows are resident (here: none) instead of an empty array.
    expect(store.getState().threads).toEqual([]);
    const catalogReads = calls.filter((call) =>
      ["dbGetThreadsPage", "dbGetThreads", "dbGetProjects", "dbSyncAll", "dbSyncChanges"].includes(
        call.name,
      ),
    );
    expect(catalogReads).toEqual([]);
  });

  it("keeps catalog procedures out of the persisted read path", () => {
    expect(isRemoteRoutableProcedure("dbGetThreadsPage")).toBe(false);
    expect(isRemoteRoutableProcedure("dbGetState")).toBe(false);
  });

  it("releases hydration with no persisted preferences at all", async () => {
    const calls: InvokeCall[] = [];
    const host = managedHost(calls);
    window.poracodeHost = host;
    installElectronClientRuntime(host);

    const store = createHydrationStore();
    await store.persist.rehydrate();

    expect(store.persist.hasHydrated()).toBe(true);
    expect(store.getState().view).toEqual({ kind: "home" });
    expect(calls.filter((call) => call.name === "dbGetState").map((call) => call.args[0])).toEqual([
      "view",
      "groupLayouts",
    ]);
  });

  it("keeps the raw preload data plane free of terminal and catalog writes", () => {
    expect(isRemoteRoutableProcedure("startShell")).toBe(true);
    expect(isRemoteRoutableProcedure("dbSetState")).toBe(false);
    expect(PreloadIpcTransport).toBeDefined();
  });
});
