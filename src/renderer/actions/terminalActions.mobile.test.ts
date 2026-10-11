import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";

vi.mock("@/renderer/adaptiveLayout", () => ({
  isCompactLayoutViewport: () => true,
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    closeThread: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    startShell: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    writeTerminal: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  }),
}));

import { openTerminal } from "./terminalActions";
import { useAppStore } from "@/renderer/state/appStore";
import { resetDevTerminalStore, useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";

const project: Project = {
  id: "project-1",
  name: "Poracode",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-08-15T00:00:00.000Z",
};

describe("compact terminal actions", () => {
  beforeEach(() => {
    resetDevTerminalStore();
    useAppStore.setState({ projects: [project] });
    usePanelStore.setState({ mobileUtilityPage: null });
  });

  it("opens a project terminal on the dedicated compact page", () => {
    openTerminal(project.id);

    expect(usePanelStore.getState().mobileUtilityPage).toBe("terminal");
    expect(useDevTerminalStore.getState()).toMatchObject({
      isOpen: true,
      activeProjectId: project.id,
    });
    expect(useDevTerminalStore.getState().tabs).toHaveLength(1);
  });

  it("closes the compact page when the visible terminal action is toggled", () => {
    openTerminal(project.id);
    openTerminal(project.id);

    expect(usePanelStore.getState().mobileUtilityPage).toBeNull();
    expect(useDevTerminalStore.getState().isOpen).toBe(false);
  });
});
