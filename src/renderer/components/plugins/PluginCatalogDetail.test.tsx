import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { pluginFixture, seedBuiltInPlugins } from "@/renderer/testUtils/plugins";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { usePlugins } from "@/renderer/state/pluginsStore";
import type {
  PluginCatalogPayload,
  PluginCatalogResult,
  PluginInstallation,
} from "@/shared/contracts/pluginCatalog";
import { PluginCatalogDetail } from "./PluginCatalogDetail";
import { usePluginCatalog, type PluginCatalogTarget } from "./usePluginCatalog";
import type { LocalizedPlugin } from "./pluginCopy";

const mocks = vi.hoisted(() => ({
  pluginCatalog: vi.fn<(payload: PluginCatalogPayload) => Promise<PluginCatalogResult>>(),
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    pluginCatalog: (payload: PluginCatalogPayload) =>
      payload.action === "artwork"
        ? Promise.resolve({ catalogs: [], installations: [] })
        : mocks.pluginCatalog(payload),
  }),
}));
const catalogId = "8b71e462-020e-416a-b194-c9339156b8ef";
const otherId = "8b71e462-020e-416a-b194-c9339156b8ee";
const target = { catalogId, entryName: "notes" };
const base: PluginCatalogResult = {
  catalogs: [
    {
      id: catalogId,
      name: "Team catalog",
      source: { type: "local", path: "/team" },
      revision: "catalog-revision",
      refreshedAt: 1,
      entries: [
        {
          name: "notes",
          description: "Notes workflow",
          category: "database",
          source: {
            type: "git",
            url: "https://packages.example.org/notes.git",
            ref: "v2",
            sha: "a".repeat(40),
            path: "plugins/notes",
          },
          unavailable: [],
        },
      ],
    },
  ],
  installations: [],
};
const receipt: PluginInstallation = {
  formatVersion: 1,
  pluginName: "notes",
  catalogId,
  catalogName: "Team catalog",
  catalogSource: { type: "local", path: "/team" },
  packageSource: { type: "path", path: "./notes" },
  entryName: "notes",
  revision: "installed-revision",
  digest: "installed-digest",
  installedAt: 1,
};

function inspected(): PluginCatalogResult {
  const template = pluginFixture("github");
  return {
    ...base,
    inspection: {
      plugin: {
        ...template,
        name: "notes",
        source: "user",
        root: "/plugins/notes",
        manifest: { ...template.manifest, name: "notes" },
        poracode: { ...template.poracode, defaultEnabled: false },
      },
      digest: "reviewed-content",
      revision: "reviewed-revision",
    },
  };
}

function Detail(props: {
  target?: PluginCatalogTarget;
  plugins?: LocalizedPlugin[];
  onBack?: () => void;
}) {
  const controller = usePluginCatalog();
  return (
    <PluginCatalogDetail
      target={props.target ?? target}
      controller={controller}
      plugins={props.plugins ?? []}
      hostPlatform="win32"
      onBack={props.onBack ?? (() => undefined)}
      onOpen={() => undefined}
    />
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.pluginCatalog.mockReset();
  seedBuiltInPlugins();
  useSharedSettings.setState({ installedPlugins: {} });
  vi.spyOn(usePlugins.getState(), "load").mockResolvedValue();
});

