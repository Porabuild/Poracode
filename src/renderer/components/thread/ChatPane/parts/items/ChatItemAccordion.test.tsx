import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatItemAccordion } from "./ChatItemAccordion";

vi.mock("../../chatPaneActionsContext", () => ({
  useChatPaneActions: () => null,
}));

describe("ChatItemAccordion", () => {
  it("does not force title overflow layout reads on mount", () => {
    const { container } = render(
      <ChatItemAccordion
        icon={<span>i</span>}
        title="a-very-long-tool-title-that-may-truncate"
        hasBody={false}
      />,
    );
    const code = container.querySelector("code");
    expect(code).not.toBeNull();

    const scrollWidth = vi.spyOn(code as HTMLElement, "scrollWidth", "get");
    const clientWidth = vi.spyOn(code as HTMLElement, "clientWidth", "get");
    scrollWidth.mockReturnValue(400);
    clientWidth.mockReturnValue(100);

    // Mount already completed; getters should not have been forced yet.
    expect(scrollWidth).not.toHaveBeenCalled();
    expect(clientWidth).not.toHaveBeenCalled();

    fireEvent.pointerEnter(
      screen.getByText("a-very-long-tool-title-that-may-truncate").closest("span")!,
    );
    expect(scrollWidth).toHaveBeenCalled();
    expect(clientWidth).toHaveBeenCalled();
  });
});
