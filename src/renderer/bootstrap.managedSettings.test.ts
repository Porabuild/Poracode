// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cold-start ordering for the managed Electron bootstrap. Two module graphs
 * reach sharedSettingsStore during evaluation, so they must not be static
 * bootstrap imports: module boot happens before the Electron client runtime is
 * installed, and the store's initial read needs readBridge()/readClientRuntime
 * by then. Mocks record evaluation, registration, intake, and mount order.
 */
const mocks = vi.hoisted(() => ({ order: [] as string[] }));

vi.mock("./sidebar/installTransportPolicy", () => ({}));

vi.mock("./clientSurface", () => ({
  isChatSidebarSurface: () => false,
}));

vi.mock("./adaptiveLayout", () => ({
  initializeAdaptiveLayout: () => {
    mocks.order.push("adaptive");
  },
}));

vi.mock("./clientRuntime", () => ({
  installAttachedElectronClientRuntime: () => {
    mocks.order.push("installAttached");
  },
  installBrowserClientRuntime: () => {
    mocks.order.push("installBrowser");
  },
  installElectronClientRuntime: () => {
    mocks.order.push("installElectron");
  },
  resolveElectronAttachBootstrap: async () => {
    mocks.order.push("resolveAttach");
    return { kind: "managed" };
  },
  startDesktopLoopbackEventIntake: () => {
    mocks.order.push("intake");
  },
}));

vi.mock("./state/remoteServers/managedParentRuntime", () => ({
  installManagedParentRuntime: () => {
    mocks.order.push("installParent");
  },
}));

vi.mock("./state/managedRootCatalog/rootCatalogAdapter", () => {
  mocks.order.push("evaluateCatalog");
  return {
    installManagedRootCatalogRuntime: () => {
      mocks.order.push("installCatalog");
    },
  };
});

vi.mock("./state/managedRootCatalog/rootExperimentAuthority", () => {
  mocks.order.push("evaluateExperiment");
  return {
    installManagedExperimentAuthorityRuntime: () => {
      mocks.order.push("installExperiment");
    },
  };
});

vi.mock("./bridge", () => ({
  readBridge: () => ({}),
}));

vi.mock("./main", () => {
  mocks.order.push("importMain");
  return {};
});

describe("managed Electron bootstrap settings ordering", () => {
  beforeEach(() => {
    mocks.order.length = 0;
    vi.resetModules();
    Reflect.deleteProperty(window, "poracode");
    window.poracodeHost = {} as NonNullable<typeof window.poracodeHost>;
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "poracode");
    Reflect.deleteProperty(window, "poracodeHost");
  });

  it("installs the runtime before evaluating managed settings consumers and registers before intake and mount", async () => {
    await import("./bootstrap");

    const order = mocks.order;
    const at = (step: string) => order.indexOf(step);

    expect(at("resolveAttach")).toBeGreaterThanOrEqual(0);
    expect(at("installElectron")).toBeGreaterThan(at("resolveAttach"));
    // Both managed consumers evaluate only after the Electron runtime exists.
    expect(at("evaluateCatalog")).toBeGreaterThan(at("installElectron"));
    expect(at("evaluateExperiment")).toBeGreaterThan(at("installElectron"));
    expect(at("evaluateCatalog")).toBeLessThan(at("installCatalog"));
    expect(at("evaluateExperiment")).toBeLessThan(at("installExperiment"));
    // Parent/catalog/experiment registration keeps its sequence, then intake
    // starts, then the app mounts.
    expect(at("installParent")).toBeGreaterThan(at("installElectron"));
    expect(at("installCatalog")).toBeGreaterThan(at("installParent"));
    expect(at("installExperiment")).toBeGreaterThan(at("installCatalog"));
    expect(at("intake")).toBeGreaterThan(at("installExperiment"));
    expect(at("importMain")).toBeGreaterThan(at("intake"));
  });
});
