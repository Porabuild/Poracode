import { afterEach, describe, expect, it } from "vitest";
import { installKeyboardFieldFocus } from "./keyboardFieldFocus";

async function flushMicrotasks() {
  await Promise.resolve();
}

describe("installKeyboardFieldFocus", () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = "";
  });

  it("enables keyboard navigation on Tab and Shift+Tab, and clears on pointer/mouse down or window blur", () => {
    cleanup = installKeyboardFieldFocus();
    const root = document.documentElement;

    expect(root.hasAttribute("data-keyboard-navigation")).toBe(false);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(root.hasAttribute("data-keyboard-navigation")).toBe(true);

    window.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(root.hasAttribute("data-keyboard-navigation")).toBe(false);

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }),
    );
    expect(root.hasAttribute("data-keyboard-navigation")).toBe(true);

    window.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(root.hasAttribute("data-keyboard-navigation")).toBe(false);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(root.hasAttribute("data-keyboard-navigation")).toBe(true);

    window.dispatchEvent(new Event("blur"));
    expect(root.hasAttribute("data-keyboard-navigation")).toBe(false);
  });

  it("ignores modifier shortcuts, IME composition, prevented Tab in text controls, character typing, and Escape", () => {
    cleanup = installKeyboardFieldFocus();
    const root = document.documentElement;

    for (const init of [
      { key: "Tab", ctrlKey: true },
      { key: "Tab", metaKey: true },
      { key: "Tab", altKey: true },
      { key: "Tab", isComposing: true },
      { key: "k", metaKey: true },
      { key: "a" },
      { key: "Enter" },
      { key: "Escape" },
    ]) {
      window.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true }));
      expect(root.hasAttribute("data-keyboard-navigation")).toBe(false);
    }

    const textarea = document.createElement("textarea");
    document.body.append(textarea);
    textarea.focus();
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Tab") event.preventDefault();
    });

    textarea.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
    );
    expect(root.hasAttribute("data-keyboard-navigation")).toBe(false);
  });

  it("enables keyboard navigation on arrow keys outside text-entry controls, on menu focus transfer, and on HeroUI comboboxes", async () => {
    cleanup = installKeyboardFieldFocus();
    const root = document.documentElement;

    const textInput = document.createElement("input");
    textInput.type = "text";
    const textarea = document.createElement("textarea");
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    // happy-dom/jsdom do not always infer isContentEditable from contentEditable alone.
    Object.defineProperty(editable, "isContentEditable", { value: true });
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    const button = document.createElement("button");
    document.body.append(textInput, textarea, editable, checkbox, button);

    for (const target of [textInput, textarea, editable]) {
      target.focus();
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      await flushMicrotasks();
      expect(root.hasAttribute("data-keyboard-navigation")).toBe(false);
    }

    button.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(root.hasAttribute("data-keyboard-navigation")).toBe(true);

    window.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(root.hasAttribute("data-keyboard-navigation")).toBe(false);

    checkbox.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(root.hasAttribute("data-keyboard-navigation")).toBe(true);

    window.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(root.hasAttribute("data-keyboard-navigation")).toBe(false);

    // ArrowDown inside a search input that transfers focus to a non-text menu item enables keyboard mode.
    textInput.focus();
    textInput.addEventListener(
      "keydown",
      () => {
        button.focus();
      },
      { once: true },
    );
    textInput.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await flushMicrotasks();
    expect(root.hasAttribute("data-keyboard-navigation")).toBe(true);

    window.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(root.hasAttribute("data-keyboard-navigation")).toBe(false);

    // ArrowDown on a combobox input enables keyboard mode immediately (while
    // ArrowLeft/ArrowRight caret movement stays quiet).
    const comboInput = document.createElement("input");
    comboInput.type = "text";
    comboInput.setAttribute("role", "combobox");
    document.body.append(comboInput);

    comboInput.focus();
    comboInput.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(root.hasAttribute("data-keyboard-navigation")).toBe(false);

    comboInput.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(root.hasAttribute("data-keyboard-navigation")).toBe(true);

    // A pointerdown before a focus-transfer microtask resolves cancels activation.
    window.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    textInput.focus();
    textInput.addEventListener(
      "keydown",
      () => {
        button.focus();
      },
      { once: true },
    );
    textInput.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    window.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await flushMicrotasks();
    expect(root.hasAttribute("data-keyboard-navigation")).toBe(false);
  });
});
