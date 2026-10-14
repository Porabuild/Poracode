import "fake-indexeddb/auto";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCommandPaletteStore } from "@/renderer/commands/commandPaletteStore";
import { useKeybindingStore } from "@/renderer/commands/keybindingStore";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

const cycleThread = vi.hoisted(() => vi.fn<() => void>());
vi.mock("@/renderer/bridge", () => ({ readBridge: () => ({ platform: "darwin" }) }));
vi.mock("@/renderer/commands/registry", () => ({
  buildCommandRegistry: () => [
    { id: "thread.recent.next", run: cycleThread },
    { id: "thread.recent.previous", run: cycleThread },
  ],
  buildWhenContext: () => ({
    hasThread: true,
    paletteOpen: useCommandPaletteStore.getState().isOpen,
  }),
  isCommandAvailable: () => true,
}));
afterEach(() => {
  useCommandPaletteStore.getState().close();
  vi.restoreAllMocks();
  cycleThread.mockClear();
});

function Harness(props: { onKey: (event: React.KeyboardEvent<HTMLInputElement>) => void }) {
  useKeyboardShortcuts();
  return <input aria-label="Palette input" onKeyDown={props.onKey} />;
}

describe("global shortcuts with Search open", () => {
  it("yields Ctrl+Tab and Ctrl+Shift+Tab to the palette before capture switches the thread", () => {
    vi.spyOn(useKeybindingStore.getState(), "load").mockResolvedValue(undefined);
    useKeybindingStore.setState({
      keybindings: [
        { command: "thread.recent.next", key: "Ctrl+Tab", when: "hasThread" },
        { command: "thread.recent.previous", key: "Ctrl+Shift+Tab", when: "hasThread" },
      ],
    });
    const received = vi.fn<(event: React.KeyboardEvent<HTMLInputElement>) => void>();
    render(<Harness onKey={received} />);
    useCommandPaletteStore.getState().open();
    fireEvent.keyDown(screen.getByLabelText("Palette input"), { key: "Tab", ctrlKey: true });
    fireEvent.keyDown(screen.getByLabelText("Palette input"), {
      key: "Tab",
      ctrlKey: true,
      shiftKey: true,
    });
    expect(received).toHaveBeenCalledTimes(2);
    expect(cycleThread).not.toHaveBeenCalled();
    useCommandPaletteStore.getState().close();
    fireEvent.keyDown(screen.getByLabelText("Palette input"), { key: "Tab", ctrlKey: true });
    expect(cycleThread).toHaveBeenCalledOnce();
  });
});
