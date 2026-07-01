// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import type { RemoteProjectCommand } from "@/shared/remote";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ManageProjectsView } from "./ManageProjectsView";

const projects: Project[] = [
  {
    id: "p1",
    name: "Alpha",
    location: { kind: "posix", path: "/srv/alpha" },
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

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
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("lists projects with their paths", () => {
    renderView();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("/srv/alpha")).toBeTruthy();
  });

  it("sends an add-existing command from the folder form", async () => {
    const { onCommand } = renderView();
    fireEvent.change(screen.getByLabelText("Folder path"), { target: { value: "/srv/beta" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(onCommand).toHaveBeenCalledWith({ kind: "add-existing", path: "/srv/beta" }),
    );
  });

  it("derives the clone name from the URL and sends a clone command", async () => {
    const { onCommand } = renderView();
    fireEvent.change(screen.getByLabelText("Parent folder"), { target: { value: "/srv" } });
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

  it("removes a project when permitted", async () => {
    const { onCommand } = renderView({ canManage: true });
    fireEvent.click(screen.getByRole("button", { name: "Remove project" }));
    await waitFor(() =>
      expect(onCommand).toHaveBeenCalledWith({ kind: "remove", projectId: "p1" }),
    );
  });
});
