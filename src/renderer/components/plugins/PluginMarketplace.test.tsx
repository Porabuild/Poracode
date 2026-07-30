import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useLocalizedPluginCatalog } from "./pluginCopy";
import { PluginMarketplace } from "./PluginMarketplace";

function Marketplace(props: { onOpen: (pluginId: string) => void }) {
  const plugins = useLocalizedPluginCatalog();
  return <PluginMarketplace plugins={plugins} hostPlatform="win32" onOpen={props.onOpen} />;
}

describe("PluginMarketplace", () => {
  beforeEach(() => {
    localStorage.clear();
    useSharedSettings.setState({ installedPlugins: {} });
  });

  it("discovers plugins by contribution text, installs one, and exposes management", () => {
    const onOpen = vi.fn<(pluginId: string) => void>();
    render(<Marketplace onOpen={onOpen} />);

    expect(screen.getByRole("tab", { name: "Discover" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Browser Tools")).toBeInTheDocument();
    expect(screen.getByText("Chrome Tools")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browser Tools Install" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chrome Tools Install" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Browser Tools" }));
    expect(onOpen).toHaveBeenCalledWith("browser-tools");
    onOpen.mockClear();

    fireEvent.change(screen.getByRole("textbox", { name: "Search plugins" }), {
      target: { value: "navigate" },
    });

    expect(screen.getByText("Browser Tools")).toBeInTheDocument();
    expect(screen.queryByText("Chrome Tools")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Browser Tools Install" }));

    expect(useSharedSettings.getState().installedPlugins["browser-tools"]).toMatchObject({
      version: "1.0.0",
      enabled: true,
    });
    expect(onOpen).toHaveBeenLastCalledWith("browser-tools");

    fireEvent.click(screen.getByRole("button", { name: "Browser Tools Manage" }));
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenLastCalledWith("browser-tools");
  });

  it("shows only installed plugins and links an empty installation list back to Discover", () => {
    useSharedSettings.getState().installPlugin("chrome-tools");
    const onOpen = vi.fn<(pluginId: string) => void>();
    const { unmount } = render(<Marketplace onOpen={onOpen} />);

    fireEvent.click(screen.getByRole("tab", { name: /^Installed/u }));

    expect(screen.getByText("Chrome Tools")).toBeInTheDocument();
    expect(screen.queryByText("Browser Tools")).not.toBeInTheDocument();
    const installedTab = screen.getByRole("tab", { name: /^Installed/u });
    expect(installedTab).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: "Chrome Tools Manage" }));
    expect(onOpen).toHaveBeenCalledWith("chrome-tools");

    unmount();
    useSharedSettings.setState({ installedPlugins: {} });
    render(<Marketplace onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("tab", { name: /^Installed/u }));

    expect(screen.getByText("No plugins installed yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discover plugins" }));
    expect(screen.getByRole("tab", { name: "Discover" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("No plugins installed yet")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Featured" })).toBeInTheDocument();
  });

  it("does not install a plugin that is unavailable on this host", () => {
    const onOpen = vi.fn<(pluginId: string) => void>();

    function LinuxMarketplace() {
      const plugins = useLocalizedPluginCatalog();
      return <PluginMarketplace plugins={plugins} hostPlatform="linux" onOpen={onOpen} />;
    }

    render(<LinuxMarketplace />);

    const computerUseCard = screen
      .getByText("Computer Use")
      .closest<HTMLElement>("[class*='min-h-40']")!;
    expect(
      within(computerUseCard).getByRole("button", {
        name: "Computer Use Unavailable on this device",
      }),
    ).toBeDisabled();
    expect(useSharedSettings.getState().installedPlugins["computer-use"]).toBeUndefined();
  });
});
