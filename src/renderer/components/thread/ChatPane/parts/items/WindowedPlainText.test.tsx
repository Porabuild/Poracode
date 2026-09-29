import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { SmoothItemMarkdown } from "./ItemMarkdown";
import { WindowedPlainText } from "./WindowedPlainText";

describe("windowed plain text", () => {
  it("shows the latest text and lets readers page back and return", () => {
    const text = `${"a".repeat(8_192)}${"b".repeat(8_192)}${"c".repeat(1_000)}`;
    const { container } = render(
      <AppProvider>
        <WindowedPlainText text={text} />
      </AppProvider>,
    );

    expect(container.textContent).toContain("c".repeat(1_000));
    fireEvent.click(screen.getByRole("button", { name: "Earlier text" }));
    expect(container.textContent).not.toContain("c".repeat(1_000));
    expect(screen.getByRole("button", { name: "Back to latest" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to latest" }));
    expect(container.textContent).toContain("c".repeat(1_000));
  });

  it("uses the bounded viewport for a long unformatted assistant stream", () => {
    const text = `${"a".repeat(8_192)}${"b".repeat(8_192)}`;
    render(
      <AppProvider>
        <SmoothItemMarkdown text={text} isStreaming />
      </AppProvider>,
    );
    expect(screen.getByRole("button", { name: "Earlier text" })).toBeInTheDocument();
  });

  it("bounds very large formatted output as raw text", () => {
    const text = `*${"a".repeat(70_000)}`;
    render(
      <AppProvider>
        <SmoothItemMarkdown text={text} isStreaming />
      </AppProvider>,
    );
    expect(screen.getByRole("button", { name: "Earlier text" })).toBeInTheDocument();
  });
});
