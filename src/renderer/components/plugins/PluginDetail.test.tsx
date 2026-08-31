import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { pluginFixture, seedBuiltInPlugins } from "@/renderer/testUtils/plugins";
import { PluginDetail } from "./PluginDetail";
import { useLocalizedPluginCatalog } from "./pluginCopy";

const actionMocks = vi.hoisted(() => ({
  newThreadFromText:
    vi.fn<(projectId: string, text: string, options?: { bindLeadingSkill?: boolean }) => void>(),
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

function TerminalPluginDetail() {
  const plugin = useLocalizedPluginCatalog().find(
    (candidate) => candidate.plugin.name === "terminal",
  )!;
  return <PluginDetail plugin={plugin} hostPlatform="win32" onBack={() => undefined} />;
}

function ComputerUsePluginDetail() {
  const plugin = useLocalizedPluginCatalog().find(
    (candidate) => candidate.plugin.name === "computer-use",
  )!;
  return <PluginDetail plugin={plugin} hostPlatform="linux" onBack={() => undefined} />;
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
    useSharedSettings.setState({ installedPlugins: {} });
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

  it("installs and uninstalls a plugin that starts its own server", () => {
    render(<GithubPluginDetail />);

    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(useSharedSettings.getState().installedPlugins.github).toMatchObject({ enabled: true });

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

  it("offers Try now while the plugin is enabled", async () => {
    const plugin = pluginFixture("browser-tools");
    render(<TryNowPluginDetail />);

    expect(screen.getByRole("button", { name: "Try now" })).toBeEnabled();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try now" })));
    expect(actionMocks.newThreadFromText).toHaveBeenCalledWith(
      "home-project",
      "/browser-control Inspect this page",
      { bindLeadingSkill: true },
    );
    act(() => useSharedSettings.getState().setPluginEnabled(plugin, false));
    expect(screen.getByRole("button", { name: "Try now" })).toBeDisabled();
  });

  it("disables installation when the plugin is unavailable on this device", () => {
    render(<ComputerUsePluginDetail />);

    expect(screen.getByRole("button", { name: "Unavailable on this device" })).toBeDisabled();
    expect(screen.getByText("Unavailable on this device", { selector: "p" })).toBeInTheDocument();
  });
});
