import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { pluginFixture, seedBuiltInPlugins } from "@/renderer/testUtils/plugins";
import { usePlugins } from "@/renderer/state/pluginsStore";
import { PluginsSettings } from "./PluginsSettings";
import type { PluginCatalogPayload, PluginCatalogResult } from "@/shared/contracts/pluginCatalog";

const mocks = vi.hoisted(() => ({
  pluginCatalog: vi.fn<(payload: PluginCatalogPayload) => Promise<PluginCatalogResult>>(),
  artwork: vi.fn<(payload: PluginCatalogPayload) => Promise<PluginCatalogResult>>(),
}));
vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: () => false,
  readBridge: () => ({
    platform: "win32",
    pluginCatalog: (payload: PluginCatalogPayload) =>
      payload.action === "artwork" ? mocks.artwork(payload) : mocks.pluginCatalog(payload),
  }),
}));

describe("PluginsSettings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.pluginCatalog.mockReset().mockResolvedValue({ catalogs: [], installations: [] });
    // Icons resolve optional artwork separately from catalog operations, so
    // marketplace assertions stay limited to the calls the page actually makes.
    mocks.artwork.mockReset().mockResolvedValue({ catalogs: [], installations: [] });
    vi.spyOn(usePlugins.getState(), "load").mockResolvedValue();
    localStorage.clear();
    seedBuiltInPlugins();
    useSharedSettings.setState({ installedPlugins: {} });
  });

  it("moves focus into plugin detail and restores it to the marketplace card", () => {
    useSharedSettings.getState().installPlugin(pluginFixture("browser-tools"));
    render(<PluginsSettings />);

    fireEvent.change(screen.getByRole("textbox", { name: "Search plugins" }), {
      target: { value: "browser" },
    });
    const card = screen.getByText("Browser").closest<HTMLElement>("[data-plugin-row]")!;
    fireEvent.click(within(card).getByRole("button", { name: "Browser" }));

    expect(screen.getByRole("button", { name: "Back to plugins" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Back to plugins" }));

    expect(
      within(screen.getByText("Browser").closest<HTMLElement>("[data-plugin-row]")!).getByRole(
        "button",
        { name: "Browser" },
      ),
    ).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Search plugins" })).toHaveValue("browser");
  });

  it("restores focus to the card, not the installed shortcut, with no search query", () => {
    // The installed strip renders before the card grid. Both used to carry
    // `data-plugin-id`, so focus restore landed on the strip and jumped the user
    // to the top of the page. Neither other focus test covers this: one types a
    // query (hiding the strip) and the other uninstalls first (emptying it).
    useSharedSettings.getState().installPlugin(pluginFixture("browser-tools"));
    render(<PluginsSettings />);

    const card = screen.getByText("Browser").closest<HTMLElement>("[data-plugin-row]")!;
    fireEvent.click(within(card).getByRole("button", { name: "Browser" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to plugins" }));

    const restored = screen.getByText("Browser").closest<HTMLElement>("[data-plugin-row]")!;
    expect(within(restored).getByRole("button", { name: "Browser" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Open Browser" })).not.toHaveFocus();
  });

  it("keeps focus on the card after uninstalling from the detail page", () => {
    // github brings its own server, so it is the opt-in kind that can be
    // uninstalled — built-in tool plugins only offer an enable switch.
    useSharedSettings.getState().installPlugin(pluginFixture("github"));
    render(<PluginsSettings />);

    const card = screen.getByText("GitHub").closest<HTMLElement>("[data-plugin-row]")!;
    fireEvent.click(within(card).getByRole("button", { name: "GitHub" }));
    fireEvent.click(screen.getByRole("button", { name: "Uninstall" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to plugins" }));

    // The card stays in the marketplace after uninstalling; only its action flips.
    const restored = screen.getByText("GitHub").closest<HTMLElement>("[data-plugin-row]")!;
    expect(within(restored).getByRole("button", { name: "GitHub" })).toHaveFocus();
    expect(within(restored).getByRole("button", { name: "GitHub Install" })).toBeVisible();
  });

  it("opens an attributed catalog preview without cloning and restores focus to its exact source row", async () => {
    const ids = ["8b71e462-020e-416a-b194-c9339156b8ef", "8b71e462-020e-416a-b194-c9339156b8ee"];
    mocks.pluginCatalog.mockResolvedValue({
      installations: [],
      catalogs: ids.map((id, index) => ({
        id,
        name: index ? "Second source" : "First source",
        source: { type: "local", path: `/source-${index}` },
        revision: "revision",
        refreshedAt: 1,
        entries: [
          {
            name: "notes",
            description: "Notes workflow",
            source: { type: "path", path: "./notes" },
            unavailable: [],
          },
        ],
      })),
    });
    render(<PluginsSettings />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search plugins" }), {
      target: { value: "notes" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Review notes from Second source" }));
    expect(screen.getByRole("button", { name: "Back to plugins" })).toHaveFocus();
    expect(screen.getByText("/source-1")).toBeInTheDocument();
    expect(mocks.pluginCatalog.mock.calls).toEqual([[{ action: "list" }]]);
    fireEvent.click(screen.getByRole("button", { name: "Back to plugins" }));
    await waitFor(() => {
      const row = screen
        .getByRole("button", { name: "Review notes from Second source" })
        .closest("article")!;
      expect(within(row).getByRole("button", { name: "notes" })).toHaveFocus();
    });
    expect(screen.getByRole("textbox", { name: "Search plugins" })).toHaveValue("notes");
  });
});
