import { AlertDialog, Modal } from "@heroui/react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import "@/renderer/tailwind.css";

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-compact-layout");
});

async function useViewport(width: number, height: number) {
  const { page } = (await import("vitest/browser")) as unknown as {
    page: { viewport: (width: number, height: number) => Promise<void> };
  };
  await page.viewport(width, height);
}

function bounds(element: Element) {
  const { top, left, width, height } = element.getBoundingClientRect();
  return { top, left, width, height };
}

function CrewLikeModal() {
  // The shared form-dialog shape: a centered card with a per-dialog desktop width cap.
  return (
    <Modal.Backdrop isOpen>
      <Modal.Container placement="center" scroll="inside" size="md">
        <Modal.Dialog className="sm:max-w-[460px]" aria-label="Edit crew">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>Edit crew</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="p-4">Body</Modal.Body>
          <Modal.Footer>Footer</Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function CrewLikeConfirm() {
  return (
    <AlertDialog.Backdrop isOpen>
      <AlertDialog.Container>
        <AlertDialog.Dialog aria-label="Remove crew">
          <AlertDialog.Header>
            <AlertDialog.Heading>Remove crew</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>Body</AlertDialog.Body>
          <AlertDialog.Footer>Footer</AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}

it.each([390, 700])(
  "fills a %i px compact viewport with a Modal dialog that is a centered card on desktop",
  async (width) => {
    await useViewport(width, 800);
    document.documentElement.setAttribute("data-compact-layout", "");
    render(<CrewLikeModal />);
    const dialog = screen.getByRole("dialog", { name: "Edit crew" });

    await waitFor(() => expect(bounds(dialog)).toEqual({ top: 0, left: 0, width, height: 800 }));
    expect(getComputedStyle(dialog).borderRadius).toBe("0px");
    expect(getComputedStyle(dialog).maxWidth).toBe("none");
  },
);

it("fills a compact viewport with an AlertDialog that is a centered card on desktop", async () => {
  await useViewport(390, 800);
  document.documentElement.setAttribute("data-compact-layout", "");
  render(<CrewLikeConfirm />);
  const dialog = screen.getByRole("alertdialog", { name: "Remove crew" });

  await waitFor(() => expect(bounds(dialog)).toEqual({ top: 0, left: 0, width: 390, height: 800 }));
  expect(getComputedStyle(dialog).borderRadius).toBe("0px");
});
