import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { pluginFixture, seedBuiltInPlugins } from "@/renderer/testUtils/plugins";
import { PluginsSettings } from "./PluginsSettings";

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ platform: "win32" }),
}));

describe("PluginsSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    seedBuiltInPlugins();
    useSharedSettings.setState({ installedPlugins: {} });
  });

  it("moves focus into plugin detail and restores it to the marketplace card", () => {
    useSharedSettings.getState().installPlugin(pluginFixture("browser-tools"));
    render(<PluginsSettings />);

    fireEvent.change(screen.getByRole("textbox", { name: "Search plugins" }), {
      target: { value: "browser tools" },
    });
    const card = screen.getByText("Browser Tools").closest<HTMLElement>("[class*='min-h-40']")!;
    fireEvent.click(within(card).getByRole("button", { name: "Browser Tools" }));

    expect(screen.getByRole("button", { name: "Back to plugins" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Back to plugins" }));

    expect(
      within(
        screen.getByText("Browser Tools").closest<HTMLElement>("[class*='min-h-40']")!,
      ).getByRole("button", { name: "Browser Tools" }),
    ).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Search plugins" })).toHaveValue("browser tools");
  });

  it("keeps focus on the card after uninstalling from the detail page", () => {
    useSharedSettings.getState().installPlugin(pluginFixture("browser-tools"));
    render(<PluginsSettings />);

    const card = screen.getByText("Browser Tools").closest<HTMLElement>("[class*='min-h-40']")!;
    fireEvent.click(within(card).getByRole("button", { name: "Browser Tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Uninstall" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to plugins" }));

    // The card stays in the marketplace after uninstalling; only its action flips.
    const restored = screen.getByText("Browser Tools").closest<HTMLElement>("[class*='min-h-40']")!;
    expect(within(restored).getByRole("button", { name: "Browser Tools" })).toHaveFocus();
    expect(within(restored).getByRole("button", { name: "Browser Tools Install" })).toBeVisible();
  });
});
