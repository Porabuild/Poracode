import { act, fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { pluginFixture, seedBuiltInPlugins } from "@/renderer/testUtils/plugins";
import { useLocalizedPluginCatalog } from "./pluginCopy";
import { PluginIcon } from "./PluginIcon";
import { PluginMarketplace } from "./PluginMarketplace";
import { usePluginCatalog, type PluginCatalogTarget } from "./usePluginCatalog";
import type { PluginCatalogPayload, PluginCatalogResult } from "@/shared/contracts/pluginCatalog";

const mocks = vi.hoisted(() => ({
  pluginCatalog: vi.fn<(payload: PluginCatalogPayload) => Promise<PluginCatalogResult>>(),
  artwork: vi.fn<(payload: PluginCatalogPayload) => Promise<PluginCatalogResult>>(),
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    pluginCatalog: (payload: PluginCatalogPayload) =>
      payload.action === "artwork" ? mocks.artwork(payload) : mocks.pluginCatalog(payload),
  }),
  isRemoteSession: () => false,
}));

function Marketplace(props: { onOpen: (pluginId: string) => void }) {
  const plugins = useLocalizedPluginCatalog();
  const catalog = usePluginCatalog();
  return (
    <PluginMarketplace
      plugins={plugins}
      hostPlatform="win32"
      catalog={catalog}
      onOpen={props.onOpen}
      onOpenCatalog={() => undefined}
    />
  );
}

