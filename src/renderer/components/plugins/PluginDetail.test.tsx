import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { pluginFixture, seedBuiltInPlugins } from "@/renderer/testUtils/plugins";
import { PluginDetail } from "./PluginDetail";
import { useLocalizedPluginCatalog } from "./pluginCopy";

function BrowserPluginDetail(props: { onBack?: () => void }) {
  const plugin = useLocalizedPluginCatalog().find(
    (candidate) => candidate.plugin.name === "browser-tools",
  )!;
  return (
    <PluginDetail plugin={plugin} hostPlatform="win32" onBack={props.onBack ?? (() => undefined)} />
  );
}

function ComputerUsePluginDetail() {
  const plugin = useLocalizedPluginCatalog().find(
    (candidate) => candidate.plugin.name === "computer-use",
  )!;
  return <PluginDetail plugin={plugin} hostPlatform="linux" onBack={() => undefined} />;
}

describe("PluginDetail", () => {
  beforeEach(() => {
    localStorage.clear();
    seedBuiltInPlugins();
    useSharedSettings.setState({ installedPlugins: {} });
  });

  it("updates plugin and skill toggles and uninstalls the bundle", () => {
    useSharedSettings.getState().installPlugin(pluginFixture("browser-tools"));
    render(<BrowserPluginDetail />);

    fireEvent.click(screen.getByRole("switch", { name: "Browser Control Skill" }));
    expect(
      useSharedSettings.getState().installedPlugins["browser-tools"]?.disabledSkillIds,
    ).toEqual(["browser-control"]);
    expect(screen.getByRole("switch", { name: "Browser Control Skill" })).not.toBeChecked();

    fireEvent.click(screen.getByRole("switch", { name: "Browser Tools Enable plugin" }));
    expect(useSharedSettings.getState().installedPlugins["browser-tools"]?.enabled).toBe(false);
    expect(screen.getByRole("switch", { name: "Browser Control Skill" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Uninstall" }));
    expect(useSharedSettings.getState().installedPlugins["browser-tools"]).toBeUndefined();
    expect(screen.getByRole("button", { name: "Install" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Enable plugin" })).not.toBeInTheDocument();
  });

  it("returns to the marketplace", () => {
    const onBack = vi.fn<() => void>();
    render(<BrowserPluginDetail onBack={onBack} />);

    fireEvent.click(screen.getByRole("button", { name: "Back to plugins" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("disables installation when the plugin is unavailable on this device", () => {
    render(<ComputerUsePluginDetail />);

    expect(screen.getByRole("button", { name: "Unavailable on this device" })).toBeDisabled();
    expect(screen.getByText("Unavailable on this device", { selector: "p" })).toBeInTheDocument();
  });
});
