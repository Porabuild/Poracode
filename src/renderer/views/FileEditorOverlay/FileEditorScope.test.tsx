import type { ReactNode } from "react";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { FileEditorOverlay } from "./FileEditorOverlay";
import { FileEditorModal } from "./parts/FileEditorModal";

vi.mock("./parts/ProjectTreeView/ProjectTreeView", () => ({
  ProjectTreeView: () => <div data-testid="project-tree" />,
}));

vi.mock("./parts/FileEditorPane/FileEditorPane", () => ({
  FileEditorPane: () => <div data-testid="file-editor" />,
}));

vi.mock("@/renderer/components/layout/PageLayout", () => ({
  PageLayout: ({ sidebar, content }: { sidebar: ReactNode; content: ReactNode }) => (
    <div>
      {sidebar}
      {content}
    </div>
  ),
}));

vi.mock("@/renderer/components/common", () => ({
  SidebarButton: ({ label, onPress }: { label: ReactNode; onPress: () => void }) => (
    <button type="button" onClick={onPress}>
      {label}
    </button>
  ),
}));

describe.each(["modal", "fullscreen"] as const)("%s editor file scope", (mode) => {
  beforeEach(() => useFileEditorStore.getState().clearSession());
  afterEach(cleanup);

  function openEditor(projectId: string, remoteServerId?: string) {
    useFileEditorStore.getState().setRootContext({
      projectId,
      projectName: "Workspace",
      rootLabel: "Workspace",
      projectLocation: { kind: "windows", path: "C:\\Users\\example" },
      ...(remoteServerId ? { remoteServerId } : {}),
    });
    useFileEditorStore.getState().setOverlayMode(mode);
    render(mode === "modal" ? <FileEditorModal /> : <FileEditorOverlay onClose={() => {}} />);
  }

  it("opens Home files without mounting the project tree", () => {
    openEditor(HOME_PROJECT_ID);

    expect(screen.getByTestId("file-editor")).toBeInTheDocument();
    expect(screen.queryByTestId("project-tree")).not.toBeInTheDocument();
  });

  it("retains tree browsing for a local project", () => {
    openEditor("local-project");

    expect(screen.getByTestId("file-editor")).toBeInTheDocument();
    expect(screen.getByTestId("project-tree")).toBeInTheDocument();
  });

  it("retains the remote project's file-only editor", () => {
    openEditor("remote-project", "host");

    expect(screen.getByTestId("file-editor")).toBeInTheDocument();
    expect(screen.queryByTestId("project-tree")).not.toBeInTheDocument();
  });
});
