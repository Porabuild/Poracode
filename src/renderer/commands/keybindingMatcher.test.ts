import { describe, expect, it } from "vitest";
import { bindingForPlatform, canonicalizeKeybinding, eventToKeybinding } from "./keybindingMatcher";

describe("keybindingMatcher", () => {
  it("chooses platform-specific bindings over the shared key", () => {
    const binding = {
      command: "palette.open",
      key: "Ctrl+Shift+P",
      mac: "Meta+Shift+P",
    };

    expect(bindingForPlatform(binding, "darwin")).toBe("Meta+Shift+P");
    expect(bindingForPlatform(binding, "linux")).toBe("Ctrl+Shift+P");
  });

  it("normalizes Mod to the platform command modifier", () => {
    expect(canonicalizeKeybinding("Mod+Shift+P", "darwin")).toBe("meta+shift+p");
    expect(canonicalizeKeybinding("Mod+Shift+P", "linux")).toBe("ctrl+shift+p");
  });

  it("normalizes keyboard events into the same canonical shape", () => {
    const event = new KeyboardEvent("keydown", {
      key: "P",
      metaKey: true,
      shiftKey: true,
    });

    expect(eventToKeybinding(event, "darwin")).toBe("meta+shift+p");
  });

  it("matches shifted-punctuation chords written with the base key", () => {
    // Holding Shift, the browser reports the shifted glyph ("}" for the "]" key),
    // while the binding is written with the base key. Both must canonicalize the
    // same so e.g. Ctrl+Shift+] (Next chat) actually fires.
    const next = new KeyboardEvent("keydown", { key: "}", ctrlKey: true, shiftKey: true });
    expect(eventToKeybinding(next, "win32")).toBe("ctrl+shift+]");
    expect(canonicalizeKeybinding("Ctrl+Shift+]", "win32")).toBe("ctrl+shift+]");

    const previous = new KeyboardEvent("keydown", { key: "{", ctrlKey: true, shiftKey: true });
    expect(eventToKeybinding(previous, "win32")).toBe("ctrl+shift+[");
    expect(canonicalizeKeybinding("Ctrl+Shift+[", "win32")).toBe("ctrl+shift+[");
  });
});
