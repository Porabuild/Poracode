import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientRuntime } from "@/shared/clientRuntime";
import type { PoracodeBridge } from "@/shared/ipc";

const mocks = vi.hoisted(() => ({
  readRuntime: vi.fn<() => ClientRuntime>(),
  routeRemote: vi.fn<typeof import("./remoteProcedureRouter").routeRemoteProcedure>(),
  setState: vi.fn<(state: Record<string, unknown>) => void>(),
}));
vi.mock("./clientRuntime", () => ({
  readClientRuntime: mocks.readRuntime,
  isCompactClientRuntimeSurface: () => false,
}));
vi.mock("./remoteProcedureRouter", () => ({ routeRemoteProcedure: mocks.routeRemote }));
vi.mock("./state/appStore", () => ({
  useAppStore: { getState: () => ({ draftContents: {} }), setState: mocks.setState },
}));
vi.mock("./state/panelStore", () => ({ usePanelStore: { setState: mocks.setState } }));
vi.mock("./state/updateStore", () => ({ useUpdateStore: { setState: mocks.setState } }));
vi.mock("./state/agentStatusesStore", () => ({ useAgentStatusesStore: {} }));
vi.mock("./state/providerUsageStore", () => ({ useProviderUsageStore: {} }));
vi.mock("./state/sharedSettingsStore", () => ({ useSharedSettings: {} }));
vi.mock("./state/pluginsStore", () => ({ usePlugins: {} }));
vi.mock("./state/sidebarUiStore", () => ({ useSidebarUiStore: {} }));

import { readBridge } from "./bridge";
import { installDevBridge } from "./devBridge";
import { clearFolderSelectionFixture, mockNextFolderSelection } from "./devFolderPickerFixture";

const target = globalThis as typeof globalThis & {
  __poracodeDev?: {
    mockNextFolderSelection(path: string): void;
    clearFolderSelectionFixture(): void;
    reset(): void;
  };
};

function runtimeFixture() {
  const pickFolder = vi.fn<(this: unknown, defaultPath?: string) => Promise<string>>(function (
    this: unknown,
    defaultPath?: string,
  ) {
    return Promise.resolve(`native:${defaultPath ?? "home"}`);
  });
  const procedures = {
    pickFolder,
    startThread: vi.fn<ClientRuntime["procedures"]["startThread"]>(),
    getAgentStatuses: vi.fn<ClientRuntime["procedures"]["getAgentStatuses"]>(),
    getSharedSettings: vi.fn<ClientRuntime["procedures"]["getSharedSettings"]>(),
    dbGetProjects: vi.fn<ClientRuntime["procedures"]["dbGetProjects"]>(),
  } as unknown as ClientRuntime["procedures"];
  const runtime = {
    host: "electron",
    transport: "electron-backend-host",
    capabilities: { localBackend: true, nativeShell: true },
    procedures,
    native: { isDev: true, windowKind: "main", platform: "darwin" },
  } as unknown as ClientRuntime;
  return { runtime, procedures, pickFolder };
}

beforeEach(() => {
  vi.stubEnv("DEV", true);
  mocks.readRuntime.mockReturnValue(runtimeFixture().runtime);
});
afterEach(() => {
  clearFolderSelectionFixture();
  vi.unstubAllEnvs();
  delete (window as Partial<Window>).poracode;
  delete target.__poracodeDev;
});

