import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import type { ComposerSeedOptions } from "@/renderer/state/slices/draftSlice";
import { pluginFixture, seedBuiltInPlugins } from "@/renderer/testUtils/plugins";
import { PluginDetail } from "./PluginDetail";
import { useLocalizedPluginCatalog } from "./pluginCopy";

const actionMocks = vi.hoisted(() => ({
  newThreadFromText:
    vi.fn<(projectId: string, text: string, options?: ComposerSeedOptions) => void>(),
  ensureHomeScopeProject: vi.fn<() => Promise<{ id: string }>>(async () => ({
    id: "home-project",
  })),
}));

vi.mock("@/renderer/actions/notesActions", () => ({
  newThreadFromText: actionMocks.newThreadFromText,
}));

vi.mock("@/renderer/actions/projectActions", () => ({
  ensureHomeScopeProject: actionMocks.ensureHomeScopeProject,
}));

function BrowserPluginDetail(props: { onBack?: () => void }) {
  const plugin = useLocalizedPluginCatalog().find(
    (candidate) => candidate.plugin.name === "browser-tools",
  )!;
  return (
    <PluginDetail plugin={plugin} hostPlatform="win32" onBack={props.onBack ?? (() => undefined)} />
  );
}

function GithubPluginDetail() {
  const plugin = useLocalizedPluginCatalog().find(
    (candidate) => candidate.plugin.name === "github",
  )!;
  return <PluginDetail plugin={plugin} hostPlatform="win32" onBack={() => undefined} />;
}

function GithubOwnMcpPluginDetail() {
  const base = useLocalizedPluginCatalog().find((candidate) => candidate.plugin.name === "github")!;
  const plugin = {
    ...base,
    plugin: {
      ...base.plugin,
      mcpServers: [
        {
          name: "github",
          entry: {
            type: "streamable-http" as const,
            url: "https://api.githubcopilot.com/mcp/",
            headers: {},
          },
        },
      ],
    },
    mcpServers: [{ id: "github", name: "github" }],
  };
  return <PluginDetail plugin={plugin} hostPlatform="win32" onBack={() => undefined} />;
}

function TerminalPluginDetail() {
  const plugin = useLocalizedPluginCatalog().find(
    (candidate) => candidate.plugin.name === "terminal",
  )!;
  return <PluginDetail plugin={plugin} hostPlatform="win32" onBack={() => undefined} />;
}

function ComputerUsePluginDetail(props: { hostPlatform?: NodeJS.Platform }) {
  const plugin = useLocalizedPluginCatalog().find(
    (candidate) => candidate.plugin.name === "computer-use",
  )!;
  return (
    <PluginDetail
      plugin={plugin}
      hostPlatform={props.hostPlatform ?? "linux"}
      onBack={() => undefined}
    />
  );
}

function TryNowPluginDetail() {
  const base = useLocalizedPluginCatalog().find(
    (candidate) => candidate.plugin.name === "browser-tools",
  )!;
  const plugin = {
    ...base,
    plugin: {
      ...base.plugin,
      poracode: { ...base.plugin.poracode, examplePrompt: "Inspect this page" },
    },
  };
  return <PluginDetail plugin={plugin} hostPlatform="win32" onBack={() => undefined} />;
}

