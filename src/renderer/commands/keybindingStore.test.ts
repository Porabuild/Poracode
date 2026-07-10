// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KeybindingsConfig } from "@/shared/keybindings";

const { setKeybindings } = vi.hoisted(() => ({
  setKeybindings: vi.fn<(file: KeybindingsConfig["file"]) => Promise<KeybindingsConfig>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ setKeybindings }),
}));

import { useKeybindingStore } from "./keybindingStore";

describe("keybindingStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useKeybindingStore.setState({
      path: "C:\\lightcode\\keybindings.json",
      keybindings: [{ command: "settings.open", key: "Ctrl+," }],
      loaded: true,
    });
  });

  it("rolls back an optimistic shortcut update when native registration fails", async () => {
    setKeybindings.mockRejectedValueOnce(new Error("quick-composer-shortcut-unavailable"));
    const previous = useKeybindingStore.getState().keybindings;

    await expect(
      useKeybindingStore.getState().save([
        { command: "settings.open", key: "Ctrl+," },
        { command: "quick-composer.toggle", key: "Ctrl+Shift+K" },
      ]),
    ).rejects.toThrow("quick-composer-shortcut-unavailable");

    expect(useKeybindingStore.getState().keybindings).toEqual(previous);
  });

  it("reconciles the shortcut file returned by main", async () => {
    const next = [{ command: "quick-composer.toggle", key: "Ctrl+Shift+K" }];
    setKeybindings.mockResolvedValueOnce({
      path: "C:\\lightcode\\keybindings.json",
      file: { version: 1, keybindings: next },
    });

    await useKeybindingStore.getState().save(next);

    expect(useKeybindingStore.getState().keybindings).toEqual(next);
  });
});
