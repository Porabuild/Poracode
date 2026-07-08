import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { FileEntry, ProjectLocation, PromptSegment } from "@/shared/contracts";
import { fileNameFromPath } from "@/shared/promptContent";
import { createChipElement, type FileMentionData } from "./FileMentionChip";
import { createSlashCommandChipElement, createTriggerWordChipElement } from "./SlashCommandChip";
import { type TriggerWordDef, findTriggerWord, triggerWordAlternation } from "./triggerWords";
import { MentionPopover, type MentionEntry } from "./MentionPopover";
import { useDebouncedFileSearch } from "./useDebouncedFileSearch";
import { serializeToSegments, flattenSegments } from "./serializeMentions";

const BROWSER_MENTION_ENTRY: MentionEntry = { type: "browser", path: "browser", name: "Browser" };

export function buildMentionResults(
  fileResults: FileEntry[],
  query: string,
  showBrowserMention: boolean,
): MentionEntry[] {
  const q = query.trim().toLowerCase();
  const browserResults =
    showBrowserMention && "browser".startsWith(q) ? [BROWSER_MENTION_ENTRY] : [];
  return [...browserResults, ...fileResults];
}

export interface MentionInputHandle {
  /** Get structured segments (text + file mentions) for the adapter pipeline. */
  serializeSegments(): PromptSegment[];
  /** Flatten to a display string (convenience). */
  serialize(): string;
  /** Rebuild the editor content from previously serialized segments. */
  restoreFromSegments(segments: PromptSegment[]): void;
  focus(): void;
  clear(): void;
  insertText(text: string): void;
  previewVoiceTranscript(text: string): void;
  commitVoiceTranscript(text: string): void;
  clearVoiceTranscriptPreview(): void;
  insertSlashCommand(id: string): void;
}

interface MentionState {
  query: string;
}

interface TriggerContext {
  textNode: Text;
  triggerIndex: number;
  cursorOffset: number;
}

/**
 * Returns true when the given text node is positioned at the very beginning of
 * its enclosing contentEditable host (no preceding siblings up the ancestor
 * chain). Used to anchor slash-command detection to the start of the input.
 */
function isAtEditorStart(textNode: Text): boolean {
  let node: Node = textNode;
  while (node.parentNode) {
    if (node.previousSibling) return false;
    const parent = node.parentNode;
    if (parent instanceof HTMLElement) {
      const editable = parent.getAttribute("contenteditable") ?? parent.contentEditable;
      if (editable === "true" || editable === "plaintext-only") {
        return true;
      }
    }
    node = parent;
  }
  return false;
}

/**
 * Scan backward from the current cursor position to find an active trigger.
 * `@` mentions activate at start-of-line or after whitespace anywhere in the
 * input. `/` slash commands only activate when the slash is the first
 * character of the editor, so typing "foo /bar" never opens the command list.
 */
function detectTriggerContext(triggerChar: string): TriggerContext | null {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || !sel.anchorNode) return null;

  const textNode = sel.anchorNode;
  if (textNode.nodeType !== Node.TEXT_NODE) return null;

  const text = textNode.textContent ?? "";
  const offset = sel.anchorOffset;
  const slashOnly = triggerChar === "/";

  let triggerIndex = -1;
  for (let i = offset - 1; i >= 0; i--) {
    const ch = text[i]!;
    if (ch === triggerChar) {
      if (slashOnly) {
        if (i === 0 && isAtEditorStart(textNode as Text)) {
          triggerIndex = i;
        }
      } else if (i === 0 || /\s/.test(text[i - 1]!)) {
        triggerIndex = i;
      }
      break;
    }
    if (/\s/.test(ch)) break;
  }

  if (triggerIndex < 0) return null;
  return { textNode: textNode as Text, triggerIndex, cursorOffset: offset };
}

function detectTriggerQuery(triggerChar: string): string | null {
  const ctx = detectTriggerContext(triggerChar);
  if (!ctx) return null;
  return (ctx.textNode.textContent ?? "").slice(ctx.triggerIndex + 1, ctx.cursorOffset);
}

function detectTriggerRange(triggerChar: string): Range | null {
  const ctx = detectTriggerContext(triggerChar);
  if (!ctx) return null;
  const range = document.createRange();
  range.setStart(ctx.textNode, ctx.triggerIndex);
  range.setEnd(ctx.textNode, ctx.cursorOffset);
  return range;
}

