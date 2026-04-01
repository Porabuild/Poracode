import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { FileEntry, ProjectLocation, PromptSegment } from "../../../shared/contracts";
import { createChipElement, type FileMentionData } from "./FileMentionChip";
import { MentionPopover } from "./MentionPopover";
import { useDebouncedFileSearch } from "./useDebouncedFileSearch";
import { serializeToSegments, flattenSegments } from "./serializeMentions";

export interface MentionInputHandle {
  /** Get structured segments (text + file mentions) for the adapter pipeline. */
  serializeSegments(): PromptSegment[];
  /** Flatten to a display string (convenience). */
  serialize(): string;
  focus(): void;
  clear(): void;
}

// Store only serializable data, not a live DOM Range (#8 fix)
interface MentionState {
  query: string;
}

/**
 * Scan backward from the current cursor position to find an active `@query`.
 * Returns the query string, or null if no active mention trigger is found.
 */
function detectMentionQuery(): string | null {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || !sel.anchorNode) return null;

  const textNode = sel.anchorNode;
  if (textNode.nodeType !== Node.TEXT_NODE) return null;

  const text = textNode.textContent ?? "";
  const offset = sel.anchorOffset;

  let atIndex = -1;
  for (let i = offset - 1; i >= 0; i--) {
    const ch = text[i]!;
    if (ch === "@") {
      if (i === 0 || /\s/.test(text[i - 1]!)) {
        atIndex = i;
      }
      break;
    }
    if (/\s/.test(ch)) break;
  }

  if (atIndex < 0) return null;
  return text.slice(atIndex + 1, offset);
}

/**
 * Re-detect the live Range covering `@query` from the current cursor position.
 * Called at insertion time to avoid stale Range references (#8 fix).
 */
function detectMentionRange(): Range | null {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || !sel.anchorNode) return null;

  const textNode = sel.anchorNode;
  if (textNode.nodeType !== Node.TEXT_NODE) return null;

  const text = textNode.textContent ?? "";
  const offset = sel.anchorOffset;

  let atIndex = -1;
  for (let i = offset - 1; i >= 0; i--) {
    const ch = text[i]!;
    if (ch === "@") {
      if (i === 0 || /\s/.test(text[i - 1]!)) {
        atIndex = i;
      }
      break;
    }
    if (/\s/.test(ch)) break;
  }

  if (atIndex < 0) return null;

  const range = document.createRange();
  range.setStart(textNode, atIndex);
  range.setEnd(textNode, offset);
  return range;
}

/** Check if the editor has any meaningful content (text or chips). */
function hasEditorContent(editor: HTMLDivElement): boolean {
  // Check for chip nodes (#9 fix: chip-only content is valid)
  if (editor.querySelector("[data-mention-path]")) return true;
  // Check for non-whitespace text
  return (editor.textContent ?? "").trim().length > 0;
}

export const MentionInput = forwardRef<
  MentionInputHandle,
  {
    autoFocus?: boolean;
    compact?: boolean;
    disabled?: boolean;
    placeholder: string;
    projectLocation: ProjectLocation | undefined;
    onTextChange: (hasText: boolean) => void;
    onSubmit: (segments: PromptSegment[]) => void;
    onPasteImage?: (file: File) => void;
  }
>(function MentionInput(props, ref) {
  const {
    autoFocus,
    compact,
    disabled,
    placeholder,
    projectLocation,
    onTextChange,
    onSubmit,
    onPasteImage,
  } = props;
  const editorRef = useRef<HTMLDivElement>(null);
  const [mention, setMention] = useState<MentionState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useDebouncedFileSearch(projectLocation, mention?.query ?? "", mention !== null);

  useEffect(() => {
    setActiveIndex(0);
  }, [results]);

  useImperativeHandle(ref, () => ({
    serializeSegments() {
      if (!editorRef.current) return [];
      return serializeToSegments(editorRef.current);
    },
    serialize() {
      if (!editorRef.current) return "";
      return flattenSegments(serializeToSegments(editorRef.current));
    },
    focus() {
      editorRef.current?.focus();
    },
    clear() {
      if (editorRef.current) {
        editorRef.current.innerHTML = "";
        setMention(null);
      }
    },
  }));

  useEffect(() => {
    if (autoFocus) {
      editorRef.current?.focus();
    }
  }, [autoFocus]);

  function checkMentionState() {
    const query = detectMentionQuery();
    setMention(query !== null ? { query } : null);
  }

  function notifyTextChange() {
    if (!editorRef.current) return;
    onTextChange(hasEditorContent(editorRef.current));
  }

  function insertMention(entry: FileEntry) {
    if (!editorRef.current) return;

    // Re-detect the range fresh at insertion time (#8 fix)
    const range = detectMentionRange();
    if (!range) return;

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
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
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

    // Enter without popover = submit
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!editorRef.current) return;
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
          if (prev?.dataset?.mentionPath) {
            e.preventDefault();
            prev.remove();
            notifyTextChange();
            return;
          }
        }

        if (node.nodeType === Node.ELEMENT_NODE && offset > 0) {
          const child = node.childNodes[offset - 1] as HTMLElement | undefined;
          if (child?.dataset?.mentionPath) {
            e.preventDefault();
            child.remove();
            notifyTextChange();
            return;
          }
        }
      }
    }
  }

  // #7 fix: use Range-based insertion instead of deprecated document.execCommand
  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    // Detect pasted images from clipboard (screenshots, copied images)
    const imageFile =
      Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/")) ??
      (() => {
        // Fallback: check clipboardData.items for Windows compatibility
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
    notifyTextChange();
  }

  const editorClassName = compact
    ? "lightcode-mention-input lightcode-mention-input--compact"
    : "lightcode-mention-input";

  // For the popover, re-detect the live range for positioning
  const liveRange = mention ? detectMentionRange() : null;

  return (
    <div className="relative">
      <div
        ref={editorRef}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
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