describe("one-shot DEV folder selection fixture", () => {
  it("restores synchronously before the result resolves and changes no other method or runtime field", async () => {
    const { runtime, procedures, pickFolder } = runtimeFixture();
    mocks.readRuntime.mockReturnValue(runtime);
    Object.freeze(runtime.capabilities);
    Object.freeze(runtime.native);
    const fields = { ...runtime };
    const otherMethods = Object.fromEntries(
      Object.entries(procedures).filter(([name]) => name !== "pickFolder"),
    );
    mockNextFolderSelection("/owned/disposable/gui");
    const retained = procedures.pickFolder;
    const result = retained("/normal/default");
    expect(procedures.pickFolder).toBe(pickFolder);
    expect(pickFolder).not.toHaveBeenCalled();
    await expect(result).resolves.toBe("/owned/disposable/gui");
    expect(runtime).toEqual(fields);
    for (const [name, method] of Object.entries(otherMethods)) {
      expect(Reflect.get(procedures, name)).toBe(method);
      expect(method).not.toHaveBeenCalled();
    }
    const receiver = { owned: "receiver" };
    await expect(retained.call(receiver, "/later/default")).resolves.toBe("native:/later/default");
    expect(pickFolder.mock.contexts[0]).toBe(receiver);
    expect(pickFolder).toHaveBeenCalledExactlyOnceWith("/later/default");
  });

  it("clear is idempotent and a retained cleared method preserves arguments, receiver and exceptions", () => {
    const { runtime, procedures, pickFolder } = runtimeFixture();
    mocks.readRuntime.mockReturnValue(runtime);
    const failure = new Error("original picker failure");
    pickFolder.mockImplementationOnce(() => {
      throw failure;
    });
    mockNextFolderSelection("/owned/disposable/pty");
    const retained = procedures.pickFolder;
    clearFolderSelectionFixture();
    clearFolderSelectionFixture();
    expect(procedures.pickFolder).toBe(pickFolder);
    const receiver = { cleared: true };
    expect(() => retained.call(receiver, undefined)).toThrow(failure);
    expect(pickFolder.mock.contexts[0]).toBe(receiver);
    expect(pickFolder).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it("rejects double-arm without overwriting the first selected path", async () => {
    const { runtime, procedures, pickFolder } = runtimeFixture();
    mocks.readRuntime.mockReturnValue(runtime);
    mockNextFolderSelection("/owned/first");
    const armed = procedures.pickFolder;
    expect(() => mockNextFolderSelection("/owned/second")).toThrow(/already armed/);
    expect(procedures.pickFolder).toBe(armed);
    await expect(procedures.pickFolder()).resolves.toBe("/owned/first");
    expect(procedures.pickFolder).toBe(pickFolder);
    mockNextFolderSelection("/owned/second");
    await expect(procedures.pickFolder()).resolves.toBe("/owned/second");
    expect(procedures.pickFolder).toBe(pickFolder);
  });

  it.each([
    "",
    " ",
    "relative",
    "./owned",
    "~/owned",
    "file:///owned",
    "C:\\owned",
    "/owned\0bad",
    null,
  ])("refuses invalid POSIX selection %j without changing the method", (path) => {
    const { runtime, procedures, pickFolder } = runtimeFixture();
    mocks.readRuntime.mockReturnValue(runtime);
    expect(() => mockNextFolderSelection(path as string)).toThrow(/absolute path/);
    expect(procedures.pickFolder).toBe(pickFolder);
  });

  it.each(["C:\\owned\\gui", "D:/owned/pty", "\\\\host\\share\\owned", "\\\\host\\share"])(
    "preserves an absolute Windows path %s exactly",
    async (path) => {
      const { runtime, procedures } = runtimeFixture();
      (runtime.native as { platform: string }).platform = "win32";
      mocks.readRuntime.mockReturnValue(runtime);
      mockNextFolderSelection(path);
      await expect(procedures.pickFolder()).resolves.toBe(path);
    },
  );

  it.each(["C:relative", "\\relative", "\\\\host", "/owned", "relative"])(
    "refuses a nonqualified Windows path %s",
    (path) => {
      const { runtime, procedures, pickFolder } = runtimeFixture();
      (runtime.native as { platform: string }).platform = "win32";
      mocks.readRuntime.mockReturnValue(runtime);
      expect(() => mockNextFolderSelection(path)).toThrow(/absolute path/);
      expect(procedures.pickFolder).toBe(pickFolder);
    },
  );

  it("does not arm outside a DEV build", () => {
    vi.stubEnv("DEV", false);
    const { runtime, procedures, pickFolder } = runtimeFixture();
    mocks.readRuntime.mockReturnValue(runtime);
    expect(() => mockNextFolderSelection("/owned/gui")).toThrow(/DEV build/);
    expect(procedures.pickFolder).toBe(pickFolder);
    expect(mocks.readRuntime).not.toHaveBeenCalled();
  });

  it.each([
    "browser",
    "remote",
    "noLocalBackend",
    "noNativeShell",
    "notDev",
    "otherWindow",
    "noPicker",
  ])("refuses unsupported runtime %s without altering procedures", (kind) => {
    const { runtime, procedures, pickFolder } = runtimeFixture();
    if (kind === "browser") (runtime as { host: string }).host = "browser";
    if (kind === "remote") (runtime as { transport: string }).transport = "remote-http-websocket";
    if (kind === "noLocalBackend")
      (runtime.capabilities as { localBackend: boolean }).localBackend = false;
    if (kind === "noNativeShell")
      (runtime.capabilities as { nativeShell: boolean }).nativeShell = false;
    if (kind === "notDev") (runtime.native as { isDev: boolean }).isDev = false;
    if (kind === "otherWindow")
      (runtime.native as { windowKind: string }).windowKind = "quickComposer";
    if (kind === "noPicker") procedures.pickFolder = undefined as unknown as typeof pickFolder;
    mocks.readRuntime.mockReturnValue(runtime);
    const previous = procedures.pickFolder;
    expect(() => mockNextFolderSelection("/owned/gui")).toThrow(/managed Electron main window/);
    expect(procedures.pickFolder).toBe(previous);
  });

  it("clear restores the retired owner without touching a replacement runtime", () => {
    const old = runtimeFixture();
    const current = runtimeFixture();
    mocks.readRuntime.mockReturnValue(old.runtime);
    mockNextFolderSelection("/owned/gui");
    mocks.readRuntime.mockReturnValue(current.runtime);
    clearFolderSelectionFixture();
    expect(old.procedures.pickFolder).toBe(old.pickFolder);
    expect(current.procedures.pickFolder).toBe(current.pickFolder);
  });

  it("a changed runtime refuses the pending result and clears only the original lease", async () => {
    const old = runtimeFixture();
    const current = runtimeFixture();
    mocks.readRuntime.mockReturnValue(old.runtime);
    mockNextFolderSelection("/owned/gui");
    const retained = old.procedures.pickFolder;
    mocks.readRuntime.mockReturnValue(current.runtime);
    await expect(retained()).rejects.toThrow(/owner changed/);
    expect(old.procedures.pickFolder).toBe(old.pickFolder);
    expect(current.procedures.pickFolder).toBe(current.pickFolder);
    expect(old.pickFolder).not.toHaveBeenCalled();
    expect(current.pickFolder).not.toHaveBeenCalled();
  });

  it("a replaced procedure owner stays unchanged and cannot receive the old selected result", async () => {
    const old = runtimeFixture();
    const current = runtimeFixture();
    mocks.readRuntime.mockReturnValue(old.runtime);
    mockNextFolderSelection("/owned/gui");
    const retained = old.procedures.pickFolder;
    (old.runtime as { procedures: ClientRuntime["procedures"] }).procedures = current.procedures;
    await expect(retained()).rejects.toThrow(/owner changed/);
    expect(old.procedures.pickFolder).toBe(old.pickFolder);
    expect(current.procedures.pickFolder).toBe(current.pickFolder);
  });

  it("clear does not overwrite another picker installed on the same owner", () => {
    const { runtime, procedures } = runtimeFixture();
    mocks.readRuntime.mockReturnValue(runtime);
    mockNextFolderSelection("/owned/gui");
    const external = vi.fn<() => Promise<string>>(async () => "external");
    procedures.pickFolder = external;
    clearFolderSelectionFixture();
    clearFolderSelectionFixture();
    expect(procedures.pickFolder).toBe(external);
  });

  it("a changed method refuses the retained pending result without replacing the new method", async () => {
    const { runtime, procedures } = runtimeFixture();
    mocks.readRuntime.mockReturnValue(runtime);
    mockNextFolderSelection("/owned/gui");
    const retained = procedures.pickFolder;
    const external = vi.fn<() => Promise<string>>(async () => "external");
    procedures.pickFolder = external;
    await expect(retained()).rejects.toThrow(/owner changed/);
    expect(procedures.pickFolder).toBe(external);
    expect(external).not.toHaveBeenCalled();
  });

  it("unavailable runtime preserves its exception while releasing the armed method", () => {
    const { runtime, procedures, pickFolder } = runtimeFixture();
    mocks.readRuntime.mockReturnValue(runtime);
    mockNextFolderSelection("/owned/gui");
    const retained = procedures.pickFolder;
    const unavailable = new Error("runtime unavailable");
    mocks.readRuntime.mockImplementationOnce(() => {
      throw unavailable;
    });
    expect(() => retained()).toThrow(unavailable);
    expect(procedures.pickFolder).toBe(pickFolder);
  });

  it("the actual readBridge facade detects the replacement and restored function without transport routing", async () => {
    const { runtime, procedures, pickFolder } = runtimeFixture();
    mocks.readRuntime.mockReturnValue(runtime);
    window.poracode = {} as PoracodeBridge;
    const facade = readBridge();
    const originalWrapper = facade.pickFolder;
    mockNextFolderSelection("/owned/gui");
    expect(facade.pickFolder).not.toBe(originalWrapper);
    await expect(facade.pickFolder("/normal/default")).resolves.toBe("/owned/gui");
    expect(procedures.pickFolder).toBe(pickFolder);
    await expect(facade.pickFolder("/real/default")).resolves.toBe("native:/real/default");
    expect(pickFolder).toHaveBeenCalledExactlyOnceWith("/real/default");
    expect(mocks.routeRemote).not.toHaveBeenCalled();
  });

  it("the actual DEV bridge exposes the two narrow functions and reset restores an unused lease", () => {
    const { runtime, procedures, pickFolder } = runtimeFixture();
    mocks.readRuntime.mockReturnValue(runtime);
    installDevBridge();
    const dev = target.__poracodeDev!;
    expect(dev.mockNextFolderSelection).toBe(mockNextFolderSelection);
    expect(dev.clearFolderSelectionFixture).toBe(clearFolderSelectionFixture);
    dev.mockNextFolderSelection("/owned/gui");
    expect(procedures.pickFolder).not.toBe(pickFolder);
    dev.reset();
    expect(procedures.pickFolder).toBe(pickFolder);
    expect(mocks.setState).toHaveBeenCalledTimes(3);
    dev.clearFolderSelectionFixture();
    expect(procedures.pickFolder).toBe(pickFolder);
    expect(pickFolder).not.toHaveBeenCalled();
  });

  it("the DEV bridge exposes no picker API in a production environment", () => {
    vi.stubEnv("DEV", false);
    installDevBridge();
    expect(target.__poracodeDev).toBeUndefined();
  });
});
