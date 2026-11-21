import "fake-indexeddb/auto";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAdaptiveLayoutForTest } from "@/renderer/adaptiveLayout";
import { installBrowserClientRuntime, resetClientRuntimeForTest } from "@/renderer/clientRuntime";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import type { Project } from "@/shared/contracts";
import type { PoracodeBridge } from "@/shared/ipc";
import type { MemoryEntry, RemoteMemoryCatalogCommand } from "@/shared/memory";
import { MemoryCatalogDialog } from "./MemoryCatalogDialog";

const catalogMock = vi.hoisted(() => ({
  runMemoryCatalogCommand:
    vi.fn<
      (connectionKey: string | undefined, command: RemoteMemoryCatalogCommand) => Promise<unknown>
    >(),
  syncMemoryAcrossEnvironments: vi.fn<() => Promise<{ changed: boolean }>>(),
}));

vi.mock("@/renderer/state/memoryCatalog", () => ({
  runMemoryCatalogCommand: catalogMock.runMemoryCatalogCommand,
}));

vi.mock("@/renderer/state/memorySync", () => ({
  syncMemoryAcrossEnvironments: catalogMock.syncMemoryAcrossEnvironments,
}));

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "memory-1",
    scope: "global",
    projectId: null,
    repoKey: null,
    category: "user",
    summary: "Always use bun for package scripts",
    body: "Always use bun for package scripts",
    confidence: 1,
    polarity: "positive",
    quote: null,
    lockedByUser: false,
    pinned: false,
    archived: false,
    usageCount: 0,
    lastUsedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    source: "user",
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-poracode",
    name: "Poracode",
    location: { kind: "posix", path: "/work/Poracode" },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function setCompactViewport(compact: boolean) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: compact ? 390 : 1280,
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: compact && query.includes("767px"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  resetAdaptiveLayoutForTest();
}