describe("PluginDetail", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    seedBuiltInPlugins();
    useSharedSettings.setState({ installedPlugins: {}, disabledBuiltInMcpServers: {} });
    usePanelStore.setState({ settingsOpen: false });
  });

  it("keeps Poracode and its skills available despite disables from the previous plugin version", () => {
    useSharedSettings.setState({
      installedPlugins: {
        "app-controls": {
          version: "1.3.0",
          enabled: false,
          disabledSkillIds: ["app-controls"],
          disabledMcpServerNames: [],
        },
      },
    });
    function AppControlsDetail() {
      const plugin = useLocalizedPluginCatalog().find(
        (candidate) => candidate.plugin.name === "app-controls",
      )!;
      return <PluginDetail plugin={plugin} hostPlatform="win32" onBack={() => undefined} />;
    }
    render(<AppControlsDetail />);
    for (const name of ["Commit", "Create PR", "Finalize", "Poracode"]) {
      expect(screen.getByText(name, { selector: "span[id*='-skill-']" })).toBeInTheDocument();
    }
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try now" })).toBeEnabled();
  });

  it("updates plugin and skill toggles for a built-in tool plugin", () => {
    // browser-tools wraps a server the app owns, so it arrives installed and
    // offers no Uninstall — only the enable switch.
    render(<BrowserPluginDetail />);

    expect(screen.getByRole("heading", { name: "MCP servers" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Browser" })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Browser MCP" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Browser Control Skill" }));
    expect(
      useSharedSettings.getState().installedPlugins["browser-tools"]?.disabledSkillIds,
    ).toEqual(["browser-control"]);
    expect(screen.getByRole("switch", { name: "Browser Control Skill" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Try now" })).toBeDisabled();

    fireEvent.click(screen.getByRole("switch", { name: "Browser Enable plugin" }));
    expect(useSharedSettings.getState().installedPlugins["browser-tools"]?.enabled).toBe(false);
    expect(screen.getByRole("switch", { name: "Browser Control Skill" })).toBeDisabled();

    expect(screen.queryByRole("button", { name: "Uninstall" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
    expect(screen.getByText("Built-in")).toBeInTheDocument();
  });

  it("keeps the Terminal plugin always on", () => {
    render(<TerminalPluginDetail />);

    expect(screen.getByRole("heading", { name: "Terminal" })).toBeInTheDocument();
    expect(screen.getByText("Built-in")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /Enable plugin/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /Skill/iu })).not.toBeInTheDocument();

    act(() => useSharedSettings.getState().setPluginEnabled(pluginFixture("terminal"), false));
    expect(useSharedSettings.getState().installedPlugins.terminal).toBeUndefined();
  });

  it("offers Devices enabled by default with a switch to disable its tools", () => {
    function DevicesDetail() {
      const plugin = useLocalizedPluginCatalog().find((entry) => entry.plugin.name === "devices")!;
      return <PluginDetail plugin={plugin} hostPlatform="win32" onBack={() => undefined} />;
    }
    render(<DevicesDetail />);
    expect(screen.getByRole("heading", { name: "Devices" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Devices Enable plugin" })).toBeChecked();
    fireEvent.click(screen.getByRole("switch", { name: "Devices Enable plugin" }));
    expect(useSharedSettings.getState().installedPlugins.devices?.enabled).toBe(false);
    expect(screen.getByRole("switch", { name: "Devices Skill" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Uninstall" })).not.toBeInTheDocument();
  });

  it("starts installed plugins with their own server through Try now", async () => {
    render(<GithubPluginDetail />);

    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(useSharedSettings.getState().installedPlugins.github).toMatchObject({ enabled: true });

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try now" })));
    expect(actionMocks.newThreadFromText).toHaveBeenCalledWith(
      "home-project",
      "/github Inspect PRs, triage issues, debug failing checks, and prepare code changes for review",
      { bindLeadingSkill: true, leadingSkillPluginId: "github" },
    );

    fireEvent.click(screen.getByRole("button", { name: "Uninstall" }));
    expect(useSharedSettings.getState().installedPlugins.github).toBeUndefined();
    expect(screen.getByRole("button", { name: "Install" })).toBeInTheDocument();
  });

  it("returns to the marketplace", () => {
    const onBack = vi.fn<() => void>();
    render(<BrowserPluginDetail onBack={onBack} />);

    fireEvent.click(screen.getByRole("button", { name: "Back to plugins" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("removes a receipt-owned package through the catalog action while preserving contribution controls", () => {
    const onRemove = vi.fn<() => Promise<void>>().mockResolvedValue();
    const onReview = vi.fn<() => void>();
    useSharedSettings.getState().installPlugin(pluginFixture("github"));
    function CatalogDetail() {
      const base = useLocalizedPluginCatalog().find((item) => item.plugin.name === "github")!;
      return (
        <PluginDetail
          plugin={{ ...base, plugin: { ...base.plugin, source: "user" } }}
          hostPlatform="win32"
          onBack={() => undefined}
          catalogPackage={{
            busy: false,
            error: false,
            onRemove,
            onReview,
            receipt: {
              formatVersion: 1,
              pluginName: "github",
              entryName: "github",
              catalogId: "8b71e462-020e-416a-b194-c9339156b8ef",
              catalogName: "Team source",
              catalogSource: { type: "local", path: "/team" },
              packageSource: { type: "path", path: "./github" },
              revision: "installed-revision",
              digest: "installed-digest",
              installedAt: 1,
            },
          }}
        />
      );
    }
    render(<CatalogDetail />);
    expect(screen.queryByRole("button", { name: "Uninstall" })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "GitHub Enable plugin" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review update" }));
    expect(onReview).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Remove plugin" }));
    expect(onRemove).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove plugin" }),
    );
    expect(onRemove).toHaveBeenCalledOnce();
    expect(useSharedSettings.getState().installedPlugins.github).toBeDefined();
  });

  it("offers Try now while the plugin is enabled", async () => {
    const plugin = pluginFixture("browser-tools");
    render(<TryNowPluginDetail />);

    expect(screen.getByRole("button", { name: "Try now" })).toBeEnabled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try now" })));
    expect(actionMocks.newThreadFromText).toHaveBeenCalledWith(
      "home-project",
      "/browser-control Inspect this page",
      {
        bindLeadingSkill: true,
        leadingSkillPluginId: "browser-tools",
        enableMcpServerIds: ["browser"],
      },
    );
    expect(screen.getByRole("button", { name: "Inspect this page" })).toHaveClass(
      "min-w-0",
      "max-w-full",
      "overflow-hidden",
    );
    expect(screen.getByText("Inspect this page")).toHaveClass("truncate");
    act(() => useSharedSettings.getState().setPluginEnabled(plugin, false));
    expect(screen.getByRole("button", { name: "Try now" })).toBeDisabled();
  });

  it("supports Computer Use on Linux", () => {
    render(<ComputerUsePluginDetail />);

    expect(screen.getByRole("heading", { name: "Computer Use" })).toBeInTheDocument();
    expect(screen.queryByText("Unavailable on this device")).not.toBeInTheDocument();
  });

  it("enables Computer Use for the draft created by Try now", async () => {
    render(<ComputerUsePluginDetail />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try now" })));

    expect(actionMocks.newThreadFromText).toHaveBeenCalledWith(
      "home-project",
      "/computer-use Operate the requested desktop app in small verified steps and report the final window state",
      {
        bindLeadingSkill: true,
        leadingSkillPluginId: "computer-use",
        enableMcpServerIds: ["computer-use"],
      },
    );
  });

  it("disables Try now when the host or a bundled MCP server is unavailable", () => {
    const { unmount } = render(<ComputerUsePluginDetail hostPlatform="aix" />);

    expect(screen.getByRole("button", { name: "Try now" })).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Operate the requested desktop app in small verified steps and report the final window state",
      }),
    ).toBeDisabled();

    unmount();
    act(() => useSharedSettings.setState({ disabledBuiltInMcpServers: { "computer-use": true } }));
    render(<ComputerUsePluginDetail />);

    expect(screen.getByRole("button", { name: "Try now" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Try now" }));
    expect(actionMocks.newThreadFromText).not.toHaveBeenCalled();
  });

  it("disables Try now when a plugin-owned MCP server is disabled", () => {
    useSharedSettings.setState({
      installedPlugins: {
        github: {
          version: "1.1.0",
          enabled: true,
          disabledSkillIds: [],
          disabledMcpServerNames: ["github"],
        },
      },
    });

    render(<GithubOwnMcpPluginDetail />);

    expect(screen.getByRole("button", { name: "Try now" })).toBeDisabled();
  });

  it("revalidates plugin contributions after Home discovery", async () => {
    let resolveHomeProject!: (project: { id: string }) => void;
    actionMocks.ensureHomeScopeProject.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveHomeProject = resolve;
        }),
    );
    usePanelStore.setState({ settingsOpen: true });
    render(<ComputerUsePluginDetail />);

    fireEvent.click(screen.getByRole("button", { name: "Try now" }));
    expect(actionMocks.ensureHomeScopeProject).toHaveBeenCalledOnce();
    act(() => useSharedSettings.setState({ disabledBuiltInMcpServers: { "computer-use": true } }));
    await act(async () => resolveHomeProject({ id: "home-project" }));

    expect(actionMocks.newThreadFromText).not.toHaveBeenCalled();
    expect(usePanelStore.getState().settingsOpen).toBe(true);
  });
});
