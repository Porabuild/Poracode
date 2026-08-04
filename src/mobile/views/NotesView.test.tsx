// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { NotesView } from "./NotesView";

const originalVisualViewport = Object.getOwnPropertyDescriptor(window, "visualViewport");

const viewportLock = vi.hoisted(() => ({
  lock: vi.fn<() => () => void>(),
  release: vi.fn<() => void>(),
}));

vi.mock("@/renderer/components/common/mobileSheetViewportLock", () => ({
  lockMobileSheetViewport: viewportLock.lock,
}));

vi.mock("@/renderer/views/MainView/parts/RightPanel/parts/NotesPanel/NotesPanel", () => ({
  NotesPanel: (props: { projectId: string }) => (
    <div data-testid="notes-panel" data-project-id={props.projectId}>
      <input aria-label="Project notes" />
    </div>
  ),
}));

describe("NotesView", () => {
  beforeEach(() => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: {
        offsetTop: 48,
        pageTop: 64,
        height: 480,
        addEventListener: vi.fn<() => void>(),
        removeEventListener: vi.fn<() => void>(),
      },
    });
  });

  afterEach(() => {
    if (originalVisualViewport) {
      Object.defineProperty(window, "visualViewport", originalVisualViewport);
    } else {
      Reflect.deleteProperty(window, "visualViewport");
    }
  });

  it("locks the document viewport while a notes field has focus", async () => {
    viewportLock.release.mockReset();
    viewportLock.lock.mockReset().mockReturnValue(viewportLock.release);
    render(<NotesView projectId="project-1" projectName="Poracode" onClose={() => undefined} />);

    await waitFor(() => {
      expect(document.querySelector(".m-notes-screen")).toHaveStyle({
        "--m-visual-viewport-bottom": `${window.innerHeight - 64 - 480}px`,
        "--m-visual-viewport-top": "64px",
      });
    });

    const notes = screen.getByRole("textbox", { name: "Project notes" });
    fireEvent.pointerDown(notes);
    fireEvent.focus(notes);

    expect(viewportLock.lock).toHaveBeenCalledOnce();

    notes.blur();
    await waitFor(() => expect(viewportLock.release).toHaveBeenCalledOnce());
  });

  it("shows the project notes surface and returns to its thread", () => {
    const onClose = vi.fn<() => void>();

    render(<NotesView projectId="project-1" projectName="Poracode" onClose={onClose} />);

    expect(screen.getByText("Poracode")).toBeInTheDocument();
    expect(screen.getByText("Notes & to-dos")).toBeInTheDocument();
    expect(screen.getByTestId("notes-panel")).toHaveAttribute("data-project-id", "project-1");

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
