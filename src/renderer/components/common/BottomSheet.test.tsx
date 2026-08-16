import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { BottomSheet } from "./BottomSheet";

function Harness(props: { readonly fullScreen?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open actions
      </button>
      {open ? (
        <BottomSheet
          label="Actions"
          {...(props.fullScreen ? { fullScreen: true } : {})}
          onClose={() => setOpen(false)}
        >
          <button type="button">First action</button>
          <button type="button">Last action</button>
        </BottomSheet>
      ) : null}
    </>
  );
}

function ControlledHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open controlled actions
      </button>
      <BottomSheet isOpen={open} label="Controlled actions" onClose={() => setOpen(false)}>
        <button type="button" onClick={() => setOpen(false)}>
          Close controlled actions
        </button>
      </BottomSheet>
    </>
  );
}

function FocusHandoffHarness() {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) inputRef.current?.focus();
  }, [renaming]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open thread actions
      </button>
      {renaming ? <input ref={inputRef} aria-label="Rename thread" /> : null}
      {open ? (
        <BottomSheet label="Thread actions" onClose={() => setOpen(false)}>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setRenaming(true);
            }}
          >
            Rename
          </button>
        </BottomSheet>
      ) : null}
    </>
  );
}

describe("BottomSheet", () => {
  it("moves focus into the modal and restores the opener after Escape", async () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open actions" });
    opener.focus();
    fireEvent.click(opener);

    const dialog = await screen.findByRole("dialog", { name: "Actions" });
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));

    fireEvent.keyDown(document.activeElement ?? document, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Actions" })).toBeInTheDocument();
    expect(document.querySelector(".m-sheet-backdrop")).toHaveAttribute("data-closing", "true");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Actions" })).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("keeps a controlled drawer mounted through feature-driven exit motion", async () => {
    render(<ControlledHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open controlled actions" }));
    await screen.findByRole("dialog", { name: "Controlled actions" });

    fireEvent.click(screen.getByRole("button", { name: "Close controlled actions" }));

    expect(screen.getByRole("dialog", { name: "Controlled actions" })).toBeInTheDocument();
    expect(document.querySelector(".m-sheet-backdrop")).toHaveAttribute("data-closing", "true");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Controlled actions" })).toBeNull(),
    );
  });

  it("preserves focus handed to a control mounted by a closing action", async () => {
    render(<FocusHandoffHarness />);
    const opener = screen.getByRole("button", { name: "Open thread actions" });
    fireEvent.click(opener);
    fireEvent.click(await screen.findByRole("button", { name: "Rename" }));

    const input = screen.getByRole("textbox", { name: "Rename thread" });
    await waitFor(() => expect(input).toHaveFocus());
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(input).toHaveFocus();
  });

  it("renders the modal as a full-screen drawer when requested", async () => {
    render(<Harness fullScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Open actions" }));

    await screen.findByRole("dialog", { name: "Actions" });
    expect(document.querySelector(".m-sheet")).toHaveAttribute("data-full-screen", "true");
  });
});
