import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarDoneRows } from "./SidebarDoneRows";
import type { SidebarRow } from "./sidebarProjectRows";
import type { Thread } from "@/shared/contracts";

vi.mock("@/renderer/hooks/uiSelectors", () => ({
  useCurrentThreadIds: () => ["selected"],
}));

const rows: SidebarRow[] = ["first", "second", "selected", "last"].map((id, index) => ({
  kind: "thread",
  key: id,
  thread: { id } as Thread,
  threadIndex: index,
  group: "done",
  showWorktreeBadge: false,
}));
const renderRow = (row: SidebarRow) => (
  <button key={row.key} type="button">
    {row.key}
  </button>
);

afterEach(() => vi.useRealTimers());

describe("SidebarDoneRows", () => {
  it("slides neighboring rows inside one clip while keeping selected rows separate", () => {
    render(<SidebarDoneRows rows={rows} renderRow={renderRow} />);

    const clip = screen.getByRole("button", { name: "first" }).closest(".grid");
    expect(clip).toContainElement(screen.getByRole("button", { name: "second" }));
    expect(clip).not.toContainElement(screen.getByRole("button", { name: "selected" }));
  });

  it("keeps outgoing rows for the animation without exposing them to interaction", async () => {
    vi.useFakeTimers();
    const { rerender } = render(<SidebarDoneRows rows={rows} renderRow={renderRow} />);
    const selected = screen.getByRole("button", { name: "selected" });

    rerender(<SidebarDoneRows rows={[rows[2]!]} renderRow={renderRow} />);

    expect(screen.queryByRole("button", { name: "first" })).toBeNull();
    expect(screen.getByText("first").closest("[inert]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "selected" })).toBe(selected);
    await act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByText("first")).toBeNull();
    expect(screen.getByRole("button", { name: "selected" })).toBe(selected);
  });

  it("reverses a closing section without removing rows that reopened", async () => {
    vi.useFakeTimers();
    const { rerender } = render(<SidebarDoneRows rows={rows} renderRow={renderRow} />);
    const first = screen.getByRole("button", { name: "first" });
    rerender(<SidebarDoneRows rows={[]} renderRow={renderRow} />);
    await act(() => vi.advanceTimersByTime(100));
    rerender(<SidebarDoneRows rows={rows} renderRow={renderRow} />);
    await act(() => vi.advanceTimersByTime(200));

    expect(screen.getByRole("button", { name: "first" })).toBe(first);
    expect(first.closest("[inert]")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });

  it("cleans up a pending exit when unmounted", () => {
    vi.useFakeTimers();
    const { rerender, unmount } = render(<SidebarDoneRows rows={rows} renderRow={renderRow} />);
    rerender(<SidebarDoneRows rows={[]} renderRow={renderRow} />);
    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
