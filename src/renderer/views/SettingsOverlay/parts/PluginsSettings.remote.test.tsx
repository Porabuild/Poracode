import { act, fireEvent, renderHook, screen, waitFor } from "@testing-library/react";
import { toast } from "@heroui/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { pluginFixture, seedBuiltInPlugins } from "@/renderer/testUtils/plugins";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import {
  usePluginCatalog,
  type PluginCatalogHost,
} from "@/renderer/components/plugins/usePluginCatalog";
import type { InstalledPlugins, LoadedPlugin } from "@/shared/contracts";
import type { PluginCatalogResult } from "@/shared/contracts/pluginCatalog";
import { PluginsSettings } from "./PluginsSettings";

const mocks = vi.hoisted(() => ({
  paired: undefined as
    | {
        generation: number;
        settings?: {
          installedPlugins?: InstalledPlugins;
          disabledBuiltInMcpServers: Record<string, boolean>;
        };
        error?: unknown;
      }
    | undefined,
  edit: vi.fn<(desktopId: string, edit: (current: unknown) => unknown) => Promise<void>>(),
  refresh: vi.fn<(desktopId: string, generation: number) => void>(),
  callRemoteProcedure: vi.fn<(procedure: string, payload: unknown) => Promise<unknown>>(),
}));

vi.mock("@/renderer/state/pairedHostSettings", () => ({
  usePairedHostSettings: () => mocks.paired,
  editPairedHostSettings: (desktopId: string, edit: (current: unknown) => unknown) =>
    mocks.edit(desktopId, edit),
  refreshPairedHostSettings: (desktopId: string, generation: number) =>
    mocks.refresh(desktopId, generation),
}));

vi.mock("@/renderer/components/plugins/ComputerUsePluginSettings", () => ({
  ComputerUsePluginSettings: () => <div data-testid="computer-use-plugin-settings" />,
}));

const connectionKey = "remote-one";

function defaultPaired() {
  return {
    generation: 1,
    settings: {
      installedPlugins: {
        github: {
          version: "1.0.0",
          enabled: true,
          disabledSkillIds: [],
          disabledMcpServerNames: [],
        },
      },
      disabledBuiltInMcpServers: {},
    },
  };
}

