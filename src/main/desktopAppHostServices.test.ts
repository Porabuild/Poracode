import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComputerUseDesktopOverlayOptions } from "./computer-use/ComputerUseDesktopOverlay";
import type { DesktopHostServicesDeps } from "./desktopAppHostServices";
import { resolvePoracodePaths } from "@/shared/poracodePaths";

const hoisted = vi.hoisted(() => ({
  overlayOptions: null as ComputerUseDesktopOverlayOptions | null,
  interruptActiveActions: vi.fn<(threadIds: readonly string[]) => void>(),
}));

vi.mock("electron", () => ({
  app: { isPackaged: false, getPath: () => "/tmp/poracode-host-services-test" },
  session: { fromPartition: () => ({}) },
}));

vi.mock("./browser", () => ({
  BrowserPanelManager: class {},
  BrowserMcpIngress: class {},
}));

vi.mock("@/host/remote/RemoteBrowserGateway", () => ({
  RemoteBrowserGateway: class {},
}));

vi.mock("./computer-use", () => ({
  ComputerUseDesktopOverlay: class {
    constructor(options: ComputerUseDesktopOverlayOptions) {
      hoisted.overlayOptions = options;
    }
  },
}));

vi.mock("@/host/hostServices/composeHostServices", () => ({
  composeHostServices: () => ({
    computerUseMcpIngress: { interruptActiveActions: hoisted.interruptActiveActions },
  }),
}));

vi.mock("./desktopAppShell", () => ({
  setComputerUseThreads: vi.fn<(threadIds: readonly string[]) => void>(),
}));
vi.mock("./safeStorageHealth", () => ({ safeStorageHealth: () => ({ kind: "healthy" }) }));
vi.mock("./desktopAppState", () => ({
  desktopApp: {},
  requirePoracodePaths: () => ({ baseDir: "/tmp/poracode-host-services-test" }),
}));
vi.mock("@/host/sharedSettingsFile", () => ({ readSharedSettingsFile: vi.fn<() => void>() }));
vi.mock("@/host/browser/external/chromeNativeHost", () => ({
  chromeNativeHostEnabled: () => false,
}));
vi.mock("./desktopAppWindows", () => ({
  ensureMainWindow: vi.fn<() => void>(),
  focusBrowserExtractWindow: vi.fn<() => void>(),
}));
vi.mock("./ssh/sshEnvironmentSupervisor", () => ({ SshEnvironmentSupervisor: class {} }));

import { createDesktopHostServices } from "./desktopAppHostServices";

describe("desktop computer-use exit", () => {
  beforeEach(() => {
    hoisted.overlayOptions = null;
    vi.clearAllMocks();
  });

  it("cancels computer-use calls without interrupting any agent thread", () => {
    const backendCall = vi.fn<() => Promise<void>>().mockResolvedValue();
    const root = "/tmp/poracode-host-services-test";
    createDesktopHostServices({
      paths: resolvePoracodePaths(root),
      dirs: {
        mainBundleDir: root,
        supervisorPath: root,
        backendHostPath: root,
        remoteHttpBridgePath: root,
        wslHelpersDir: root,
        bundledSkillsDir: root,
        bundledPluginsDir: root,
        agentPluginsDir: root,
        computerUseHelperRoot: root,
      },
      shellState: {} as DesktopHostServicesDeps["shellState"],
      backendHost: { call: backendCall } as unknown as DesktopHostServicesDeps["backendHost"],
    });

    expect(hoisted.overlayOptions).not.toBeNull();
    hoisted.overlayOptions?.onExit(["thread-1", "thread-2"]);

    expect(hoisted.interruptActiveActions).toHaveBeenCalledExactlyOnceWith([
      "thread-1",
      "thread-2",
    ]);
    expect(backendCall).not.toHaveBeenCalled();
  });
});
