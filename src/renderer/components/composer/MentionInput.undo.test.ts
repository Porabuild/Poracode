import { createElement, createRef } from "react";
import { act, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Globe } from "lucide-react";
import type { PromptSegment } from "@/shared/contracts";
import { MentionInput, type McpMentionItem, type MentionInputHandle } from "./MentionInput";

vi.mock("./MentionPopover", () => ({ MentionPopover: () => null }));

function renderInput(props: { mcpMentions?: McpMentionItem[] } = {}) {
  const ref = createRef<MentionInputHandle>();
  render(
    createElement(MentionInput, {
      placeholder: "Send a message...",
      projectLocation: undefined,
      onTextChange: vi.fn<(hasText: boolean) => void>(),
      onSubmit: vi.fn<(segments: PromptSegment[]) => void>(),
      ...props,
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

/** Fire the native events around a DOM change, as Chromium does for an edit it makes. */
function nativeEdit(editor: HTMLElement, inputType: string, change: () => void) {
  fireEvent(editor, new InputEvent("beforeinput", { inputType }));
  change();
  fireEvent.input(editor, { inputType });
}

/** jsdom has no native typing, so mimic what Chromium does for one keystroke. */
function typeText(editor: HTMLElement, text: string) {
  fireEvent(editor, new InputEvent("beforeinput", { inputType: "insertText", data: text }));
  const selection = window.getSelection()!;
  const range = selection.getRangeAt(0);
  range.insertNode(document.createTextNode(text));
  editor.normalize();
  const last = editor.lastChild!;
  placeCaret(last, last.nodeType === Node.TEXT_NODE ? (last as Text).length : 0);
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

function redo(editor: HTMLElement) {
  fireEvent.keyDown(editor, { key: "z", ctrlKey: true, shiftKey: true });
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

  it("replaces a native undo that skipped beforeinput with its own step", () => {
    const { editor } = renderInput();
    caretAtEnd(editor);
    paste(editor, "one");
    paste(editor, " two");

    // document.execCommand("undo") runs Chromium's stack without a beforeinput.
    editor.textContent = "something stale";
    fireEvent.input(editor, { inputType: "historyUndo" });

    expect(editor.textContent).toBe("one");
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

  it("undoes and redoes a slash command chip", () => {
    const { editor, ref } = renderInput();
    caretAtEnd(editor);
    typeText(editor, "/rev");
    act(() => ref.current?.insertSlashCommand("review"));
    expect(editor.querySelector("[data-slash-command]")).not.toBeNull();

    undo(editor);
    expect(editor.querySelector("[data-slash-command]")).toBeNull();
    expect(editor.textContent).toBe("/rev");
    redo(editor);
    expect(editor.querySelector("[data-slash-command]")).not.toBeNull();
  });

  it("undoes an @ mention chip back to the typed query", () => {
    const { editor } = renderInput({
      mcpMentions: [
        { id: "browser", name: "Browser", icon: Globe, detail: "MCP server", enabled: true },
      ],
    });
    caretAtEnd(editor);
    typeText(editor, "@bro");
    fireEvent.keyDown(editor, { key: "Enter" });
    expect(editor.querySelector("[data-mcp-id]")).not.toBeNull();

    undo(editor);
    expect(editor.querySelector("[data-mcp-id]")).toBeNull();
    expect(editor.textContent).toBe("@bro");
  });

  it("brings back a chip removed with Backspace", () => {
    const { editor, ref } = renderInput();
    act(() => ref.current?.insertSegments([{ kind: "file", path: "src/a.ts" }]));
    caretAtEnd(editor);
    fireEvent.keyDown(editor, { key: "Backspace" });
    expect(editor.querySelector("[data-mention-path]")).toBeNull();

    undo(editor);
    expect(editor.querySelector("[data-mention-path]")).not.toBeNull();
  });

  it("brings back a chip removed with its x button, which still works afterwards", () => {
    const { editor, ref } = renderInput();
    act(() => ref.current?.insertSegments([{ kind: "file", path: "src/a.ts" }]));
    const removeChip = () =>
      fireEvent.mouseDown(editor.querySelector(".poracode-mention-chip__delete")!);

    removeChip();
    expect(editor.querySelector("[data-mention-path]")).toBeNull();
    undo(editor);
    expect(editor.querySelector("[data-mention-path]")).not.toBeNull();
    removeChip();
    expect(editor.querySelector("[data-mention-path]")).toBeNull();
  });

  it("undoes segments inserted by other parts of the app", () => {
    const { editor, ref } = renderInput();
    caretAtEnd(editor);
    paste(editor, "see");
    act(() => ref.current?.insertSegments([{ kind: "file", path: "src/a.ts" }]));

    undo(editor);
    expect(editor.querySelector("[data-mention-path]")).toBeNull();
    expect(editor.textContent).toBe("see");
  });

  it("undoes a committed voice transcript as one step, skipping the previews", () => {
    const { editor, ref } = renderInput();
    caretAtEnd(editor);
    paste(editor, "note");
    editor.focus();
    placeCaret(editor.firstChild!, 4);
    act(() => ref.current?.previewVoiceTranscript("hel"));
    act(() => ref.current?.previewVoiceTranscript("hello there"));
    act(() => ref.current?.commitVoiceTranscript("hello there"));
    expect(editor.textContent).toBe("note hello there");

    undo(editor);
    expect(editor.textContent).toBe("note");
    redo(editor);
    expect(editor.textContent).toBe("note hello there");
  });

  it("starts a fresh history when a saved draft is restored", () => {
    const { editor, ref } = renderInput();
    caretAtEnd(editor);
    paste(editor, "typed");
    act(() => ref.current?.restoreFromSegments([{ kind: "text", content: "draft" }]));

    undo(editor);
    expect(editor.textContent).toBe("draft");
  });

  it("can restore content as an undoable step", () => {
    const { editor, ref } = renderInput();
    caretAtEnd(editor);
    paste(editor, "typed");
    act(() =>
      ref.current?.restoreFromSegments([{ kind: "text", content: "reverted" }], {
        undoable: true,
      }),
    );

    undo(editor);
    expect(editor.textContent).toBe("typed");
  });

  it("starts a fresh history after clear", () => {
    const { editor, ref } = renderInput();
    caretAtEnd(editor);
    paste(editor, "sent");
    act(() => ref.current?.clear());

    undo(editor);
    expect(editor.textContent).toBe("");
  });

  it("puts the caret after the redone edit even if it moved before the undo", () => {
    const { editor } = renderInput();
    caretAtEnd(editor);
    paste(editor, "abc");
    placeCaret(editor.firstChild!, 1);

    undo(editor);
    redo(editor);
    const selection = window.getSelection()!;
    expect(selection.anchorNode?.textContent?.slice(0, selection.anchorOffset)).toBe("abc");
  });

  it("undoes moving text by drag and drop as one step", () => {
    const { editor } = renderInput();
    caretAtEnd(editor);
    paste(editor, "ab");
    nativeEdit(editor, "deleteByDrag", () => {
      editor.textContent = "b";
    });
    nativeEdit(editor, "insertFromDrop", () => {
      editor.textContent = "ba";
      caretAtEnd(editor);
    });

    undo(editor);
    expect(editor.textContent).toBe("ab");
  });

  it("undoes text dropped from outside as the first edit", () => {
    const { editor } = renderInput();
    nativeEdit(editor, "insertFromDrop", () => {
      editor.textContent = "dropped";
      caretAtEnd(editor);
    });

    undo(editor);
    expect(editor.textContent).toBe("");
    redo(editor);
    expect(editor.textContent).toBe("dropped");
  });

  it("drops carriage returns from pasted Windows line endings", () => {
    const { editor, ref } = renderInput();
    caretAtEnd(editor);
    paste(editor, "one\r\ntwo");

    expect(editor.textContent).not.toContain("\r");
    expect(ref.current?.serialize()).toBe("one\ntwo");
  });

  it("keeps pasted line breaks as <br> elements", () => {
    const { editor, ref } = renderInput();
    caretAtEnd(editor);
    paste(editor, "one\ntwo");

    expect(editor.querySelectorAll("br")).toHaveLength(1);
    expect(ref.current?.serialize()).toBe("one\ntwo");
  });
});