describe("PluginsSettings remote host", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    seedBuiltInPlugins();
    useAppStore.setState({
      projects: [],
      threads: [],
      focusedPaneId: null,
      view: { kind: "home" },
    });
    mocks.paired = defaultPaired();
    mocks.callRemoteProcedure.mockReset();
    mocks.callRemoteProcedure.mockImplementation(async (procedure: string, payload: unknown) => {
      if (procedure === "refreshPlugins" || procedure === "listPlugins") {
        return { plugins: [pluginFixture("github")], userPluginsDir: "/remote/plugins" };
      }
      if (procedure === "pluginCatalog") {
        return { catalogs: [], installations: [] };
      }
      if (procedure === "pluginAccounts") return { accounts: [] };
      throw new Error(`unexpected procedure ${procedure}: ${JSON.stringify(payload)}`);
    });
    mocks.edit.mockReset().mockResolvedValue(undefined);
    mocks.refresh.mockReset();
    useRemoteServersStore.setState({
      runtime: {
        [connectionKey]: { status: "online", projects: [], threads: [] },
      },
    });
    vi.spyOn(useRemoteServersStore.getState(), "withClient").mockImplementation(
      async (_desktopId, invoke) =>
        invoke({
          callRemoteProcedure: mocks.callRemoteProcedure,
        } as never),
    );
  });

  it("loads the paired host's inventory and writes its plugin state", async () => {
    render(<PluginsSettings connectionKey={connectionKey} hostPlatform="linux" />);

    const card = await screen.findByText("GitHub");
    expect(mocks.callRemoteProcedure).toHaveBeenCalledWith("refreshPlugins", {});
    expect(mocks.callRemoteProcedure).toHaveBeenCalledWith("pluginCatalog", { action: "list" });
    // The folder lives in the host's file manager, so a remote host has no
    // local "open folder" action.
    expect(screen.queryByRole("button", { name: "Plugin folder" })).not.toBeInTheDocument();

    fireEvent.click(card.closest<HTMLElement>("[data-plugin-row]")!.querySelector("button")!);
    fireEvent.click(screen.getByRole("switch", { name: /Enable plugin/ }));

    await waitFor(() => expect(mocks.edit).toHaveBeenCalledTimes(1));
    const [, edit] = mocks.edit.mock.calls[0] as [
      string,
      (current: NonNullable<typeof mocks.paired>["settings"]) => unknown,
    ];
    expect(
      edit({
        disabledBuiltInMcpServers: {},
        installedPlugins: {
          github: {
            version: "1.0.0",
            enabled: true,
            disabledSkillIds: [],
            disabledMcpServerNames: [],
          },
        },
      }),
    ).toEqual({
      installedPlugins: {
        github: {
          version: "1.0.0",
          enabled: false,
          disabledSkillIds: [],
          disabledMcpServerNames: [],
        },
      },
    });
  });

  it("pre-upgrade: shows an update hint and calls no plugin procedures on an older host", () => {
    mocks.paired = {
      generation: 1,
      settings: {
        disabledBuiltInMcpServers: {},
      },
    };
    render(<PluginsSettings connectionKey={connectionKey} hostPlatform="linux" />);

    expect(screen.getByText("Update the remote server first.")).toBeInTheDocument();
    expect(mocks.callRemoteProcedure).not.toHaveBeenCalled();
  });

  it("renders a retryable load alert instead of an outdated-host hint on transient settings errors", () => {
    mocks.paired = { generation: 1, error: new Error("timeout") };
    render(<PluginsSettings connectionKey={connectionKey} hostPlatform="linux" />);

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load plugins.");
    expect(screen.queryByText("Update the remote server first.")).not.toBeInTheDocument();
    expect(mocks.callRemoteProcedure).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refresh).toHaveBeenCalledWith(connectionKey, 0);
  });

  it("waits until the paired host is online before issuing RPCs and loads when it connects", async () => {
    useRemoteServersStore.setState({
      runtime: {
        [connectionKey]: { status: "connecting", projects: [], threads: [] },
      },
    });
    render(<PluginsSettings connectionKey={connectionKey} hostPlatform="linux" />);

    expect(screen.getByText("Connecting…")).toBeInTheDocument();
    expect(mocks.callRemoteProcedure).not.toHaveBeenCalled();

    act(() => {
      useRemoteServersStore.setState({
        runtime: {
          [connectionKey]: { status: "online", projects: [], threads: [] },
        },
      });
    });

    expect(await screen.findByText("GitHub")).toBeInTheDocument();
    expect(mocks.callRemoteProcedure).toHaveBeenCalledWith("refreshPlugins", {});
    expect(mocks.callRemoteProcedure).toHaveBeenCalledWith("pluginCatalog", { action: "list" });
  });

  it("hides local-only controls, example prompt launchers, and remote interactive OAuth begin while allowing account logout", async () => {
    const remotePlugin: LoadedPlugin = {
      ...pluginFixture("github"),
      poracode: {
        ...pluginFixture("github").poracode,
        examplePrompt: "List open pull requests",
      },
      mcpServers: [
        {
          name: "service",
          entry: {
            type: "streamable-http",
            url: "https://api.example.test/mcp",
            headers: {},
          },
        },
      ],
    };
    const accountId = "23700f34-528d-405a-9611-a80fe0c393ed";
    mocks.callRemoteProcedure.mockImplementation(async (procedure: string, payload: unknown) => {
      if (procedure === "refreshPlugins") {
        return { plugins: [remotePlugin], userPluginsDir: "/remote/plugins" };
      }
      if (procedure === "pluginCatalog") return { catalogs: [], installations: [] };
      if (procedure === "pluginAccounts") {
        const req = payload as { action: string };
        return {
          accounts: [
            {
              id: accountId,
              pluginName: "github",
              serverName: "service",
              label: "Work",
              scopes: ["repo:read"],
              selected: true,
              status: req.action === "logout" ? "disconnected" : "connected",
            },
          ],
        };
      }
      throw new Error(`unexpected procedure ${procedure}`);
    });

    render(<PluginsSettings connectionKey={connectionKey} hostPlatform="linux" />);

    const card = await screen.findByText("GitHub");
    fireEvent.click(card.closest<HTMLElement>("[data-plugin-row]")!.querySelector("button")!);

    expect(screen.queryByRole("button", { name: "Try now" })).not.toBeInTheDocument();
    expect(screen.queryByText("List open pull requests")).not.toBeInTheDocument();
    expect(screen.queryByTestId("computer-use-plugin-settings")).not.toBeInTheDocument();

    expect(
      await screen.findByText("Sign in on the paired desktop, then refresh this status."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add account" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() =>
      expect(mocks.callRemoteProcedure).toHaveBeenCalledWith("pluginAccounts", {
        action: "logout",
        pluginName: "github",
        serverName: "service",
        accountId,
      }),
    );
  });

  it("includes the remote project's fs path when requesting project-scoped plugin artwork", async () => {
    const projectPlugin: LoadedPlugin = {
      ...pluginFixture("github"),
      source: "project",
      root: "/srv/repo/.poracode/plugins/github",
    };
    useAppStore.setState({
      projects: [
        {
          id: "proj-remote",
          name: "Remote Repo",
          createdAt: "2026-01-01",
          remoteServerId: connectionKey,
          remoteId: "remote-proj-1",
          location: { kind: "posix", path: "/srv/repo", remoteServerId: connectionKey },
        },
      ],
      threads: [],
      focusedPaneId: null,
      view: { kind: "draft", projectId: "proj-remote" },
    });
    mocks.callRemoteProcedure.mockImplementation(async (procedure: string) => {
      if (procedure === "refreshPlugins") {
        return { plugins: [projectPlugin], userPluginsDir: "/remote/plugins" };
      }
      if (procedure === "pluginCatalog") return { catalogs: [], installations: [] };
      return { accounts: [] };
    });

    render(<PluginsSettings connectionKey={connectionKey} hostPlatform="linux" />);

    await screen.findByText("GitHub");
    expect(mocks.callRemoteProcedure).toHaveBeenCalledWith("refreshPlugins", {
      projectLocation: { kind: "posix", path: "/srv/repo" },
    });
    await waitFor(() =>
      expect(mocks.callRemoteProcedure).toHaveBeenCalledWith("pluginCatalog", {
        action: "artwork",
        version: 1,
        target: {
          type: "plugin",
          pluginName: "github",
          projectFsPath: "/srv/repo",
        },
      }),
    );
  });

  it("surfaces a toast when a remote plugin toggle write fails", async () => {
    const dangerToast = vi.spyOn(toast, "danger").mockImplementation(() => "" as never);
    mocks.edit.mockRejectedValueOnce(new Error("Connection failed."));
    render(<PluginsSettings connectionKey={connectionKey} hostPlatform="linux" />);

    const card = await screen.findByText("GitHub");
    fireEvent.click(card.closest<HTMLElement>("[data-plugin-row]")!.querySelector("button")!);
    fireEvent.click(screen.getByRole("switch", { name: /Enable plugin/ }));

    await waitFor(() => expect(dangerToast).toHaveBeenCalledTimes(1));
  });

  it("ignores stale in-flight catalog actions when hostKey switches", async () => {
    let resolveInspectA!: (value: PluginCatalogResult) => void;
    let resolveListB!: (value: PluginCatalogResult) => void;
    const hostA: PluginCatalogHost = {
      pluginCatalog: vi.fn<PluginCatalogHost["pluginCatalog"]>(async (payload) => {
        if (payload.action === "list") return { catalogs: [], installations: [] };
        return new Promise<PluginCatalogResult>((resolve) => {
          resolveInspectA = resolve;
        });
      }),
      installPlugin: vi.fn<PluginCatalogHost["installPlugin"]>(),
      uninstallPlugin: vi.fn<PluginCatalogHost["uninstallPlugin"]>(),
      findPlugin: () => undefined,
      reloadPlugins: vi.fn<PluginCatalogHost["reloadPlugins"]>(async () => undefined),
    };
    const hostB: PluginCatalogHost = {
      pluginCatalog: vi.fn<PluginCatalogHost["pluginCatalog"]>(
        () =>
          new Promise<PluginCatalogResult>((resolve) => {
            resolveListB = resolve;
          }),
      ),
      installPlugin: vi.fn<PluginCatalogHost["installPlugin"]>(),
      uninstallPlugin: vi.fn<PluginCatalogHost["uninstallPlugin"]>(),
      findPlugin: () => undefined,
      reloadPlugins: vi.fn<PluginCatalogHost["reloadPlugins"]>(async () => undefined),
    };

    const { result, rerender } = renderHook(
      (props: { host: PluginCatalogHost; hostKey: string }) =>
        usePluginCatalog(undefined, props.host, props.hostKey),
      { initialProps: { host: hostA, hostKey: "host-a" } },
    );
    await waitFor(() => expect(result.current.busy).toBe(false));

    await act(async () => {
      void result.current.run({
        action: "inspect",
        catalogId: "11111111-1111-4111-8111-111111111111",
        entryName: "github",
      });
    });
    expect(result.current.busy).toBe(true);

    rerender({ host: hostB, hostKey: "host-b" });

    await act(async () => {
      resolveInspectA({
        catalogs: [],
        installations: [],
        inspection: {
          revision: "rev-a",
          digest: "digest-a",
          plugin: pluginFixture("github"),
        },
      });
    });

    // Host A's late inspect must not clear host B's busy state or leak its review.
    expect(result.current.busy).toBe(true);
    expect(result.current.review).toBeUndefined();

    await act(async () => {
      resolveListB({ catalogs: [], installations: [] });
    });
    expect(result.current.busy).toBe(false);
  });
});
