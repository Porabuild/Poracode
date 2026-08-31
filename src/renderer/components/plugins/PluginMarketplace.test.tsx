import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { pluginFixture, seedBuiltInPlugins } from "@/renderer/testUtils/plugins";
import { useLocalizedPluginCatalog } from "./pluginCopy";
import { PluginMarketplace } from "./PluginMarketplace";

function Marketplace(props: { onOpen: (pluginId: string) => void }) {
  const plugins = useLocalizedPluginCatalog();
  return <PluginMarketplace plugins={plugins} hostPlatform="win32" onOpen={props.onOpen} />;
}

describe("PluginMarketplace", () => {
  beforeEach(() => {
    localStorage.clear();
    seedBuiltInPlugins();
    useSharedSettings.setState({ installedPlugins: {} });
  });

  it("browses plugins by contribution text, installs one, and exposes management", () => {
    const onOpen = vi.fn<(pluginId: string) => void>();
    render(<Marketplace onOpen={onOpen} />);

    expect(screen.getByRole("heading", { name: "Featured" })).toBeInTheDocument();
    expect(screen.getByText("Browser Tools")).toBeInTheDocument();
    expect(screen.getByText("Chrome Tools")).toBeInTheDocument();
    // Packages that only wrap a built-in server ship with the app, so they are
    // managed rather than installed.
    expect(screen.getByRole("button", { name: "Browser Tools Manage" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Browser Tools" }));
    expect(onOpen).toHaveBeenCalledWith("browser-tools");
    onOpen.mockClear();

    fireEvent.change(screen.getByRole("textbox", { name: "Search plugins" }), {
      target: { value: "github" },
    });

    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.queryByText("Browser Tools")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "GitHub Install" }));

    expect(useSharedSettings.getState().installedPlugins.github).toMatchObject({
      version: "1.1.0",
      enabled: true,
    });
    expect(onOpen).toHaveBeenLastCalledWith("github");

    fireEvent.click(screen.getByRole("button", { name: "GitHub Manage" }));
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenLastCalledWith("github");
  });

  it("surfaces installed plugins in the installed strip", () => {
    const onOpen = vi.fn<(pluginId: string) => void>();
    render(<Marketplace onOpen={onOpen} />);

    // The shortcut is named distinctly from the card title so a screen reader
    // does not read two identically-named controls for the same plugin.
    const strip = screen.getByRole("heading", { name: "Installed" }).closest("section")!;
    // Built-in tool plugins are there from the start; an opt-in package only
    // joins them once the user installs it.
    expect(within(strip).getByRole("button", { name: "Open Chrome Tools" })).toBeInTheDocument();
    expect(within(strip).queryByRole("button", { name: "Open GitHub" })).not.toBeInTheDocument();

    act(() => useSharedSettings.getState().installPlugin(pluginFixture("github")));
    expect(within(strip).getByRole("button", { name: "Open GitHub" })).toBeInTheDocument();

    fireEvent.click(within(strip).getByRole("button", { name: "Open Chrome Tools" }));
    expect(onOpen).toHaveBeenCalledWith("chrome-tools");
  });

  it("groups non-featured plugins under their category", () => {
    render(<Marketplace onOpen={vi.fn<(pluginId: string) => void>()} />);

    // Every shipped package is featured, so a category heading only appears for
    // one that is not — the section list is derived, never hardcoded.
    expect(screen.queryByRole("heading", { name: "Communication" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Featured" })).toBeInTheDocument();
  });

  it("reports when nothing matches the search", () => {
    render(<Marketplace onOpen={vi.fn<(pluginId: string) => void>()} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Search plugins" }), {
      target: { value: "nothing matches this" },
    });

    expect(screen.getByText("No plugins match your search.")).toBeInTheDocument();
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
