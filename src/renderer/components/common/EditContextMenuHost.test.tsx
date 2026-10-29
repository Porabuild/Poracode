import { createEvent, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ContextMenu } from "./ContextMenu";
import { EditContextMenuHost } from "./EditContextMenuHost";

afterEach(() => {
  document.documentElement.dataset.platform = "win32";
  window.getSelection()?.removeAllRanges();
});

describe("EditContextMenuHost", () => {
  it("opens the shared context menu on a text field", async () => {
    document.documentElement.dataset.platform = "win32";
    render(
      <>
        <input aria-label="Name" defaultValue="hello" />
        <EditContextMenuHost />
      </>,
    );

    const input = screen.getByRole("textbox", { name: "Name" });
    (input as HTMLInputElement).setSelectionRange(0, 5);
    const event = createEvent.contextMenu(input, { clientX: 40, clientY: 50 });
    fireEvent(input, event);

    expect(event.defaultPrevented).toBe(true);
    const copy = await screen.findByRole("menuitem", { name: "Copy" });
    expect(copy).toHaveTextContent("Ctrl+C");
    expect(screen.getByRole("menuitem", { name: "Cut" })).toHaveTextContent("Ctrl+X");
    expect(screen.getByRole("menuitem", { name: "Paste" })).toHaveTextContent("Ctrl+V");
    expect(screen.getByRole("menuitem", { name: "Select all" })).toHaveTextContent("Ctrl+A");

    Object.defineProperty(document, "execCommand", {
      configurable: true,
      writable: true,
      value: () => true,
    });
    const exec = vi.spyOn(document, "execCommand").mockReturnValue(true);
    fireEvent.click(copy);
    expect(exec).toHaveBeenCalledWith("copy");
  });

  it("does not replace a menu that already handled the click", async () => {
    render(
      <>
        <ContextMenu
          items={[{ id: "rename", label: "Rename" }]}
          onAction={vi.fn<(key: string) => void>()}
        >
          <button type="button">Thread</button>
        </ContextMenu>
        <EditContextMenuHost />
      </>,
    );

    fireEvent.contextMenu(screen.getByRole("button", { name: "Thread" }));

    expect(await screen.findByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Cut" })).not.toBeInTheDocument();
  });

  it("does not open from a touch-only pointer", async () => {
    const matchMedia = vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
      matches: query.includes("coarse"),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }));
    try {
      render(
        <>
          <p>Selectable note</p>
          <EditContextMenuHost />
        </>,
      );

      const event = createEvent.contextMenu(screen.getByText("Selectable note"));
      fireEvent(screen.getByText("Selectable note"), event);

      expect(event.defaultPrevented).toBe(false);
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    } finally {
      matchMedia.mockRestore();
    }
  });
});
