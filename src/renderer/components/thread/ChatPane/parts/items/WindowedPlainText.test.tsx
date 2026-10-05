import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import {
  appendRuntimeStream,
  replaceRuntimeStream,
  type RuntimeStreamRetention,
} from "@/renderer/state/slices/runtimeStreamRetention";
import { HEAD_CHARS, TAIL_CHARS, elisionNotice } from "@/shared/runtimeStreamRetentionPolicy";
import { PLAIN_TEXT_WINDOW_CHARS, plainTextWindow } from "./longPlainText";
import { WindowedPlainText } from "./WindowedPlainText";
import { useWindowedAssistantText } from "./useWindowedAssistantText";

function Harness({
  text,
  isStreaming = true,
  retention,
}: {
  text: string;
  isStreaming?: boolean;
  retention?: RuntimeStreamRetention;
}) {
  const body = useWindowedAssistantText(text, isStreaming, retention);
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

  it("holds the selected page across consecutive same-length capped streams and pages by source position", () => {
    const width = PLAIN_TEXT_WINDOW_CHARS;
    const source = `${"h".repeat(HEAD_CHARS)}${"m".repeat(1_000)}${"t".repeat(TAIL_CHARS - 3 * width)}${"a".repeat(width)}${"b".repeat(width)}${"c".repeat(width)}`;
    let stream = replaceRuntimeStream(source);
    const view = () => (
      <AppProvider>
        <Harness {...stream} />
      </AppProvider>
    );
    const { container, rerender } = render(view());
    const visibleText = () => container.firstElementChild!.firstElementChild!.textContent;
    expect(visibleText()).toBe("c".repeat(width));
    fireEvent.click(screen.getByRole("button", { name: "Earlier text" }));
    expect(visibleText()).toBe("b".repeat(width));
    const projectedLength = stream.text.length;
    for (const delta of ["first new tail", "second new tail", "third new tail"]) {
      stream = appendRuntimeStream(stream.text, delta, stream.retention);
      expect(stream.text.length).toBe(projectedLength);
      rerender(view());
      expect(visibleText()).toBe("b".repeat(width));
    }
    fireEvent.click(screen.getByRole("button", { name: "Earlier text" }));
    expect(visibleText()).toBe("a".repeat(width));
    fireEvent.click(screen.getByRole("button", { name: "Back to latest" }));
    expect(visibleText()).toBe(plainTextWindow(stream.text, stream.text.length).text);
    expect(visibleText()).toContain("third new tail");
  });

  it("shows the existing notice when an Earlier target has rolled into the omitted middle", () => {
    let stream = replaceRuntimeStream(
      `${"h".repeat(HEAD_CHARS)}${"m".repeat(10)}${"t".repeat(TAIL_CHARS)}`,
    );
    const view = () => (
      <AppProvider>
        <Harness {...stream} />
      </AppProvider>
    );
    const { container, rerender } = render(view());
    const visibleText = () => container.firstElementChild!.firstElementChild!.textContent!;
    fireEvent.click(screen.getByRole("button", { name: "Earlier text" }));
    const selected = visibleText();
    stream = appendRuntimeStream(stream.text, "n".repeat(TAIL_CHARS), stream.retention);
    rerender(view());
    expect(visibleText()).toBe(selected);

    fireEvent.click(screen.getByRole("button", { name: "Earlier text" }));
    expect(visibleText()).toBe(plainTextWindow(stream.text, stream.retention!.tailStart).text);
    expect(visibleText()).toContain(elisionNotice(stream.retention!.elidedChars));
    expect(visibleText()).not.toContain("n");
    expect(visibleText().length).toBeLessThanOrEqual(PLAIN_TEXT_WINDOW_CHARS + 1);
    fireEvent.click(screen.getByRole("button", { name: "Earlier text" }));
    expect(visibleText()).toBe("h".repeat(PLAIN_TEXT_WINDOW_CHARS));

    fireEvent.click(screen.getByRole("button", { name: "Back to latest" }));
    expect(visibleText()).toBe("n".repeat(PLAIN_TEXT_WINDOW_CHARS));
  });
});
