import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { WindowedPlainText } from "./WindowedPlainText";
import { useWindowedAssistantText } from "./useWindowedAssistantText";

function Harness({ text, isStreaming = true }: { text: string; isStreaming?: boolean }) {
  const body = useWindowedAssistantText(text, isStreaming);
  if (!body.window) return null;
  return (
    <WindowedPlainText
      text={body.window.text}
      hasEarlier={body.window.start > 0}
      isBrowsingEarlier={body.isBrowsingEarlier}
      onEarlier={body.showEarlier}
      onLatest={body.showLatest}
    />
  );
}

describe("windowed assistant text", () => {
  it("pages through earlier text and returns to the latest streaming page", () => {
    const text = `${"a".repeat(8_192)}${"b".repeat(8_192)}${"c".repeat(1_000)}`;
    const { container, rerender } = render(
      <AppProvider>
        <Harness text={text} />
      </AppProvider>,
    );

    expect(container.textContent).toContain("c".repeat(1_000));
    fireEvent.click(screen.getByRole("button", { name: "Earlier text" }));
    expect(container.textContent).not.toContain("c".repeat(1_000));
    expect(screen.getByRole("button", { name: "Back to latest" })).toBeInTheDocument();

    rerender(
      <AppProvider>
        <Harness text={`${text}new content`} />
      </AppProvider>,
    );
    expect(container.textContent).not.toContain("new content");

    fireEvent.click(screen.getByRole("button", { name: "Back to latest" }));
    expect(container.textContent).toContain("new content");
  });

  it("bounds very large formatted output as raw text", () => {
    const text = `*${"a".repeat(70_000)}`;
    render(
      <AppProvider>
        <Harness text={text} />
      </AppProvider>,
    );
    expect(screen.getByRole("button", { name: "Earlier text" })).toBeInTheDocument();
  });
});
