import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { PluginCatalogPayload, PluginCatalogResult } from "@/shared/contracts/pluginCatalog";
import { PluginCatalogBrowser } from "./PluginCatalogBrowser";
import { usePluginCatalog } from "./usePluginCatalog";

const mocks = vi.hoisted(() => ({
  pluginCatalog: vi.fn<(payload: PluginCatalogPayload) => Promise<PluginCatalogResult>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => mocks }));
const catalog = {
  id: "8b71e462-020e-416a-b194-c9339156b8ef",
  name: "Team catalog",
  source: { type: "local" as const, path: "/team" },
  revision: "catalog-revision",
  refreshedAt: 1,
  entries: [],
};

function Sources() {
  const controller = usePluginCatalog();
  return (
    <>
      <output aria-label="Receipt count">{controller.result.installations.length}</output>
      <PluginCatalogBrowser controller={controller} isOpen onClose={() => undefined} />
    </>
  );
}

beforeEach(() => {
  mocks.pluginCatalog.mockReset();
});

describe("marketplace sources", () => {
  it("loads every registered default serially and retries failed sources without installing a plugin", async () => {
    const pending = [
      {
        ...catalog,
        id: "fe56d160-3533-4e2d-84c0-d8b08c11ef52",
        name: "First default",
        refreshedAt: 0,
      },
      {
        ...catalog,
        id: "737237f4-fd1a-4c92-8bcc-0320437c0c19",
        name: "Second default",
        refreshedAt: 0,
      },
    ];
    let current = pending;
    let firstAttempt = true;
    mocks.pluginCatalog.mockImplementation(async (payload) => {
      if (payload.action === "refresh") {
        if (payload.catalogId === pending[0]!.id && firstAttempt) {
          firstAttempt = false;
          throw new Error("Offline first source");
        }
        current = current.map((item) =>
          item.id === payload.catalogId ? { ...item, refreshedAt: 123 } : item,
        );
      }
      return { catalogs: current, installations: [] };
    });
    render(<Sources />);
    await screen.findByRole("alert");
    expect(mocks.pluginCatalog.mock.calls.map(([payload]) => payload)).toEqual([
      { action: "list" },
      ...pending.map((item) => ({ action: "refresh", catalogId: item.id })),
    ]);
    expect(screen.getByText("Not loaded")).toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole("region", { name: "First default" })).getByRole("button", {
        name: "Refresh First default",
      }),
    );
    await waitFor(() => expect(screen.queryByText("Not loaded")).not.toBeInTheDocument());
    expect(
      mocks.pluginCatalog.mock.calls.every(
        ([payload]) => payload.action === "list" || payload.action === "refresh",
      ),
    ).toBe(true);
  });

  it("lists registered sources without adding, refreshing or inspecting packages", async () => {
    mocks.pluginCatalog.mockResolvedValue({ catalogs: [catalog], installations: [] });
    render(<Sources />);
    expect(await screen.findByRole("heading", { name: "Team catalog" })).toBeInTheDocument();
    expect(screen.getByText("/team")).toBeInTheDocument();
    expect(mocks.pluginCatalog.mock.calls).toEqual([[{ action: "list" }]]);
  });

  it("removes only the source and retains its installation receipt in shared state", async () => {
    const receipt = {
      formatVersion: 1 as const,
      pluginName: "notes",
      entryName: "notes",
      catalogId: catalog.id,
      catalogName: catalog.name,
      catalogSource: catalog.source,
      packageSource: { type: "path" as const, path: "./notes" },
      revision: "revision",
      digest: "digest",
      installedAt: 1,
    };
    mocks.pluginCatalog
      .mockResolvedValueOnce({ catalogs: [catalog], installations: [receipt] })
      .mockResolvedValueOnce({ catalogs: [], installations: [receipt] });
    render(<Sources />);
    const source = await screen.findByRole("region", { name: "Team catalog" });
    fireEvent.click(within(source).getByRole("button", { name: "Remove marketplace" }));
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Team catalog" })).not.toBeInTheDocument(),
    );
    expect(mocks.pluginCatalog).toHaveBeenLastCalledWith({
      action: "remove-source",
      catalogId: catalog.id,
    });
    expect(screen.getByLabelText("Receipt count")).toHaveTextContent("1");
    expect(screen.getByText("Removing a source keeps its installed plugins.")).toBeInTheDocument();
  });

  it("adds a source only on explicit submission and prevents overlapping refreshes", async () => {
    mocks.pluginCatalog.mockResolvedValueOnce({ catalogs: [], installations: [] });
    let finish!: (result: PluginCatalogResult) => void;
    mocks.pluginCatalog.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<Sources />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add marketplace" })).toBeDisabled(),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Marketplace URL or local path" }), {
      target: { value: "/team" },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add marketplace" })).toBeEnabled(),
    );
    expect(mocks.pluginCatalog).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Add marketplace" }));
    expect(screen.getByRole("button", { name: "Add marketplace" })).toBeDisabled();
    expect(mocks.pluginCatalog).toHaveBeenLastCalledWith({
      action: "add",
      source: { type: "local", path: "/team" },
    });
    await act(async () => finish({ catalogs: [catalog], installations: [] }));
    await screen.findByRole("heading", { name: "Team catalog" });
  });
});
