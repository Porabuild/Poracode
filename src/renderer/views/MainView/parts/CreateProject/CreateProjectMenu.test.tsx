import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Button } from "@heroui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePanelStore } from "@/renderer/state/panelStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const mocks = vi.hoisted(() => ({
  addExistingProject: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

vi.mock("@/renderer/actions/createProjectActions", () => ({
  addExistingProject: mocks.addExistingProject,
}));

import { CreateProjectMenu } from "./CreateProjectMenu";

describe("CreateProjectMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePanelStore.setState({ createProjectModalOpen: false, cloneProjectModalOpen: false });
  });
  afterEach(() =>
    usePanelStore.setState({ createProjectModalOpen: false, cloneProjectModalOpen: false }),
  );

  it("opens the scratch modal when 'Start from scratch' is chosen", async () => {
    render(
      <CreateProjectMenu>
        <Button aria-label="Add project">+</Button>
      </CreateProjectMenu>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add project" }));
    fireEvent.click(await screen.findByText("Start from scratch"));

    await waitFor(() => expect(usePanelStore.getState().createProjectModalOpen).toBe(true));
    expect(mocks.addExistingProject).not.toHaveBeenCalled();
  });

  it("opens the clone modal when 'Clone a repository' is chosen", async () => {
    render(
      <CreateProjectMenu>
        <Button aria-label="Add project">+</Button>
      </CreateProjectMenu>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add project" }));
    fireEvent.click(await screen.findByText("Clone a repository"));

    await waitFor(() => expect(usePanelStore.getState().cloneProjectModalOpen).toBe(true));
    expect(usePanelStore.getState().createProjectModalOpen).toBe(false);
    expect(mocks.addExistingProject).not.toHaveBeenCalled();
  });

  it("goes straight to the folder picker for 'Use an existing folder' (no modal)", async () => {
    render(
      <CreateProjectMenu>
        <Button aria-label="Add project">+</Button>
      </CreateProjectMenu>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add project" }));
    fireEvent.click(await screen.findByText("Use an existing folder"));

    await waitFor(() => expect(mocks.addExistingProject).toHaveBeenCalledTimes(1));
    expect(usePanelStore.getState().createProjectModalOpen).toBe(false);
  });
});