/** Stable empty list so an omitted `triggerWords` prop doesn't churn renders. */
const EMPTY_TRIGGER_WORDS: readonly TriggerWordDef[] = [];

/**
 * Promote a trigger word at/near the cursor into a chip. Matches any of the
 * enabled `defs` as a standalone word immediately before the caret.
 */
function replaceTriggerWordAtCursor(defs: readonly TriggerWordDef[]): boolean {
  if (defs.length === 0) return false;
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || !sel.anchorNode) return false;
  if (sel.anchorNode.nodeType !== Node.TEXT_NODE) return false;

  const textNode = sel.anchorNode as Text;
  // Don't replace inside an existing chip
  if (textNode.parentElement?.closest("[data-trigger-word]")) return false;

  const text = textNode.textContent ?? "";
  const cursor = sel.anchorOffset;
  const before = text.substring(0, cursor);
  const atCursorRe = new RegExp(`(?:^|[\\s(])(${triggerWordAlternation(defs)})\\s*$`, "i");
  const match = atCursorRe.exec(before);
  if (!match) return false;
  const matchedWord = match[1];
  const def = matchedWord ? findTriggerWord(defs, matchedWord) : undefined;
  if (!matchedWord || !def) return false;

  // Locate the matched word inside match[0] (which also captures the leading
  // boundary char and any trailing whitespace), so the offset math holds for
  // words of any length.
  const wordStart = match.index + match[0].indexOf(matchedWord);

  const range = document.createRange();
  range.setStart(textNode, wordStart);
  range.setEnd(textNode, wordStart + matchedWord.length);
  range.deleteContents();

  const chip = createTriggerWordChipElement(def.word);
  range.insertNode(chip);

  const nextRange = document.createRange();
  nextRange.setStartAfter(chip);
  nextRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(nextRange);
  return true;
}

/**
 * Walk all text nodes and convert any remaining trigger words to chips.
 * Returns true when at least one chip was inserted.
 */
function replaceAllTriggerWords(editor: HTMLDivElement, defs: readonly TriggerWordDef[]): boolean {
  if (defs.length === 0) return false;
  const wholeWordRe = new RegExp(`\\b(${triggerWordAlternation(defs)})\\b`, "gi");
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (node.parentElement?.closest("[data-trigger-word]")) continue;
    wholeWordRe.lastIndex = 0;
    if (wholeWordRe.test(node.textContent ?? "")) textNodes.push(node);
  }

  let inserted = false;
  // Process in reverse so earlier DOM mutations don't shift later offsets.
  for (let i = textNodes.length - 1; i >= 0; i--) {
    const tn = textNodes[i]!;
    const text = tn.textContent ?? "";
    const matches = [...text.matchAll(wholeWordRe)].reverse();
    for (const m of matches) {
      if (m.index == null) continue;
      const def = findTriggerWord(defs, m[1] ?? m[0]);
      if (!def) continue;
      const range = document.createRange();
      range.setStart(tn, m.index);
      range.setEnd(tn, m.index + m[0].length);
      range.deleteContents();
      const chip = createTriggerWordChipElement(def.word);
      range.insertNode(chip);
      inserted = true;
    }
  }
  return inserted;
}

function hasEditorContent(editor: HTMLDivElement): boolean {
  if (editor.querySelector("[data-mention-path], [data-slash-command], [data-trigger-word]"))
    return true;
  return (editor.textContent ?? "").trim().length > 0;
}

/**
 * Purge leftover whitespace-only / empty text nodes when the editor has no
 * meaningful content, so the `:empty` CSS selector matches and the placeholder
 * reappears. Without this, an orphan space text node left over from removing a
 * chip keeps the editor non-`:empty` and the placeholder stays hidden.
 */
function normalizeEmptyEditor(editor: HTMLDivElement): void {
  if (hasEditorContent(editor)) return;
  if (editor.childNodes.length === 0) return;
  editor.innerHTML = "";
}

function placeCaretAtEnd(editor: HTMLDivElement): Range | null {
  const sel = window.getSelection();
  if (!sel) return null;
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
  return range;
}