describe("MemoryCatalogDialog", () => {
  beforeEach(() => {
    setCompactViewport(false);
    resetClientRuntimeForTest();
    useAppStore.setState({ projects: [makeProject()] });
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    catalogMock.runMemoryCatalogCommand.mockReset();
    catalogMock.syncMemoryAcrossEnvironments.mockReset().mockResolvedValue({ changed: false });
  });

  afterEach(() => {
    cleanup();
    resetAdaptiveLayoutForTest();
    resetClientRuntimeForTest();
  });

  it("renders readable multi-line rows with project names and omits redundant scope/category labels", async () => {
    catalogMock.runMemoryCatalogCommand.mockResolvedValueOnce([
      makeEntry({
        id: "m-project",
        scope: "project",
        projectId: "proj-poracode",
        category: "project",
        summary: "Memory settings are available on Electron, desktop web, and compact mobile web.",
      }),
      makeEntry({
        id: "m-repo-fallback",
        scope: "project",
        projectId: "missing-project",
        repoKey: "github.com/acme/alpha-service",
        category: "feedback",
        summary: "Prefer explicit SQL migrations for schema changes.",
        pinned: true,
        lockedByUser: true,
      }),
      makeEntry({
        id: "m-global",
        scope: "global",
        projectId: null,
        category: "user",
        summary: "Works in CET timezone.",
      }),
    ]);

    renderWithI18n(
      <MemoryCatalogDialog
        connectionKey={undefined}
        onChanged={async () => {}}
        onClose={() => {}}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "Memories" });
    const rows = await within(dialog).findAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(dialog).getByTestId("memory-count")).toHaveTextContent("3");
    expect(rows[0]!).toHaveClass("content-surface");

    // Full text without single-line truncation
    const projectSummary = within(rows[0]!).getByText(
      "Memory settings are available on Electron, desktop web, and compact mobile web.",
    );
    expect(projectSummary).not.toHaveClass("truncate");

    // Project name resolved, no redundant "project · project"
    expect(within(rows[0]!).getByText("Poracode")).toBeInTheDocument();
    expect(within(rows[0]!).queryByText(/^project$/i)).toBeNull();

    // RepoKey fallback + non-redundant Feedback + Pinned badge + Edited by you
    expect(within(rows[1]!).getByText("acme/alpha-service")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Feedback")).toBeInTheDocument();
    const pinnedBadge = within(rows[1]!).getByText("Pinned");
    expect(pinnedBadge).toBeInTheDocument();
    expect(pinnedBadge).toHaveClass("rounded-full", "text-accent");
    expect(within(rows[1]!).getByText("Edited by you")).toBeInTheDocument();

    // Global user memory renders "Global" without redundant "user · global"
    expect(within(rows[2]!).getByText("Global")).toBeInTheDocument();
    expect(within(rows[2]!).queryByText(/^user$/i)).toBeNull();

    // Hover-revealed icon buttons with accessible labels
    const editBtn = within(rows[0]!).getByRole("button", { name: "Edit" });
    expect(editBtn.closest("div")).toHaveClass("opacity-0", "group-hover:opacity-100");
    expect(within(rows[0]!).getByRole("button", { name: "Pin to top" })).toBeInTheDocument();
    expect(within(rows[0]!).getByRole("button", { name: "Delete" })).toBeInTheDocument();

    // Search also matches resolved project names, updates header count, and can be cleared via button
    const search = within(dialog).getByRole("searchbox", { name: "Search memories" });
    fireEvent.change(search, { target: { value: "Poracode" } });
    expect(within(dialog).getByTestId("memory-count")).toHaveTextContent("1 / 3");
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(1);
    expect(
      within(dialog).getByText(
        "Memory settings are available on Electron, desktop web, and compact mobile web.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Clear search" }));
    expect(within(dialog).getByTestId("memory-count")).toHaveTextContent("3");
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(3);
  });

  it("opens a dedicated textarea modal to add a memory, supports Pin to top toggle, and submits on Cmd/Ctrl+Enter", async () => {
    const onChanged = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    catalogMock.runMemoryCatalogCommand
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(
        makeEntry({ id: "m-new", summary: "Use strict TypeScript checks", pinned: true }),
      )
      .mockResolvedValueOnce([
        makeEntry({ id: "m-new", summary: "Use strict TypeScript checks", pinned: true }),
      ]);

    renderWithI18n(
      <MemoryCatalogDialog connectionKey={undefined} onChanged={onChanged} onClose={() => {}} />,
    );

    const dialog = await screen.findByRole("dialog", { name: "Memories" });
    expect(await within(dialog).findByText("No memories yet.")).toBeInTheDocument();

    // Empty state CTA opens the add modal directly
    fireEvent.click(within(dialog).getByRole("button", { name: "Add a memory" }));
    const addDialog = await screen.findByRole("dialog", { name: "Add a memory" });
    const textarea = within(addDialog).getByRole("textbox", { name: "Memory" });
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea).toHaveClass("resize-none");
    await waitFor(() => expect(textarea).toHaveFocus());

    // Toggle Pin to top inside the editor modal
    const pinSwitch = within(addDialog).getByRole("switch", { name: "Pin to top" });
    fireEvent.click(pinSwitch);
    expect(pinSwitch).toBeChecked();

    fireEvent.change(textarea, { target: { value: "Use strict TypeScript checks" } });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });

    await waitFor(() =>
      expect(catalogMock.runMemoryCatalogCommand).toHaveBeenCalledWith(undefined, {
        action: "save",
        entry: {
          scope: "global",
          category: "user",
          summary: "Use strict TypeScript checks",
          body: "Use strict TypeScript checks",
          polarity: "positive",
          pinned: true,
        },
      }),
    );

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add a memory" })).toBeNull());
    expect(await within(dialog).findByText("Use strict TypeScript checks")).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("opens edit modal on single click of a card and preserves distinct body text", async () => {
    const existing = makeEntry({
      id: "m-edit",
      scope: "project",
      projectId: "proj-poracode",
      category: "project",
      summary: "Old summary",
      body: "Original captured user quote",
    });
    catalogMock.runMemoryCatalogCommand
      .mockResolvedValueOnce([existing])
      .mockResolvedValueOnce({ ...existing, summary: "Updated summary" })
      .mockResolvedValueOnce([{ ...existing, summary: "Updated summary" }]);

    renderWithI18n(
      <MemoryCatalogDialog
        connectionKey={undefined}
        onChanged={async () => {}}
        onClose={() => {}}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "Memories" });
    fireEvent.click(await within(dialog).findByText("Old summary"));

    const editDialog = await screen.findByRole("dialog", { name: "Edit memory" });
    expect(within(editDialog).getByRole("button", { name: /Scope/i })).toBeDisabled();
    const textarea = within(editDialog).getByRole("textbox", { name: "Memory" });
    expect(textarea).toHaveValue("Old summary");
    await waitFor(() => expect(textarea).toHaveFocus());

    fireEvent.change(textarea, { target: { value: "Updated summary" } });
    fireEvent.click(within(editDialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(catalogMock.runMemoryCatalogCommand).toHaveBeenCalledWith(undefined, {
        action: "save",
        entry: {
          id: "m-edit",
          scope: "project",
          projectId: "proj-poracode",
          category: "project",
          summary: "Updated summary",
          body: "Original captured user quote",
          polarity: "positive",
          pinned: false,
          quote: null,
        },
      }),
    );

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit memory" })).toBeNull());
    expect(await within(dialog).findByText("Updated summary")).toBeInTheDocument();
  });

  it("requires confirmation popover before deleting a memory on desktop", async () => {
    const existing = makeEntry({
      id: "m-delete",
      summary: "Temporary memory to delete",
    });
    catalogMock.runMemoryCatalogCommand
      .mockResolvedValueOnce([existing])
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce([]);

    renderWithI18n(
      <MemoryCatalogDialog
        connectionKey={undefined}
        onChanged={async () => {}}
        onClose={() => {}}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "Memories" });
    const row = await within(dialog).findByRole("listitem");

    // First click opens confirmation popover without deleting or opening edit modal
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    const confirmPopover = await screen.findByRole("dialog", { name: "Delete memory?" });
    expect(screen.queryByRole("dialog", { name: "Edit memory" })).toBeNull();
    expect(catalogMock.runMemoryCatalogCommand).toHaveBeenCalledTimes(1);

    // Canceling closes the popover without deleting
    fireEvent.click(within(confirmPopover).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Delete memory?" })).toBeNull(),
    );
    expect(catalogMock.runMemoryCatalogCommand).toHaveBeenCalledTimes(1);

    // Confirming deletes the memory
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    const confirmAgain = await screen.findByRole("dialog", { name: "Delete memory?" });
    fireEvent.click(within(confirmAgain).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(catalogMock.runMemoryCatalogCommand).toHaveBeenCalledWith(undefined, {
        action: "delete",
        id: "m-delete",
      }),
    );
    expect(await within(dialog).findByText("No memories yet.")).toBeInTheDocument();
  });

  it("filters by scope dropdown and offers Clear filters in the no-results state", async () => {
    useAppStore.setState({
      projects: [
        makeProject({ id: "proj-poracode", name: "Poracode" }),
        makeProject({ id: "proj-empty", name: "EmptyApp" }),
      ],
    });
    catalogMock.runMemoryCatalogCommand.mockResolvedValueOnce([
      makeEntry({
        id: "m-global",
        scope: "global",
        projectId: null,
        summary: "Global preference",
      }),
      makeEntry({
        id: "m-poracode",
        scope: "project",
        projectId: "proj-poracode",
        category: "project",
        summary: "Poracode rule",
      }),
    ]);

    renderWithI18n(
      <MemoryCatalogDialog
        connectionKey={undefined}
        onChanged={async () => {}}
        onClose={() => {}}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "Memories" });
    expect(await within(dialog).findAllByRole("listitem")).toHaveLength(2);

    const scopeButton = within(dialog).getByRole("button", { name: /Filter by scope/i });
    fireEvent.click(scopeButton);
    const emptyOption = await screen.findByRole("option", { name: "EmptyApp" });
    fireEvent.pointerDown(emptyOption, { button: 0, pointerId: 1 });
    fireEvent.mouseDown(emptyOption, { button: 0 });
    fireEvent.pointerUp(emptyOption, { button: 0, pointerId: 1 });
    fireEvent.mouseUp(emptyOption, { button: 0 });
    fireEvent.click(emptyOption, { button: 0 });

    const status = await within(dialog).findByRole("status");
    expect(within(status).getByText("No results")).toBeInTheDocument();
    expect(within(dialog).getByTestId("memory-count")).toHaveTextContent("0 / 2");

    fireEvent.click(within(status).getByRole("button", { name: "Clear filters" }));
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(2);
    expect(within(dialog).getByTestId("memory-count")).toHaveTextContent("2");
  });

  it("resolves projected remote project names on a remote connection without leaking local projects", async () => {
    useAppStore.setState({
      projects: [
        makeProject({
          id: "local-only-proj",
          name: "Local Desktop Only",
        }),
        makeProject({
          id: "remote:owner-b:project:proj-remote-1",
          remoteServerId: "owner-b",
          remoteId: "proj-remote-1",
          name: "Backend API",
        }),
      ],
    });
    catalogMock.runMemoryCatalogCommand.mockResolvedValueOnce([
      makeEntry({
        id: "m-remote",
        scope: "project",
        projectId: "proj-remote-1",
        category: "project",
        summary: "Run cargo test with --locked",
      }),
    ]);

    renderWithI18n(
      <MemoryCatalogDialog connectionKey="owner-b" onChanged={async () => {}} onClose={() => {}} />,
    );

    const dialog = await screen.findByRole("dialog", { name: "Memories" });
    const row = await within(dialog).findByRole("listitem");
    expect(within(row).getByText("Backend API")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /Filter by scope/i }));
    expect(screen.getByRole("option", { name: "Backend API" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Local Desktop Only" })).toBeNull();
  });

  it("uses the modal textarea editor for add and edit and confirms delete in compact mobile layout", async () => {
    installBrowserClientRuntime({} as PoracodeBridge);
    setCompactViewport(true);
    catalogMock.runMemoryCatalogCommand
      .mockResolvedValueOnce([
        makeEntry({
          id: "m-mobile",
          scope: "project",
          projectId: "proj-poracode",
          category: "project",
          summary: "Compact mobile memory",
        }),
      ])
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce([]);

    renderWithI18n(
      <MemoryCatalogDialog
        connectionKey={undefined}
        onChanged={async () => {}}
        onClose={() => {}}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "Memories" });
    expect(await within(dialog).findByText("Compact mobile memory")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Add a memory" }));
    const addDialog = await screen.findByRole("dialog", { name: "Add a memory" });
    expect(within(addDialog).getByRole("textbox", { name: "Memory" }).tagName).toBe("TEXTAREA");
    fireEvent.click(within(addDialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add a memory" })).toBeNull());

    fireEvent.click(within(dialog).getByRole("button", { name: "Memory actions" }));
    const sheet = await screen.findByRole("dialog", { name: "Memory actions" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Edit" }));
    const editDialog = await screen.findByRole("dialog", { name: "Edit memory" });
    expect(within(editDialog).getByRole("textbox", { name: "Memory" })).toHaveValue(
      "Compact mobile memory",
    );
    fireEvent.click(within(editDialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit memory" })).toBeNull());

    // Mobile delete requires confirmation inside the action sheet
    fireEvent.click(within(dialog).getByRole("button", { name: "Memory actions" }));
    const deleteSheet = await screen.findByRole("dialog", { name: "Memory actions" });
    fireEvent.click(within(deleteSheet).getByRole("button", { name: "Delete" }));
    expect(within(deleteSheet).getByText("Delete memory?")).toBeInTheDocument();
    expect(catalogMock.runMemoryCatalogCommand).toHaveBeenCalledTimes(1);
    fireEvent.click(within(deleteSheet).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(catalogMock.runMemoryCatalogCommand).toHaveBeenCalledWith(undefined, {
        action: "delete",
        id: "m-mobile",
      }),
    );
  });
});
