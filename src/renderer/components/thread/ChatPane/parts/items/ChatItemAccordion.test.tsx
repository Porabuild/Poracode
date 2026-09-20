import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatItemAccordion } from "./ChatItemAccordion";

vi.mock("../../chatPaneActionsContext", () => ({
  useChatPaneActions: () => null,
}));

describe("ChatItemAccordion", () => {
  it("shows the disclosure chevron only on hover-capable desktop interaction", () => {
    const { container } = render(
      <ChatItemAccordion
        icon={<span>i</span>}
        title="Read file"
        isExpanded={false}
        onExpandedChange={() => {}}
      >
        body
      </ChatItemAccordion>,
    );

    expect(container.querySelector(".disclosure__trigger")).toHaveClass("group");
    expect(container.querySelector(".disclosure__indicator")).toHaveClass(
      "[@media(hover:hover)]:opacity-0",
      "[@media(hover:hover)]:group-hover:opacity-100",
      "[@media(hover:hover)]:group-focus-visible:opacity-100",
    );
  });

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

  it("measures the shared truncated path on hover for structured titles", () => {
    const path = ".github/workflows/ci.yml";
    render(
      <ChatItemAccordion
        icon={<span>i</span>}
        title={path}
        titleParts={{ prefix: "Read", path }}
        hasBody={false}
      />,
    );
    // The path must sit in an LTR isolate inside the RTL truncation container,
    // or the browser reorders leading punctuation (".github" → "github.").
    const bidi = screen.getByText(path);
    expect(bidi.tagName).toBe("BDI");
    expect(bidi).toHaveAttribute("dir", "ltr");
    const pathElement = bidi.closest("span")!;
    const scrollWidth = vi.spyOn(pathElement, "scrollWidth", "get").mockReturnValue(400);
    const clientWidth = vi.spyOn(pathElement, "clientWidth", "get").mockReturnValue(100);

    fireEvent.pointerEnter(pathElement);

    expect(scrollWidth).toHaveBeenCalled();
    expect(clientWidth).toHaveBeenCalled();
  });
});