describe("individual catalog packages", () => {
  it("discloses the repository, reference, commit and path before explicitly requesting inspection", async () => {
    mocks.pluginCatalog.mockResolvedValue(base);
    render(<Detail />);
    const review = await screen.findByRole("button", { name: "Review notes" });
    await waitFor(() => expect(review).toBeEnabled());
    expect(screen.getByText("https://packages.example.org/notes.git")).toBeInTheDocument();
    expect(screen.getByText(`v2 (${"a".repeat(40)})`)).toBeInTheDocument();
    expect(screen.getByText("plugins/notes")).toBeInTheDocument();
    // Catalog vocabularies are normalized for display; unknown values stay authored.
    expect(screen.getByText("Category")).toBeInTheDocument();
    expect(screen.getByText("Data and databases")).toBeInTheDocument();
    expect(mocks.pluginCatalog.mock.calls).toEqual([[{ action: "list" }]]);
    expect(screen.queryByRole("button", { name: "Install plugin" })).not.toBeInTheDocument();
    fireEvent.click(review);
    expect(mocks.pluginCatalog).toHaveBeenLastCalledWith({ action: "inspect", ...target });
  });

  it("installs exactly the reviewed digest, blocks cancellation and duplicate submission, and leaves it disabled", async () => {
    const reviewed = inspected();
    let finish!: (value: PluginCatalogResult) => void;
    mocks.pluginCatalog
      .mockResolvedValueOnce(base)
      .mockResolvedValueOnce(reviewed)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
    render(<Detail />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Review notes" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Review notes" }));
    const panel = await screen.findByRole("region", { name: "Plugin review" });
    fireEvent.click(within(panel).getByRole("button", { name: "Install plugin" }));
    expect(within(panel).getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back to plugins" })).toBeDisabled();
    fireEvent.click(within(panel).getByRole("button", { name: "Install plugin" }));
    expect(mocks.pluginCatalog.mock.calls.at(-1)).toEqual([
      { action: "install", ...target, reviewDigest: "reviewed-content" },
    ]);
    expect(mocks.pluginCatalog).toHaveBeenCalledTimes(3);
    await act(async () => finish({ ...reviewed, installations: [receipt] }));
    expect(useSharedSettings.getState().installedPlugins.notes?.enabled).toBe(false);
    expect(screen.queryByRole("region", { name: "Plugin review" })).not.toBeInTheDocument();
  });

  it("does not carry a review to a same-named entry from another source", async () => {
    const value = {
      ...base,
      catalogs: [...base.catalogs, { ...base.catalogs[0]!, id: otherId, name: "Other catalog" }],
    };
    mocks.pluginCatalog
      .mockResolvedValueOnce(value)
      .mockResolvedValueOnce({ ...inspected(), catalogs: value.catalogs });
    const { rerender } = render(<Detail />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Review notes" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Review notes" }));
    await screen.findByRole("region", { name: "Plugin review" });
    rerender(<Detail target={{ catalogId: otherId, entryName: "notes" }} />);
    expect(screen.queryByRole("button", { name: "Install plugin" })).not.toBeInTheDocument();
    expect(screen.getByText("Other catalog")).toBeInTheDocument();
    expect(mocks.pluginCatalog).toHaveBeenCalledTimes(2);
  });

  it("updates only an exact receipt and refuses a same-name receipt owned by another source", async () => {
    mocks.pluginCatalog
      .mockResolvedValueOnce({ ...base, installations: [{ ...receipt, catalogId: otherId }] })
      .mockResolvedValueOnce({
        ...inspected(),
        installations: [{ ...receipt, catalogId: otherId }],
      });
    render(<Detail />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Review notes" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Review notes" }));
    expect(
      await screen.findByText(
        "A different plugin already uses this identifier. It will not be replaced.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Install plugin" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Update plugin" })).not.toBeInTheDocument();
  });

  it("updates an exact receipt with the newly reviewed digest without resetting enablement", async () => {
    const reviewed = inspected();
    const original = {
      version: "1.0.0",
      enabled: true,
      disabledSkillIds: ["github"],
      disabledMcpServerNames: [],
    };
    useSharedSettings.setState({ installedPlugins: { notes: original } });
    mocks.pluginCatalog
      .mockResolvedValueOnce({ ...base, installations: [receipt] })
      .mockResolvedValueOnce({ ...reviewed, installations: [receipt] })
      .mockResolvedValueOnce({
        ...reviewed,
        installations: [{ ...receipt, digest: "reviewed-content" }],
      });
    render(<Detail />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Review notes" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Review notes" }));
    fireEvent.click(await screen.findByRole("button", { name: "Update plugin" }));
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Plugin review" })).not.toBeInTheDocument(),
    );
    expect(mocks.pluginCatalog).toHaveBeenLastCalledWith({
      action: "update",
      ...target,
      reviewDigest: "reviewed-content",
    });
    expect(useSharedSettings.getState().installedPlugins.notes).toEqual(original);
  });

  it("keeps receipt-owned removal available after source removal, including an unloadable package", async () => {
    mocks.pluginCatalog
      .mockResolvedValueOnce({ catalogs: [], installations: [receipt] })
      .mockResolvedValueOnce({ catalogs: [], installations: [] });
    const onBack = vi.fn<() => void>();
    render(<Detail onBack={onBack} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove plugin" }));
    const confirm = screen.getByRole("alertdialog");
    fireEvent.click(within(confirm).getByRole("button", { name: "Remove plugin" }));
    await waitFor(() => expect(onBack).toHaveBeenCalledOnce());
    expect(mocks.pluginCatalog).toHaveBeenLastCalledWith({
      action: "remove-package",
      pluginName: "notes",
    });
  });

  it("reports a rejected install without registering settings or losing the reviewed digest", async () => {
    mocks.pluginCatalog
      .mockResolvedValueOnce(base)
      .mockResolvedValueOnce(inspected())
      .mockRejectedValueOnce(new Error("Package changed after review"));
    render(<Detail />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Review notes" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Review notes" }));
    fireEvent.click(await screen.findByRole("button", { name: "Install plugin" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not manage this plugin or marketplace.",
    );
    expect(useSharedSettings.getState().installedPlugins.notes).toBeUndefined();
    expect(screen.getByText("reviewed-revision · reviewed-content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("region", { name: "Plugin review" })).not.toBeInTheDocument();
    expect(mocks.pluginCatalog).toHaveBeenCalledTimes(3);
  });
});
