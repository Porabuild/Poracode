import { createElement, createRef } from "react";
import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PromptSegment } from "@/shared/contracts";
import { MentionInput, type MentionInputHandle } from "./MentionInput";

vi.mock("./MentionPopover", () => ({ MentionPopover: () => null }));

function renderInput() {
  const ref = createRef<MentionInputHandle>();
  render(
    createElement(MentionInput, {
      placeholder: "Send a message...",
      projectLocation: undefined,
      onTextChange: vi.fn<(hasText: boolean) => void>(),
      onSubmit: vi.fn<(segments: PromptSegment[]) => void>(),
      ref,
    }),
  );
  return { editor: screen.getByRole("textbox"), ref };
}

function placeCaret(node: Node, offset: number) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

function caretAtEnd(editor: HTMLElement) {
  placeCaret(editor, editor.childNodes.length);
}

/** jsdom has no native typing, so mimic what Chromium does for one keystroke. */
function typeText(editor: HTMLElement, text: string) {
  fireEvent(editor, new InputEvent("beforeinput", { inputType: "insertText", data: text }));
  const selection = window.getSelection()!;
  const range = selection.getRangeAt(0);
  const node = document.createTextNode(text);
  range.insertNode(node);
  editor.normalize();
  caretAtEnd(editor);
  fireEvent.input(editor, { inputType: "insertText", data: text });
}

function paste(editor: HTMLElement, text: string) {
  const event = createEvent.paste(editor, {
    clipboardData: { files: [], items: [], getData: () => text },
  });
  fireEvent(editor, event);
}

function undo(editor: HTMLElement) {
  fireEvent.keyDown(editor, { key: "z", ctrlKey: true });
}

describe("MentionInput undo history", () => {
  it("undoes a paste as one step", () => {
    const { editor } = renderInput();
    caretAtEnd(editor);
    typeText(editor, "hello ");
    paste(editor, "world");
    expect(editor.textContent).toBe("hello world");

    undo(editor);
    expect(editor.textContent).toBe("hello ");
  });

  it("redoes with Ctrl+Shift+Z and Ctrl+Y", () => {
    const { editor } = renderInput();
    caretAtEnd(editor);
    paste(editor, "one");
    paste(editor, " two");
    undo(editor);
    undo(editor);
    expect(editor.textContent).toBe("");

    fireEvent.keyDown(editor, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(editor.textContent).toBe("one");
    fireEvent.keyDown(editor, { key: "y", ctrlKey: true });
    expect(editor.textContent).toBe("one two");
  });

  it("handles undo requested by the native edit menu", () => {
    const { editor } = renderInput();
    caretAtEnd(editor);
    paste(editor, "text");

    const event = new InputEvent("beforeinput", { inputType: "historyUndo", cancelable: true });
    fireEvent(editor, event);

    expect(event.defaultPrevented).toBe(true);
    expect(editor.textContent).toBe("");
  });

  it("blocks native undo when there is nothing left to undo", () => {
    const { editor } = renderInput();
    const event = createEvent.keyDown(editor, { key: "z", ctrlKey: true });
    fireEvent(editor, event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("undoes a run of typing as one step", () => {
    const { editor } = renderInput();
    caretAtEnd(editor);
    paste(editor, "say ");
    typeText(editor, "h");
    typeText(editor, "i");

    undo(editor);
    expect(editor.textContent).toBe("say ");
  });

  it("starts a new step when the caret moves between keystrokes", () => {
    const { editor } = renderInput();
    caretAtEnd(editor);
    typeText(editor, "a");
    typeText(editor, "b");
    placeCaret(editor.firstChild!, 0);
    typeText(editor, "c");

    undo(editor);
    expect(editor.textContent).toBe("ab");
  });

  it("puts the caret back where it was before the undone edit", () => {
    const { editor } = renderInput();
    caretAtEnd(editor);
    paste(editor, "hello world");
    placeCaret(editor.firstChild!, 5);
    paste(editor, ",");

    undo(editor);
    expect(editor.textContent).toBe("hello world");
    const selection = window.getSelection()!;
    expect(selection.anchorNode?.textContent?.slice(0, selection.anchorOffset)).toBe("hello");
  });

  it("records a finished IME composition as one step", () => {
    const { editor } = renderInput();
    caretAtEnd(editor);
    paste(editor, "a");
    fireEvent.compositionStart(editor);
    for (const text of ["か", "な"]) {
      fireEvent(
        editor,
        new InputEvent("beforeinput", { inputType: "insertCompositionText", isComposing: true }),
      );
      editor.appendChild(document.createTextNode(text));
      caretAtEnd(editor);
      fireEvent.input(editor, { inputType: "insertCompositionText", isComposing: true });
    }
    fireEvent.compositionEnd(editor, { data: "かな" });

    undo(editor);
    expect(editor.textContent).toBe("a");
    fireEvent.keyDown(editor, { key: "y", ctrlKey: true });
    expect(editor.textContent).toBe("aかな");
  });

  it("keeps pasted line breaks as <br> elements", () => {
    const { editor, ref } = renderInput();
    caretAtEnd(editor);
    paste(editor, "one\ntwo");

    expect(editor.querySelectorAll("br")).toHaveLength(1);
    expect(ref.current?.serialize()).toBe("one\ntwo");
  });
});
