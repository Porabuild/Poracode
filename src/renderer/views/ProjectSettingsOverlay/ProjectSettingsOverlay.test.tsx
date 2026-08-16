// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";

const layout = vi.hoisted(() => ({ compact: false }));

vi.mock("@/renderer/adaptiveLayout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/adaptiveLayout")>()),
  useCompactLayout: () => layout.compact,
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({}),
  isRemoteSession: () => false,
  isMac: () => false,
  isWindows: () => false,
}));

import { ProjectSettingsOverlay } from "./ProjectSettingsOverlay";

const project: Project = {
  id: "project-1",
  name: "Poracode",
  location: { kind: "windows", path: "E:\\work\\poracode" },
  createdAt: "2026-07-25T10:00:00.000Z",
};

describe("ProjectSettingsOverlay", () => {
  beforeEach(() => {
    layout.compact = false;
    useAppStore.setState({ projects: [project] });
  });

  it("navigates project settings sections as compact pages", () => {
    layout.compact = true;
    const onClose = vi.fn<() => void>();

    render(<ProjectSettingsOverlay projectId={project.id} onClose={onClose} />);

    const main = screen.getByRole("main");
    expect(within(main).getByRole("button", { name: "General" })).toBeInTheDocument();
    expect(within(main).getByRole("button", { name: "Worktrees" })).toBeInTheDocument();
    expect(within(main).queryByText("Display name in the sidebar.")).not.toBeInTheDocument();

    fireEvent.click(within(main).getByRole("button", { name: "General" }));
    expect(within(main).getByText("Display name in the sidebar.")).toBeInTheDocument();
    expect(within(main).queryByRole("button", { name: "Worktrees" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(within(main).getByRole("button", { name: "Worktrees" })).toBeInTheDocument();
    expect(within(main).queryByText("Display name in the sidebar.")).not.toBeInTheDocument();

    fireEvent.click(document.querySelector(".m-back")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
