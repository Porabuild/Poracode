import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteWebSocketClientMessage } from "@/shared/remote";
import {
  resetBrowserMirror,
  setBrowserSocketSender,
  useBrowserMirrorStore,
} from "@/renderer/browser/browserMirror";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { RemoteBrowserMirror } from "./RemoteBrowserMirror";

describe("RemoteBrowserMirror", () => {
  const messages: RemoteWebSocketClientMessage[] = [];

  beforeEach(() => {
    messages.length = 0;
    resetBrowserMirror();
    setBrowserSocketSender((message) => {
      messages.push(message);
      return true;
    });
    act(() => {
      useBrowserMirrorStore.getState().setFrame({
        tabId: "tab-1",
        dataUrl: "data:image/jpeg;base64,frame",
        metadata: {
          deviceWidth: 1000,
          deviceHeight: 500,
          pageScaleFactor: 1,
          offsetTop: 0,
          scrollOffsetX: 0,
          scrollOffsetY: 0,
        },
      });
      useBrowserMirrorStore.getState().setStatus({ status: "active", tabId: "tab-1" });
    });
  });

  afterEach(() => {
    resetBrowserMirror();
    setBrowserSocketSender(null);
  });

  it("watches the remote browser and forwards mapped pointer input", () => {
    const { getByRole, container, unmount } = render(
      <RemoteBrowserMirror activeTabId="tab-1" visible />,
    );
    const surface = getByRole("application", { name: "Browser" });
    const image = container.querySelector("img")!;
    surface.setPointerCapture = vi.fn<(pointerId: number) => void>();
    image.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500 }) as DOMRect;

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 250, clientY: 125 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 250, clientY: 125 });

    expect(screen.getByRole("textbox", { name: "Browser" })).toHaveFocus();
    expect(messages).toContainEqual({ type: "browser-watch" });
    expect(messages).toContainEqual({
      type: "browser-input",
      input: { kind: "tap", x: 250, y: 125 },
    });

    unmount();
    expect(messages).toContainEqual({ type: "browser-unwatch" });
  });

  it("does not summon the mobile keyboard for a scroll gesture", () => {
    const { getByRole, container } = render(<RemoteBrowserMirror activeTabId="tab-1" visible />);
    const surface = getByRole("application", { name: "Browser" });
    const proxy = screen.getByRole("textbox", { name: "Browser" });
    const image = container.querySelector("img")!;
    surface.setPointerCapture = vi.fn<(pointerId: number) => void>();
    image.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500 }) as DOMRect;

    fireEvent.pointerDown(surface, { pointerId: 1, clientX: 250, clientY: 125 });
    fireEvent.pointerMove(surface, { pointerId: 1, clientX: 250, clientY: 150 });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 250, clientY: 150 });

    expect(proxy).not.toHaveFocus();
    expect(messages).not.toContainEqual({
      type: "browser-input",
      input: { kind: "tap", x: 250, y: 150 },
    });
  });

  it("forwards inserted and composed text once through the mobile keyboard proxy", () => {
    render(<RemoteBrowserMirror activeTabId="tab-1" visible />);
    const proxy = screen.getByRole("textbox", { name: "Browser" });

    fireEvent.input(proxy, { target: { value: "hello" }, data: "hello", inputType: "insertText" });
    fireEvent.compositionStart(proxy);
    fireEvent.input(proxy, {
      target: { value: "日" },
      data: "日",
      inputType: "insertCompositionText",
      isComposing: true,
    });
    fireEvent.compositionEnd(proxy, { data: "日本" });
    fireEvent.input(proxy, {
      target: { value: "日本" },
      data: "日本",
      inputType: "insertText",
    });

    expect(messages.filter((message) => message.type === "browser-input")).toEqual([
      { type: "browser-input", input: { kind: "insert-text", text: "hello" } },
      { type: "browser-input", input: { kind: "insert-text", text: "日本" } },
    ]);
  });

  it("forwards hardware text, Backspace, and Enter without duplicate key events", () => {
    render(<RemoteBrowserMirror activeTabId="tab-1" visible />);
    const proxy = screen.getByRole("textbox", { name: "Browser" });

    fireEvent.keyDown(proxy, { key: "a" });
    fireEvent.input(proxy, { target: { value: "a" }, data: "a", inputType: "insertText" });
    fireEvent.keyDown(proxy, { key: "Backspace" });
    fireEvent.input(proxy, { inputType: "deleteContentBackward" });
    fireEvent.keyDown(proxy, { key: "Enter" });
    fireEvent.input(proxy, { inputType: "insertLineBreak" });

    expect(messages.filter((message) => message.type === "browser-input")).toEqual([
      { type: "browser-input", input: { kind: "insert-text", text: "a" } },
      { type: "browser-input", input: { kind: "key", key: "backspace" } },
      { type: "browser-input", input: { kind: "key", key: "enter" } },
    ]);
  });

  it("forwards mobile Backspace and Enter from virtual-keyboard input events", () => {
    render(<RemoteBrowserMirror activeTabId="tab-1" visible />);
    const proxy = screen.getByRole("textbox", { name: "Browser" });

    fireEvent.input(proxy, { inputType: "deleteContentBackward" });
    fireEvent.input(proxy, { inputType: "insertParagraph" });

    expect(messages.filter((message) => message.type === "browser-input")).toEqual([
      { type: "browser-input", input: { kind: "key", key: "backspace" } },
      { type: "browser-input", input: { kind: "key", key: "enter" } },
    ]);
  });
});
