import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ComposerAddMenu } from "./ComposerAddMenu";

describe("ComposerAddMenu", () => {
  it("hides the file picker action when file attachments are unavailable", () => {
    render(
      <ComposerAddMenu
        browserMcpEnabled={false}
        showFileOption={false}
        showBrowserOption
        onPickFiles={vi.fn<() => void>()}
        onToggleBrowserMcp={vi.fn<(next: boolean) => void>()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add attachment or capability" }));

    expect(screen.queryByText("File")).not.toBeInTheDocument();
    expect(screen.getByText("Browser")).toBeInTheDocument();
  });

  it("renders nothing when no add actions are available", () => {
    const { container } = render(
      <ComposerAddMenu
        browserMcpEnabled={false}
        showFileOption={false}
        showBrowserOption={false}
        onPickFiles={vi.fn<() => void>()}
        onToggleBrowserMcp={vi.fn<(next: boolean) => void>()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
