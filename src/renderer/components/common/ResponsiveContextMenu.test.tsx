import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ResponsiveContextMenu } from "./ResponsiveContextMenu";

const layoutMock = vi.hoisted(() => ({ mobile: false }));

vi.mock("@/renderer/adaptiveLayout", () => ({
  useCompactLayout: () => layoutMock.mobile,
}));

vi.mock("./ContextMenu", () => ({
  ContextMenu: (props: { children: React.ReactNode }) => (
    <div data-testid="desktop-context-menu">{props.children}</div>
  ),
}));

vi.hoisted(() => {
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
      this.isPrimary = init.isPrimary ?? true;
    }
  }

  Object.defineProperty(globalThis, "PointerEvent", {
    configurable: true,
    value: TestPointerEvent,
  });
});

describe("ResponsiveContextMenu", () => {
  beforeEach(() => {
    layoutMock.mobile = false;
  });

  it("keeps the canonical desktop context menu", () => {
    render(
      <ResponsiveContextMenu label="Thread" items={[]} onAction={vi.fn<(key: string) => void>()}>
        <button type="button">Thread</button>
      </ResponsiveContextMenu>,
    );

    expect(screen.getByTestId("desktop-context-menu")).toBeInTheDocument();
  });

  it("opens the responsive drawer on touch long-press and swallows the trailing click", async () => {
    vi.useFakeTimers();
    try {
      layoutMock.mobile = true;
      const onAction = vi.fn<(key: string) => void>();
      const onPress = vi.fn<() => void>();
      render(
        <ResponsiveContextMenu
          label="Starting a conversation"
          items={[{ id: "archive", label: "Archive" }]}
          onAction={onAction}
        >
          <button type="button" onClick={onPress}>
            Starting a conversation
          </button>
        </ResponsiveContextMenu>,
      );

      const trigger = screen.getByRole("button", { name: "Starting a conversation" });
      fireEvent.pointerDown(trigger, {
        pointerType: "touch",
        isPrimary: true,
        clientX: 20,
        clientY: 20,
      });
      await act(async () => {
        vi.advanceTimersByTime(500);
      });
      fireEvent.pointerUp(trigger, { pointerType: "touch", isPrimary: true });
      fireEvent.click(trigger);

      expect(screen.getByRole("dialog", { name: "Starting a conversation" })).toBeInTheDocument();
      expect(onPress).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Archive" }));
      expect(onAction).toHaveBeenCalledWith("archive");
    } finally {
      vi.useRealTimers();
    }
  });
});
