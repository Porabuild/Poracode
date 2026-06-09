import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listWslDistros: vi.fn<() => Promise<string[]>>().mockResolvedValue([]),
  loadHomeScopeLocation: vi.fn<() => Promise<{ kind: string; path: string }>>(),
  commitCreateProject: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  pickFolder: vi.fn<(d?: string) => Promise<string | null>>().mockResolvedValue(null),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    platform: "darwin",
    listWslDistros: mocks.listWslDistros,
    pickFolder: mocks.pickFolder,
  }),
  isWindows: () => false,
}));
vi.mock("@/renderer/actions/projectActions", () => ({
  loadHomeScopeLocation: mocks.loadHomeScopeLocation,
}));
vi.mock("@/renderer/actions/createProjectActions", () => ({
  commitCreateProject: mocks.commitCreateProject,
}));

import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { CreateProjectModal } from "./CreateProjectModal";

describe("CreateProjectModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listWslDistros.mockResolvedValue([]);
    mocks.loadHomeScopeLocation.mockResolvedValue({ kind: "posix", path: "/Users/me" });
    mocks.pickFolder.mockResolvedValue(null);
    useSharedSettings.setState({ lastUsedProjectDirs: {} });
    usePanelStore.setState({ createProjectModalOpen: false });
  });

  afterEach(() => {
    usePanelStore.setState({ createProjectModalOpen: false });
  });

  test("hides the runtime selector when no WSL distros exist", async () => {
    usePanelStore.getState().openCreateProjectModal();
    render(<CreateProjectModal />);

    await waitFor(() => expect(screen.getByLabelText("Project name")).toBeInTheDocument());
    expect(screen.queryByLabelText("Runtime")).not.toBeInTheDocument();
  });

  test("disables the create button until a valid name is entered (scratch)", async () => {
    usePanelStore.getState().openCreateProjectModal();
    render(<CreateProjectModal />);

    // Parent prefilled from home once resolved.
    await waitFor(() => expect(mocks.loadHomeScopeLocation).toHaveBeenCalled());

    const createButton = screen.getByRole("button", { name: "Create project" });
    expect(createButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "my-app" } });

    await waitFor(() => expect(createButton).toBeEnabled());
  });

  test("shows the full target path in the picker, with no separate preview line", async () => {
    usePanelStore.getState().openCreateProjectModal();
    render(<CreateProjectModal />);
    await waitFor(() => expect(mocks.loadHomeScopeLocation).toHaveBeenCalled());

    const picker = screen.getByLabelText("Browse for parent folder");
    // Parent alone until a valid name is entered.
    await waitFor(() => expect(picker).toHaveTextContent("/Users/me"));
    expect(picker).not.toHaveTextContent("/Users/me/my-app");

    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "my-app" } });

    await waitFor(() => expect(picker).toHaveTextContent("/Users/me/my-app"));
    expect(screen.queryByText(/Will create/i)).not.toBeInTheDocument();
  });

  test("rejects an invalid name", async () => {
    usePanelStore.getState().openCreateProjectModal();
    render(<CreateProjectModal />);

    await waitFor(() => expect(mocks.loadHomeScopeLocation).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "a/b" } });

    expect(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
  });

  test("keeps a browsed folder when shared-settings object identity changes (hydration)", async () => {
    mocks.pickFolder.mockResolvedValue("/Users/me/projects/picked");
    usePanelStore.getState().openCreateProjectModal();
    render(<CreateProjectModal />);
    await waitFor(() => expect(mocks.loadHomeScopeLocation).toHaveBeenCalled());

    fireEvent.click(screen.getByLabelText("Browse for parent folder"));
    await waitFor(() =>
      expect(screen.getByLabelText("Browse for parent folder")).toHaveTextContent(
        "/Users/me/projects/picked",
      ),
    );

    // Hydration replaces the lastUsedProjectDirs object with an equal-but-new
    // reference; the user's picked folder must not be wiped.
    act(() => {
      useSharedSettings.setState({ lastUsedProjectDirs: {} });
    });

    expect(screen.getByLabelText("Browse for parent folder")).toHaveTextContent(
      "/Users/me/projects/picked",
    );
  });
});
