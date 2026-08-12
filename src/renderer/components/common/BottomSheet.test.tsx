import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
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

describe("BottomSheet", () => {
  it("moves focus into the modal and restores the opener after Escape", async () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open actions" });
    opener.focus();
    fireEvent.click(opener);

    const dialog = await screen.findByRole("dialog", { name: "Actions" });
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));

    fireEvent.keyDown(document.activeElement ?? document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Actions" })).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("renders the modal as a full-screen drawer when requested", async () => {
    render(<Harness fullScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Open actions" }));

    await screen.findByRole("dialog", { name: "Actions" });
    expect(document.querySelector(".m-sheet")).toHaveAttribute("data-full-screen", "true");
  });
});
