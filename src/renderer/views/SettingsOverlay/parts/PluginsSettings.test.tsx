import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { PluginsSettings } from "./PluginsSettings";

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ platform: "win32" }),
}));

describe("PluginsSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    useSharedSettings.setState({ installedPlugins: {} });
  });

  it("moves focus into plugin detail and restores it to the marketplace card", () => {
    useSharedSettings.getState().installPlugin("browser-tools");
    render(<PluginsSettings />);

    fireEvent.click(screen.getByRole("tab", { name: /^Installed/u }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search plugins" }), {
      target: { value: "browser" },
    });
    const pluginButton = screen.getByRole("button", { name: "Browser Tools" });
    fireEvent.click(pluginButton);

    expect(screen.getByRole("button", { name: "Back to plugins" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Back to plugins" }));

    expect(screen.getByRole("button", { name: "Browser Tools" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: /^Installed/u })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("textbox", { name: "Search plugins" })).toHaveValue("browser");
  });

  it("restores focus to the active tab when the installed card was removed", () => {
    useSharedSettings.getState().installPlugin("browser-tools");
    render(<PluginsSettings />);

    const installedTab = screen.getByRole("tab", { name: /^Installed/u });
    fireEvent.click(installedTab);
    fireEvent.click(screen.getByRole("button", { name: "Browser Tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Uninstall" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to plugins" }));

    expect(installedTab).toHaveFocus();
  });
});
