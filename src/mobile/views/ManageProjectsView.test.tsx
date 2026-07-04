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
    expect(screen.queryByRole("button", { name: "Remove project" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
    expect(onCommand).not.toHaveBeenCalled();
  });

  it("removes a project only after confirming in the sheet", async () => {
    const { onCommand } = renderView({ canManage: true });
    // Tapping the trash icon opens a confirm sheet; it must NOT remove yet.
    fireEvent.click(screen.getByRole("button", { name: "Remove project" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Remove project" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onCommand).not.toHaveBeenCalled();
  });
});
