// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowseHostDirectoryResult, Project } from "@/shared/contracts";
import type { RemoteProjectCommand } from "@/shared/remote";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ManageProjectsView } from "./ManageProjectsView";

const bridge = vi.hoisted(() => ({
  browseHostDirectory: vi.fn<(payload: unknown) => Promise<BrowseHostDirectoryResult>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

const projects: Project[] = [
  {
    id: "p1",
    name: "Alpha",
    location: { kind: "posix", path: "/srv/alpha" },
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

function listing(path: string): BrowseHostDirectoryResult {
  return { path, parentPath: "/srv", homePath: "/home/me", entries: [], truncated: false };
}

function renderView(opts?: {
  canManage?: boolean;
  onCommand?: (command: RemoteProjectCommand) => Promise<void>;
}) {
  const onCommand =
    opts?.onCommand ?? vi.fn<(command: RemoteProjectCommand) => Promise<void>>(async () => {});
  render(
    <ManageProjectsView
      projects={projects}
      canManage={opts?.canManage ?? true}
      onCommand={onCommand}
    />,
  );
  return { onCommand };
}

describe("ManageProjectsView", () => {
  beforeEach(() => {
    bridge.browseHostDirectory.mockReset();
  });
  afterEach(() => {
    // Unmount before wiping the body: the sheets portal into <body>, and this
    // hook runs before RTL's auto-cleanup (afterEach is LIFO) — wiping first
    // would leave React unmounting portal nodes that no longer exist.
    cleanup();
    document.body.innerHTML = "";
  });

  it("lists projects with their paths", () => {
    renderView();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("/srv/alpha")).toBeTruthy();
  });

  it("picks a folder and sends an add-existing command", async () => {
    bridge.browseHostDirectory.mockResolvedValue(listing("/srv/beta"));
    const { onCommand } = renderView();
    // The add forms live in a drawer opened from the FAB.
    fireEvent.click(screen.getByRole("button", { name: "Add a project" }));
    // Open the folder picker (first of the two "Choose a folder" triggers).
    fireEvent.click(screen.getAllByRole("button", { name: /Choose a folder/ })[0]!);
    // The picker shows the browsed directory; pick it.
    await screen.findByText("/srv/beta");
    fireEvent.click(screen.getByRole("button", { name: /Use this folder/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(onCommand).toHaveBeenCalledWith({ kind: "add-existing", path: "/srv/beta" }),
    );
  });

  it("picks a parent folder and sends a clone command derived from the URL", async () => {
    bridge.browseHostDirectory.mockResolvedValue(listing("/srv"));
    const { onCommand } = renderView();
    fireEvent.click(screen.getByRole("button", { name: "Add a project" }));
    // The second "Choose a folder" trigger is the clone parent field.
    fireEvent.click(screen.getAllByRole("button", { name: /Choose a folder/ })[1]!);
    await screen.findByText("/srv");
    fireEvent.click(screen.getByRole("button", { name: /Use this folder/ }));
    fireEvent.change(screen.getByLabelText("Repository URL"), {
      target: { value: "https://github.com/owner/repo.git" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Clone" }));
    await waitFor(() =>
      expect(onCommand).toHaveBeenCalledWith({
        kind: "clone",
        parentPath: "/srv",
        name: "repo",
        source: { kind: "url", url: "https://github.com/owner/repo.git" },
      }),
    );
  });

  it("hides management affordances when not permitted", () => {
    const { onCommand } = renderView({ canManage: false });
    // Long-pressing the row must not open the remove confirm sheet.
    fireEvent.contextMenu(screen.getByText("Alpha"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
    // No FAB either — there's nothing to add without the manage scope.
    expect(screen.queryByRole("button", { name: "Add a project" })).toBeNull();
    expect(onCommand).not.toHaveBeenCalled();
  });

  it("reveals the add forms only after opening the drawer from the FAB", () => {
    renderView({ canManage: true });
    // Forms are behind the FAB, not rendered under the list.
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clone" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add a project" }));
    expect(screen.getByRole("dialog", { name: "Add a project" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clone" })).toBeTruthy();
  });

  it("removes a project only after confirming in the sheet", async () => {
    const { onCommand } = renderView({ canManage: true });
    // Long-pressing (context menu) the row opens a confirm sheet; it must NOT remove yet.
    fireEvent.contextMenu(screen.getByText("Alpha"));
    const dialog = await screen.findByRole("dialog");
    expect(onCommand).not.toHaveBeenCalled();
    // Confirming in the sheet dispatches the remove.
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove project" }));
    await waitFor(() =>
      expect(onCommand).toHaveBeenCalledWith({ kind: "remove", projectId: "p1" }),
    );
  });

  it("does not remove a project when the confirm sheet is cancelled", async () => {
    const { onCommand } = renderView({ canManage: true });
    fireEvent.contextMenu(screen.getByText("Alpha"));
    await screen.findByRole("dialog");
    // Dismiss via the scrim — the sheet has no explicit cancel button.
    fireEvent.click(screen.getByRole("button", { name: "Cancel removing project" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onCommand).not.toHaveBeenCalled();
  });
});
