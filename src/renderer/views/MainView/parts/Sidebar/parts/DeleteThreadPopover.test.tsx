import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { shouldConfirmThreadDelete } from "@/renderer/state/threadDeletePreference";
import { DeleteThreadPopover } from "./DeleteThreadPopover";

describe("DeleteThreadPopover", () => {
  beforeEach(() => localStorage.clear());

  it("anchors the confirmation and can remember the destructive choice", () => {
    const onClose = vi.fn<() => void>();
    const onDelete = vi.fn<() => void>();
    render(
      <DeleteThreadPopover
        isOpen
        anchorPosition={{ x: 320, y: 140 }}
        worktreeBranch="feature/popover"
        onClose={onClose}
        onDelete={onDelete}
      />,
    );

    expect(screen.getByRole("dialog")).toHaveTextContent("feature/popover");
    fireEvent.click(screen.getByRole("checkbox", { name: "Don't ask again" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledOnce();
    expect(shouldConfirmThreadDelete()).toBe(false);
    expect(localStorage.getItem("poracode-delete-worktree-pref")).toBe("thread-and-worktree");
  });

  it("omits the worktree from the warning when none will be removed", () => {
    render(
      <DeleteThreadPopover
        isOpen
        anchorPosition={{ x: 320, y: 140 }}
        onClose={() => undefined}
        onDelete={() => undefined}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("This will permanently delete the thread.");
    expect(dialog).not.toHaveTextContent("worktree");
  });

  it("offers one explicit destructive action", () => {
    const onDelete = vi.fn<() => void>();
    render(
      <DeleteThreadPopover
        isOpen
        anchorPosition={{ x: 320, y: 140 }}
        worktreeBranch="feature/popover"
        onClose={() => undefined}
        onDelete={onDelete}
      />,
    );

    const destructiveAction = screen.getByRole("button", { name: "Delete" });
    expect(destructiveAction).toHaveClass("button--danger");
    expect(screen.queryByRole("button", { name: "Thread Only" })).not.toBeInTheDocument();
    fireEvent.click(destructiveAction);

    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("returns focus to the originating delete control after cancellation", async () => {
    function Harness() {
      const [isOpen, setIsOpen] = useState(true);
      const [origin, setOrigin] = useState<HTMLButtonElement | null>(null);
      return (
        <>
          <button ref={setOrigin} type="button">
            Delete row
          </button>
          <DeleteThreadPopover
            isOpen={isOpen}
            anchorPosition={{ x: 320, y: 140 }}
            worktreeBranch="feature/popover"
            {...(origin ? { returnFocusElement: origin } : {})}
            onClose={() => setIsOpen(false)}
            onDelete={() => undefined}
          />
        </>
      );
    }

    render(<Harness />);
    const origin = screen.getByText("Delete row").closest("button")!;
    origin.focus();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await vi.waitFor(() => expect(origin).toHaveFocus());
  });
});