export const MentionInput = forwardRef<
  MentionInputHandle,
  {
    autoFocus?: boolean;
    compact?: boolean;
    disabled?: boolean;
    placeholder: string;
    projectLocation: ProjectLocation | undefined;
    projectId?: string;
    onTextChange: (hasText: boolean) => void;
    onSubmit: (segments: PromptSegment[]) => void;
    onPasteImage?: (file: File) => void;
    showBrowserMention?: boolean;
    onBrowserMentionSelect?: () => void;
    onSlashCommandChange?: (query: string | null) => void;
    /**
     * Trigger words to promote into chips as the user types/pastes (e.g. the
     * "workflow" orchestration affordance). Only the words the active
     * provider/model opts into are passed; an empty/omitted list leaves all
     * words as plain text. See {@link TriggerWordDef}.
     */
    triggerWords?: readonly TriggerWordDef[];
    /**
     * Called before MentionInput's own key handling (after the mention popover
     * absorbs navigation keys). Return `true` to indicate the key was handled
     * and stop further processing.
     */
    onInterceptKey?: (e: React.KeyboardEvent<HTMLDivElement>) => boolean;
  }
>(function MentionInput(props, ref) {
  const {
    autoFocus,
    compact,
    disabled,
    placeholder,
    projectLocation,
    projectId,
    onTextChange,
    onSubmit,
    onPasteImage,
    showBrowserMention,
    onBrowserMentionSelect,
    onSlashCommandChange,
    onInterceptKey,
    triggerWords,
  } = props;
  const triggerWordDefs = triggerWords ?? EMPTY_TRIGGER_WORDS;
  const editorRef = useRef<HTMLDivElement>(null);
  const lastSlashQueryRef = useRef<string | null>(null);
  const voicePreviewRef = useRef<HTMLSpanElement | null>(null);
  const [mention, setMention] = useState<MentionState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const fileResults = useDebouncedFileSearch(
    projectLocation,
    mention?.query ?? "",
    mention !== null,
    projectId,
  );
  const results = buildMentionResults(
    fileResults,
    mention?.query ?? "",
    showBrowserMention === true,
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [mention?.query, fileResults, showBrowserMention]);

  function insertPlainText(text: string) {
    const editor = editorRef.current;
    const trimmed = text.trim();
    if (!editor || !trimmed) return;

    editor.focus();
    const sel = window.getSelection();
    const selectionInsideEditor =
      sel?.rangeCount && sel.anchorNode ? editor.contains(sel.anchorNode) : false;
    const range = selectionInsideEditor ? sel!.getRangeAt(0) : placeCaretAtEnd(editor);
    if (!range) return;

    const precedingRange = document.createRange();
    precedingRange.selectNodeContents(editor);
    precedingRange.setEnd(range.startContainer, range.startOffset);
    const prefix =
      precedingRange.toString().length > 0 && !/\s$/.test(precedingRange.toString()) ? " " : "";
    const node = document.createTextNode(prefix + trimmed);
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(range);
    checkMentionState();
    notifyTextChange();
  }

  function clearVoicePreviewNode() {
    const preview = voicePreviewRef.current;
    if (preview?.isConnected) {
      preview.remove();
    }
    voicePreviewRef.current = null;
    notifyTextChange();
  }

  useImperativeHandle(ref, () => ({
    serializeSegments() {
      if (!editorRef.current) return [];
      return serializeToSegments(editorRef.current);
    },
    serialize() {
      if (!editorRef.current) return "";
      return flattenSegments(serializeToSegments(editorRef.current));
    },
    restoreFromSegments(segments: PromptSegment[]) {
      const editor = editorRef.current;
      if (!editor) return;
      voicePreviewRef.current = null;
      editor.innerHTML = "";
      for (const seg of segments) {
        if (seg.kind === "text") {
          const lines = seg.content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (i > 0) editor.appendChild(document.createElement("br"));
            const line = lines[i]!;
            if (line) editor.appendChild(document.createTextNode(line));
          }
        } else if (seg.kind === "file") {
          const chip = createChipElement({
            path: seg.path,
            name: fileNameFromPath(seg.path),
            isDirectory: false,
          });
          editor.appendChild(chip);
        }
      }
      onTextChange(hasEditorContent(editor));
    },
    focus() {
      editorRef.current?.focus();
    },
    clear() {
      if (editorRef.current) {
        voicePreviewRef.current = null;
        editorRef.current.innerHTML = "";
        setMention(null);
        if (lastSlashQueryRef.current !== null) {
          lastSlashQueryRef.current = null;
          onSlashCommandChange?.(null);
        }
      }
    },
    insertText(text: string) {
      insertPlainText(text);
    },
    previewVoiceTranscript(text: string) {
      const editor = editorRef.current;
      const trimmed = text.trim();
      if (!editor) return;
      if (!trimmed) {
        clearVoicePreviewNode();
        return;
      }

      const existing = voicePreviewRef.current;
      if (existing?.isConnected) {
        existing.textContent = `${existing.dataset.voicePrefix ?? ""}${trimmed}`;
        notifyTextChange();
        return;
      }

      editor.focus();
      const sel = window.getSelection();
      const selectionInsideEditor =
        sel?.rangeCount && sel.anchorNode ? editor.contains(sel.anchorNode) : false;
      const range = selectionInsideEditor ? sel!.getRangeAt(0) : placeCaretAtEnd(editor);
      if (!range) return;

      const precedingRange = document.createRange();
      precedingRange.selectNodeContents(editor);
      precedingRange.setEnd(range.startContainer, range.startOffset);
      const prefix =
        precedingRange.toString().length > 0 && !/\s$/.test(precedingRange.toString()) ? " " : "";
      const node = document.createElement("span");
      node.dataset.voiceTranscriptPreview = "true";
      node.dataset.voicePrefix = prefix;
      node.textContent = prefix + trimmed;
      range.deleteContents();
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(range);
      voicePreviewRef.current = node;
      checkMentionState();
      notifyTextChange();
    },
    commitVoiceTranscript(text: string) {
      const trimmed = text.trim();
      const preview = voicePreviewRef.current;
      if (!preview?.isConnected) {
        insertPlainText(trimmed);
        return;
      }

      if (!trimmed) {
        clearVoicePreviewNode();
        return;
      }

      const node = document.createTextNode(`${preview.dataset.voicePrefix ?? ""}${trimmed}`);
      preview.replaceWith(node);
      voicePreviewRef.current = null;
      const sel = window.getSelection();
      const range = document.createRange();
      range.setStartAfter(node);
      range.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(range);
      checkMentionState();
      notifyTextChange();
    },
    clearVoiceTranscriptPreview() {
      clearVoicePreviewNode();
    },
    insertSlashCommand(id: string) {
      const editor = editorRef.current;
      if (!editor) return;

      const range = detectTriggerRange("/");
      if (!range) return;

      const sel = window.getSelection();
      if (!sel) return;

      sel.removeAllRanges();
      sel.addRange(range);
      range.deleteContents();

      const chip = createSlashCommandChipElement(id);
      range.insertNode(chip);

      // Trailing space keeps the cursor visually separate from the chip and
      // matches the legacy "/id " plain-text behavior.
      const space = document.createTextNode(" ");
      chip.after(space);

      // Strip any browser-inserted empty siblings before the chip
      // (empty text nodes, lone <br>, empty wrappers) that would render as
      // a blank line above the badge.
      let prev: Node | null = chip.previousSibling;
      while (prev) {
        const next: Node | null = prev.previousSibling;
        if (prev.nodeType === Node.TEXT_NODE && (prev.textContent ?? "") === "") {
          prev.parentNode?.removeChild(prev);
        } else if (prev.nodeType === Node.ELEMENT_NODE) {
          const el = prev as HTMLElement;
          const isBr = el.tagName === "BR";
          const isEmptyWrapper =
            (el.tagName === "DIV" || el.tagName === "P") &&
            el.childNodes.length === 0 &&
            (el.textContent ?? "") === "";
          if (isBr || isEmptyWrapper) {
            el.remove();
          } else {
            break;
          }
        } else {
          break;
        }
        prev = next;
      }

      const newRange = document.createRange();
      newRange.setStartAfter(space);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);

      if (lastSlashQueryRef.current !== null) {
        lastSlashQueryRef.current = null;
        onSlashCommandChange?.(null);
      }
      notifyTextChange();
    },
  }));

  useEffect(() => {
    if (autoFocus) {
      editorRef.current?.focus();
    }
  }, [autoFocus]);

  function checkMentionState() {
    const query = detectTriggerQuery("@");
    setMention(query !== null ? { query } : null);
    const nextSlash = query === null ? detectTriggerQuery("/") : null;
    if (lastSlashQueryRef.current !== nextSlash) {
      lastSlashQueryRef.current = nextSlash;
      onSlashCommandChange?.(nextSlash);
    }
  }

  function notifyTextChange() {
    const editor = editorRef.current;
    if (!editor) return;
    normalizeEmptyEditor(editor);
    onTextChange(hasEditorContent(editor));
  }

  function insertMention(entry: MentionEntry) {
    if (!editorRef.current) return;

    const range = detectTriggerRange("@");
    if (!range) return;

    if (entry.type === "browser") {
      const sel = window.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.addRange(range);
      range.deleteContents();
      setMention(null);
      onBrowserMentionSelect?.();
      notifyTextChange();
      return;
    }

    const mentionData: FileMentionData = {
      path: entry.path,
      name: entry.name,
      isDirectory: entry.type === "directory",
    };

    const chip = createChipElement(mentionData);

    const sel = window.getSelection();
    if (!sel) return;

    sel.removeAllRanges();
    sel.addRange(range);
    range.deleteContents();
    range.insertNode(chip);

    // Insert a space text node after the chip for cursor placement
    const space = document.createTextNode("\u00A0");
    chip.after(space);

    // Move cursor after the space
    const newRange = document.createRange();
    newRange.setStartAfter(space);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    setMention(null);
    notifyTextChange();
  }

  function handleInput() {
    if (editorRef.current) replaceTriggerWordAtCursor(triggerWordDefs);
    checkMentionState();
    notifyTextChange();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // When popover is open, capture navigation keys
    if (mention && results.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % results.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + results.length) % results.length);
        return;
      }
      if ((e.key === "Tab" && !e.shiftKey) || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        const selected = results[activeIndex];
        if (selected) insertMention(selected);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }

    if (onInterceptKey?.(e)) return;

    // Enter without popover = submit
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!editorRef.current) return;
      // Convert any remaining trigger words before serializing.
      replaceAllTriggerWords(editorRef.current, triggerWordDefs);
      const segments = serializeToSegments(editorRef.current);
      if (flattenSegments(segments).length > 0) {
        onSubmit(segments);
      }
      return;
    }

    // Backspace: check if we should delete an adjacent chip
    if (e.key === "Backspace") {
      const sel = window.getSelection();
      if (sel && sel.isCollapsed && sel.anchorNode) {
        const node = sel.anchorNode;
        const offset = sel.anchorOffset;

        if (node.nodeType === Node.TEXT_NODE && offset === 0) {
          const prev = node.previousSibling as HTMLElement | null;
          if (
            prev?.dataset?.mentionPath ||
            prev?.dataset?.slashCommand ||
            prev?.dataset?.triggerWord
          ) {
            e.preventDefault();
            prev.remove();
            notifyTextChange();
            return;
          }
        }

        if (node.nodeType === Node.ELEMENT_NODE && offset > 0) {
          const child = node.childNodes[offset - 1] as HTMLElement | undefined;
          if (
            child?.dataset?.mentionPath ||
            child?.dataset?.slashCommand ||
            child?.dataset?.triggerWord
          ) {
            e.preventDefault();
            child.remove();
            notifyTextChange();
            return;
          }
        }
      }
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const imageFile =
      Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/")) ??
      (() => {
        for (const item of e.clipboardData.items) {
          if (item.type.startsWith("image/")) {
            return item.getAsFile();
          }
        }
        return null;
      })();

    if (imageFile && onPasteImage) {
      e.preventDefault();
      onPasteImage(imageFile);
      return;
    }

    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    // Promote any trigger-word tokens inside the pasted text to chips, matching
    // the live-typing behavior. The caret is restored to the end of the paste
    // afterwards so the user keeps typing where they left off rather than
    // jumping back into the chip.
    if (editorRef.current && replaceAllTriggerWords(editorRef.current, triggerWordDefs)) {
      placeCaretAtEnd(editorRef.current);
    }
    notifyTextChange();
  }

  const editorClassName = compact
    ? "lightcode-mention-input lightcode-mention-input--compact"
    : "lightcode-mention-input";

  const liveRange = mention ? detectTriggerRange("@") : null;

  return (
    <div className="relative">
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        tabIndex={0}
        aria-disabled={disabled || undefined}
        aria-multiline="true"
        aria-placeholder={placeholder}
        data-placeholder={placeholder}
        className={editorClassName}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onClick={checkMentionState}
        {...({ placeholder } as React.HTMLAttributes<HTMLDivElement>)}
      />
      {mention && liveRange && results.length > 0 && (
        <MentionPopover
          results={results}
          activeIndex={activeIndex}
          editorEl={editorRef.current}
          mentionRange={liveRange}
          onSelect={insertMention}
          onActiveIndexChange={setActiveIndex}
        />
      )}
    </div>
  );
});
