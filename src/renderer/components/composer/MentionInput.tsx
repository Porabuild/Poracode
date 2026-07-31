import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import type {
  AgentSlashCommand,
  FileEntry,
  ProjectLocation,
  PromptSegment,
} from "@/shared/contracts";
import { fileNameFromPath, skillSegmentFromSlashCommand } from "@/shared/promptContent";
import { createDiffCommentChipElement } from "./DiffCommentChip";
import { createChipElement, type FileMentionData } from "./FileMentionChip";
import { createMcpMentionChipElement } from "./McpMentionChip";
import { createSlashCommandChipElement } from "./SlashCommandChip";
import { MentionPopover, type MentionEntry } from "./MentionPopover";
import { useDebouncedFileSearch } from "./useDebouncedFileSearch";
import { serializeToSegments, flattenSegments } from "./serializeMentions";

/**
 * A composer MCP server offered as an `@`-mention (Browser, Crossagents, Computer
 * Use, …). The caller supplies already-resolved `name`/`icon`/`detail` so this
 * component stays registry-agnostic; `id` is echoed back via `onMcpMentionSelect`
 * when the server still needs enabling. Already-enabled servers are inserted as
 * prompt text so the mention directs the agent for this turn.
 */
export interface McpMentionItem {
  id: string;
  name: string;
  icon: LucideIcon;
  detail: string;
  enabled: boolean;
}

/** Stable empty list so an omitted `mcpMentions` prop doesn't churn renders. */
const EMPTY_MCP_MENTIONS: readonly McpMentionItem[] = [];

