import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BottomSheet } from "@/renderer/components/common/BottomSheet";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { shouldConfirmThreadDelete } from "@/renderer/state/threadDeletePreference";
import { DeleteThreadPopover } from "./DeleteThreadPopover";

const layout = vi.hoisted(() => ({ compact: false, remote: false }));

// The real responsive-surface predicate picks popover or sheet from the
// compact-layout flag and the remote-session check, so only those two are
// replaced.
vi.mock("@/renderer/adaptiveLayout", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/adaptiveLayout")>()),
  useCompactLayout: () => layout.compact,
}));

vi.mock("@/renderer/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/bridge")>()),
  isRemoteSession: () => layout.remote,
}));

function FocusReturnHarness() {
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

    // The fixed anchor wrapper from ConfirmationPopover: desktop still anchors.
    expect(document.querySelector(".fixed.size-0")).not.toBeNull();
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
    render(<FocusReturnHarness />);
    const origin = screen.getByText("Delete row").closest("button")!;
    origin.focus();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await vi.waitFor(() => expect(origin).toHaveFocus());
  });
});

function SheetHandoffHarness() {
  // Mirrors the thread menu: choosing an action closes the controlled sheet
  // (it plays its exit) and opens the confirmation in the same turn.
  const [menuOpen, setMenuOpen] = useState(true);
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <BottomSheet isOpen={menuOpen} label="Thread actions" onClose={() => setMenuOpen(false)}>
        <button
          type="button"
          onClick={() => {
            setMenuOpen(false);
            setConfirming(true);
          }}
        >
          Delete Thread
        </button>
      </BottomSheet>
      {confirming ? (
        <DeleteThreadPopover
          isOpen
          anchorPosition={{ x: 0, y: 0 }}
          onClose={() => setConfirming(false)}
          onDelete={() => undefined}
        />
      ) : null}
    </>
  );
}

describe("DeleteThreadPopover on compact surfaces", () => {
  beforeEach(() => {
    localStorage.clear();
    layout.compact = true;
  });

  afterEach(() => {
    layout.compact = false;
    layout.remote = false;
  });

  it("renders as a bottom sheet instead of an anchored popover", async () => {
    // { x: 0, y: 0 } is the touch long-press anchor that used to pin the
    // popover to the top-left corner.
    render(
      <DeleteThreadPopover
        isOpen
        anchorPosition={{ x: 0, y: 0 }}
        worktreeBranch="feature/popover"
        onClose={() => undefined}
        onDelete={() => undefined}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "Delete thread?" });
    expect(document.querySelector(".m-sheet-backdrop")).toContainElement(dialog);
    expect(document.querySelector(".m-sheet")).not.toBeNull();
    expect(dialog).toHaveTextContent("feature/popover");
    expect(screen.getByRole("checkbox", { name: "Don't ask again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("button--danger");
    expect(document.querySelector(".fixed.size-0")).toBeNull();
  });

  it("deletes from the sheet and remembers the destructive choice", async () => {
    const onDelete = vi.fn<() => void>();
    render(
      <DeleteThreadPopover
        isOpen
        anchorPosition={{ x: 0, y: 0 }}
        worktreeBranch="feature/popover"
        onClose={() => undefined}
        onDelete={onDelete}
      />,
    );
    await screen.findByRole("dialog", { name: "Delete thread?" });

    fireEvent.click(screen.getByRole("checkbox", { name: "Don't ask again" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onDelete).toHaveBeenCalledOnce();
    expect(shouldConfirmThreadDelete()).toBe(false);
    expect(localStorage.getItem("poracode-delete-worktree-pref")).toBe("thread-and-worktree");
  });

  it("closes without deleting when cancelled", async () => {
    const onClose = vi.fn<() => void>();
    const onDelete = vi.fn<() => void>();
    render(
      <DeleteThreadPopover
        isOpen
        anchorPosition={{ x: 0, y: 0 }}
        onClose={onClose}
        onDelete={onDelete}
      />,
    );
    await screen.findByRole("dialog", { name: "Delete thread?" });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("returns focus to the originating delete control after cancellation", async () => {
    render(<FocusReturnHarness />);
    const origin = screen.getByText("Delete row").closest("button")!;
    await screen.findByRole("dialog", { name: "Delete thread?" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await vi.waitFor(() => expect(origin).toHaveFocus());
  });

  it("mounts immediately when no other sheet is exiting", () => {
    render(
      <DeleteThreadPopover
        isOpen
        anchorPosition={{ x: 0, y: 0 }}
        onClose={() => undefined}
        onDelete={() => undefined}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Delete thread?" })).toBeInTheDocument();
  });

  it("waits for the closing menu sheet instead of stacking on it", async () => {
    render(<SheetHandoffHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Thread" }));

    expect(document.querySelector(".m-sheet-backdrop[data-closing]")).not.toBeNull();
    expect(screen.queryByRole("dialog", { name: "Delete thread?" })).toBeNull();

    const dialog = await screen.findByRole("dialog", { name: "Delete thread?" });
    const backdrop = dialog.closest(".m-sheet-backdrop");
    expect(document.querySelectorAll(".m-sheet-backdrop")).toHaveLength(1);
    expect(backdrop).not.toHaveAttribute("data-closing");
    expect(backdrop).not.toHaveAttribute("data-nested");
  });

  it("also uses the sheet on a coarse-pointer remote session that is not compact", async () => {
    // The rule the thread menu follows, wider than the compact layout alone.
    layout.compact = false;
    layout.remote = true;
    render(
      <DeleteThreadPopover
        isOpen
        anchorPosition={{ x: 0, y: 0 }}
        onClose={() => undefined}
        onDelete={() => undefined}
      />,
    );

    const dialog = await screen.findByRole("dialog", { name: "Delete thread?" });
    expect(document.querySelector(".m-sheet-backdrop")).toContainElement(dialog);
    expect(document.querySelector(".fixed.size-0")).toBeNull();
  });
});