describe("PluginMarketplace", () => {
  beforeEach(() => {
    mocks.pluginCatalog.mockReset().mockResolvedValue({ catalogs: [], installations: [] });
    mocks.artwork.mockReset().mockResolvedValue({ catalogs: [], installations: [] });
    localStorage.clear();
    seedBuiltInPlugins();
    useSharedSettings.setState({ installedPlugins: {} });
  });

  it("uses source-qualified artwork and falls back after a broken image or target switch", async () => {
    const png = "data:image/png;base64,aGVsbG8=";
    mocks.artwork.mockResolvedValue({
      catalogs: [],
      installations: [],
      artwork: { version: 1, dataUrl: png },
    });
    const { container, rerender } = render(
      <PluginIcon
        pluginId="notes"
        target={{
          type: "catalog",
          catalogId: "00000000-0000-4000-8000-000000000001",
          entryName: "notes",
        }}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector("img")).toHaveAttribute("src", png);
    expect(mocks.artwork).toHaveBeenCalledWith({
      action: "artwork",
      version: 1,
      target: {
        type: "catalog",
        catalogId: "00000000-0000-4000-8000-000000000001",
        entryName: "notes",
      },
    });
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("n");
    mocks.artwork.mockResolvedValue({ catalogs: [], installations: [] });
    rerender(<PluginIcon pluginId="other" />);
    expect(container.querySelector("img")).toBeNull();
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toBe("o");
  });

  it("uses local plugin logos and distinct initials without remote image requests", () => {
    const { container, rerender } = render(<PluginIcon pluginId="app-controls" />);
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    for (const pluginId of ["github", "chrome-tools", "outlook"]) {
      rerender(<PluginIcon pluginId={pluginId} />);
      expect(container.querySelector("svg path")).toBeInTheDocument();
      expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
      expect(container.querySelector("img")).not.toBeInTheDocument();
    }
    rerender(<PluginIcon pluginId="release-notes" />);
    expect(container.textContent).toBe("rn");
    rerender(<PluginIcon pluginId="team-calendar" />);
    expect(container.textContent).toBe("tc");
    expect(container.querySelector("img, iframe")).not.toBeInTheDocument();
  });

  it("browses plugins by contribution text, installs one, and exposes management", () => {
    const onOpen = vi.fn<(pluginId: string) => void>();
    render(<Marketplace onOpen={onOpen} />);

    expect(screen.getByRole("heading", { name: "Plugins" })).toBeInTheDocument();
    expect(screen.getByText("Browser")).toBeInTheDocument();
    expect(screen.getByText("Chrome")).toBeInTheDocument();
    expect(screen.getByText("Terminal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Devices Manage" })).toBeInTheDocument();
    // Packages that only wrap a built-in server ship with the app, so they are
    // managed rather than installed.
    expect(screen.getByRole("button", { name: "Browser Manage" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Browser" }));
    expect(onOpen).toHaveBeenCalledWith("browser-tools");
    onOpen.mockClear();

    fireEvent.change(screen.getByRole("textbox", { name: "Search plugins" }), {
      target: { value: "github" },
    });

    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.queryByText("Browser")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "GitHub Install" }));

    expect(useSharedSettings.getState().installedPlugins.github).toMatchObject({
      version: "1.2.0",
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
    const strip = screen.getByRole("heading", { name: "Your plugins" }).closest("section")!;
    // Built-in tool plugins are there from the start; an opt-in package only
    // joins them once the user installs it.
    expect(within(strip).getByRole("button", { name: "Open Chrome" })).toBeInTheDocument();
    expect(within(strip).queryByRole("button", { name: "Open GitHub" })).not.toBeInTheDocument();

    act(() => useSharedSettings.getState().installPlugin(pluginFixture("github")));
    expect(within(strip).getByRole("button", { name: "Open GitHub" })).toBeInTheDocument();

    fireEvent.click(within(strip).getByRole("button", { name: "Open Chrome" }));
    expect(onOpen).toHaveBeenCalledWith("chrome-tools");
  });

  it("groups real categories and falls back to the source name for catalogs that publish none", async () => {
    const teamId = "8b71e462-020e-416a-b194-c9339156b8ef";
    const flatId = "8b71e462-020e-416a-b194-c9339156b8ee";
    mocks.pluginCatalog.mockResolvedValue({
      installations: [],
      catalogs: [
        {
          id: teamId,
          name: "Team",
          source: { type: "local", path: "/team" },
          revision: "revision",
          refreshedAt: 1,
          entries: [
            {
              name: "alpha",
              description: "Alpha workflow",
              category: "database",
              source: { type: "path" as const, path: "./alpha" },
              unavailable: [],
            },
            {
              name: "beta",
              description: "Beta workflow",
              category: "Finance",
              source: { type: "path" as const, path: "./beta" },
              unavailable: [],
            },
            {
              name: "gamma",
              description: "Gamma workflow",
              source: { type: "path" as const, path: "./gamma" },
              unavailable: [],
            },
          ],
        },
        {
          id: flatId,
          name: "Flat source",
          source: { type: "local", path: "/flat" },
          revision: "revision",
          refreshedAt: 1,
          entries: [
            {
              name: "delta",
              description: "Delta workflow",
              source: { type: "path" as const, path: "./delta" },
              unavailable: [],
            },
          ],
        },
      ],
    });
    render(<Marketplace onOpen={vi.fn<(pluginId: string) => void>()} />);

    // Bundled manifests carry their own categories.
    expect(screen.getByRole("heading", { name: "Communication" })).toBeInTheDocument();
    // Catalog vocabularies normalize into the shared sections.
    expect(await screen.findByRole("heading", { name: "Data and databases" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Finance" })).toBeInTheDocument();
    // A partially categorized source puts only its unlabelled entry in Other;
    // a source with no categories at all uses its name instead.
    expect(screen.getByRole("heading", { name: "Other" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Flat source" })).toBeInTheDocument();
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("delta")).toBeInTheDocument();
  });

  it("reports when nothing matches the search", () => {
    render(<Marketplace onOpen={vi.fn<(pluginId: string) => void>()} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Search plugins" }), {
      target: { value: "nothing matches this" },
    });

    expect(screen.getByText("No plugins match your search.")).toBeInTheDocument();
  });

  it("offers Computer Use on Linux", () => {
    const onOpen = vi.fn<(pluginId: string) => void>();

    function LinuxMarketplace() {
      const plugins = useLocalizedPluginCatalog();
      const catalog = usePluginCatalog();
      return (
        <PluginMarketplace
          plugins={plugins}
          hostPlatform="linux"
          catalog={catalog}
          onOpen={onOpen}
          onOpenCatalog={() => undefined}
        />
      );
    }

    render(<LinuxMarketplace />);

    const computerUseCard = screen
      .getByText("Computer Use")
      .closest<HTMLElement>("[data-plugin-row]")!;
    expect(
      within(computerUseCard).getByRole("button", { name: "Computer Use Manage" }),
    ).toBeEnabled();
    fireEvent.click(within(computerUseCard).getByRole("button", { name: "Computer Use" }));
    expect(onOpen).toHaveBeenCalledWith("computer-use");
  });

  it("combines sources without merging names or inspecting entries while browsing", async () => {
    const catalogs = ["Team", "Public"].map((name, index) => ({
      id: index ? "8b71e462-020e-416a-b194-c9339156b8ee" : "8b71e462-020e-416a-b194-c9339156b8ef",
      name,
      source: { type: "local" as const, path: `/${name}` },
      revision: "revision",
      refreshedAt: 1,
      entries: [
        {
          name: "notes",
          description: "Shared workflow",
          source: { type: "path" as const, path: "./notes" },
          unavailable: [],
        },
      ],
    }));
    mocks.pluginCatalog.mockResolvedValue({ catalogs, installations: [] });
    const onOpenCatalog = vi.fn<(target: PluginCatalogTarget) => void>();
    function Combined() {
      const plugins = useLocalizedPluginCatalog();
      const catalog = usePluginCatalog();
      return (
        <PluginMarketplace
          plugins={plugins}
          catalog={catalog}
          hostPlatform="win32"
          onOpen={() => undefined}
          onOpenCatalog={onOpenCatalog}
        />
      );
    }
    render(<Combined />);
    fireEvent.change(screen.getByRole("textbox", { name: "Search plugins" }), {
      target: { value: "notes" },
    });
    const team = await screen.findByRole("button", { name: "Review notes from Team" });
    expect(screen.getByRole("button", { name: "Review notes from Public" })).toBeInTheDocument();
    expect(screen.queryByText("No plugins match your search.")).not.toBeInTheDocument();
    fireEvent.click(team);
    expect(onOpenCatalog).toHaveBeenCalledWith({ catalogId: catalogs[0]!.id, entryName: "notes" });
    expect(mocks.pluginCatalog.mock.calls).toEqual([[{ action: "list" }]]);
  });
});