export function buildMentionResults(
  fileResults: FileEntry[],
  query: string,
  mcpMentions: readonly McpMentionItem[] = EMPTY_MCP_MENTIONS,
): MentionEntry[] {
  const q = query.trim().toLowerCase();
  // Case-insensitive prefix match on the display name, matching the legacy
  // "browser".startsWith(q) / "computer use".startsWith(q) behavior.
  const mcpResults: MentionEntry[] = mcpMentions
    .filter((item) => item.name.toLowerCase().startsWith(q))
    .map((item) => ({
      type: "mcp",
      path: item.id,
      name: item.name,
      icon: item.icon,
      detail: item.detail,
      enabled: item.enabled,
    }));
  return [...mcpResults, ...fileResults];
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
  insertSegments(segments: PromptSegment[], options?: { atEnd?: boolean; focus?: boolean }): void;
  previewVoiceTranscript(text: string): void;
  commitVoiceTranscript(text: string): void;
  clearVoiceTranscriptPreview(): void;
  insertSlashCommand(command: string | AgentSlashCommand): void;
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

function hasEditorContent(editor: HTMLDivElement): boolean {
  if (
    editor.querySelector(
      "[data-mention-path], [data-slash-command], [data-diff-comment-path], [data-mcp-id]",
    )
  ) {
    return true;
  }
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

/** Chip dataset fields for a skill segment (the caller supplies its own `id`). */
function skillChipDataset(segment: Extract<PromptSegment, { kind: "skill" }>) {
  return {
    skillName: segment.name,
    skillPath: segment.path,
    skillInvocation: segment.invocation,
    skillProvider: segment.provider,
    skillScope: segment.scope,
  };
}

function appendPromptSegments(parent: Node, segments: PromptSegment[]): void {
  for (const segment of segments) {
    if (segment.kind === "text") {
      const lines = segment.content.split("\n");
      for (let index = 0; index < lines.length; index++) {
        if (index > 0) parent.appendChild(document.createElement("br"));
        const line = lines[index]!;
        if (line) parent.appendChild(document.createTextNode(line));
      }
    } else if (segment.kind === "file") {
      parent.appendChild(
        createChipElement({
          path: segment.path,
          name: fileNameFromPath(segment.path),
          isDirectory: false,
        }),
      );
    } else if (segment.kind === "skill") {
      parent.appendChild(
        createSlashCommandChipElement({ id: segment.name, ...skillChipDataset(segment) }),
      );
    } else if (segment.kind === "diff_comment") {
      parent.appendChild(createDiffCommentChipElement(segment));
    } else if (segment.kind === "mcp") {
      parent.appendChild(createMcpMentionChipElement({ id: segment.id, name: segment.name }));
    }
  }
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
    /**
     * Composer MCP servers to offer as `@`-mentions (Browser, Crossagents,
     * Computer Use). Enabled entries remain as prompt text; disabled entries
     * call `onMcpMentionSelect` so the composer can enable them first.
     */
    mcpMentions?: readonly McpMentionItem[];
    onMcpMentionSelect?: (id: string) => void;
    onSlashCommandChange?: (query: string | null) => void;
    commandListId?: string;
    commandActiveDescendant?: string;
    submitOnEnter?: boolean;
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
    onMcpMentionSelect,
    onSlashCommandChange,
    commandListId,
    commandActiveDescendant,
    submitOnEnter = true,
    onInterceptKey,
  } = props;
  const mcpMentions = props.mcpMentions ?? EMPTY_MCP_MENTIONS;
  // Stable dependency key: which MCP mentions are offered, independent of the
  // array's per-render identity (mirrors the old boolean flags in the effect).
  const mcpMentionKey = mcpMentions.map((item) => `${item.id}:${item.enabled}`).join(",");
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
  const results = buildMentionResults(fileResults, mention?.query ?? "", mcpMentions);

  useEffect(() => {
    setActiveIndex(0);
  }, [mention?.query, fileResults, mcpMentionKey]);

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
      appendPromptSegments(editor, segments);
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
    insertSegments(segments: PromptSegment[], options?: { atEnd?: boolean; focus?: boolean }) {
      const editor = editorRef.current;
      if (!editor || segments.length === 0) return;

      if (options?.focus !== false) editor.focus();
      const selection = window.getSelection();
      const selectionInsideEditor =
        !options?.atEnd && selection?.rangeCount && selection.anchorNode
          ? editor.contains(selection.anchorNode)
          : false;
      const range = selectionInsideEditor ? selection!.getRangeAt(0) : placeCaretAtEnd(editor);
      if (!range) return;

      const precedingRange = document.createRange();
      precedingRange.selectNodeContents(editor);
      precedingRange.setEnd(range.startContainer, range.startOffset);
      const fragment = document.createDocumentFragment();
      const firstSegment = segments[0];
      const hasExplicitLeadingWhitespace =
        firstSegment?.kind === "text" && /^\s/.test(firstSegment.content);
      if (
        precedingRange.toString().length > 0 &&
        !/\s$/.test(precedingRange.toString()) &&
        !hasExplicitLeadingWhitespace
      ) {
        fragment.appendChild(document.createTextNode(" "));
      }
      appendPromptSegments(fragment, segments);
      const lastNode = fragment.lastChild;
      if (!lastNode) return;

      range.deleteContents();
      range.insertNode(fragment);
      range.setStartAfter(lastNode);
      range.collapse(true);
      if (options?.focus !== false) {
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      checkMentionState();
      notifyTextChange();
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
    insertSlashCommand(command: string | AgentSlashCommand) {
      const editor = editorRef.current;
      if (!editor) return;

      const range = detectTriggerRange("/");
      if (!range) return;

      const sel = window.getSelection();
      if (!sel) return;

      sel.removeAllRanges();
      sel.addRange(range);
      range.deleteContents();

      const skill = typeof command === "string" ? undefined : skillSegmentFromSlashCommand(command);
      const chip = createSlashCommandChipElement(
        typeof command === "string"
          ? command
          : {
              id: command.id,
              ...(command.skillName ? { skillName: command.skillName } : {}),
              ...(skill ? skillChipDataset(skill) : {}),
            },
      );
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

    if (entry.type === "mcp") {
      const sel = window.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.addRange(range);
      range.deleteContents();

      if (entry.enabled) {
        const chip = createMcpMentionChipElement({ id: entry.path, name: entry.name });
        range.insertNode(chip);
        // Trailing nbsp keeps the caret visually separate from the chip, matching
        // the file mention chip.
        const space = document.createTextNode(" ");
        chip.after(space);
        const nextRange = document.createRange();
        nextRange.setStartAfter(space);
        nextRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(nextRange);
      } else {
        onMcpMentionSelect?.(entry.path);
      }

      setMention(null);
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
    if (submitOnEnter && e.key === "Enter" && !e.shiftKey) {
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
          if (
            prev?.dataset?.mentionPath ||
            prev?.dataset?.slashCommand ||
            prev?.dataset?.diffCommentPath ||
            prev?.dataset?.mcpId
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
            child?.dataset?.diffCommentPath ||
            child?.dataset?.mcpId
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
    notifyTextChange();
  }

  const editorClassName = compact
    ? "poracode-mention-input poracode-mention-input--compact"
    : "poracode-mention-input";

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
        aria-controls={commandListId}
        aria-activedescendant={commandActiveDescendant}
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
