import { toast } from "@heroui/react";
import { friendlyError } from "@/shared/messages";
import { readBridge } from "@/renderer/bridge";
import {
  hasAnyClientBridge,
  hasClientCapability,
  isBrowserClientRuntime,
} from "@/renderer/clientRuntime";
import {
  addSelectionToSideChat,
  sideChatAvailable,
} from "@/renderer/components/thread/SideChat/sideChatActions";
import { useAppStore } from "@/renderer/state/appStore";
import { useComposerInputInbox } from "@/renderer/state/composerInputInbox";

/**
 * What a right-click can do. The host turns these into rows on the shared
 * context menu; this module only decides the actions and runs them.
 */
export type EditActionId =
  | "cut"
  | "copy"
  | "paste"
  | "select-all"
  | "open-in-app-browser"
  | "open-in-system-browser"
  | "copy-link"
  | "add-to-chat"
  | "add-to-side-chat";

export interface EditMenuAction {
  type: "action";
  id: EditActionId;
  enabled: boolean;
  /** Letter of the Ctrl/Cmd chord, when the command has a standard shortcut. */
  shortcut: "X" | "C" | "V" | "A" | null;
}

export interface EditMenuSeparator {
  type: "separator";
}

export type EditMenuModelEntry = EditMenuAction | EditMenuSeparator;

interface InputEditable {
  kind: "input";
  element: HTMLInputElement | HTMLTextAreaElement;
  start: number;
  end: number;
  direction: "forward" | "backward" | "none";
  selectedText: string;
  readOnly: boolean;
  password: boolean;
  hasText: boolean;
}

interface RichEditable {
  kind: "contenteditable";
  element: HTMLElement;
  range: Range | null;
  selectedText: string;
  readOnly: boolean;
  hasText: boolean;
}

type EditableTarget = InputEditable | RichEditable;

interface LinkTarget {
  url: string;
  appBrowser: boolean;
  systemBrowser: boolean;
}

interface ThreadQuote {
  threadId: string;
  text: string;
}

interface PageSelection {
  text: string;
  range: Range | null;
}

export interface EditContextRequest {
  x: number;
  y: number;
  entries: EditMenuModelEntry[];
  editable: EditableTarget | null;
  link: LinkTarget | null;
  threadQuote: ThreadQuote | null;
  pageSelection: PageSelection | null;
  selectAllRoot: HTMLElement | null;
}

const TEXTUAL_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "tel",
  "password",
  "email",
  "number",
]);

const FOREIGN_SURFACE = ".monaco-editor, .xterm, webview";

const CHROME_CONTROL =
  "button, [role='button'], [role='tab'], [role='menuitem'], [role='option'], [role='switch'], [role='checkbox'], [role='radio']";

const TEXT_BLOCK =
  "pre, code, p, li, td, th, blockquote, h1, h2, h3, h4, h5, h6, [data-chat-virtual-row]";

function eventElement(event: MouseEvent): HTMLElement | null {
  const target = event.target;
  if (target instanceof HTMLElement) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

function isSelectable(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const webkit = (style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect;
  return (style.userSelect || webkit || "") !== "none";
}

function isTextField(element: HTMLElement): element is HTMLInputElement | HTMLTextAreaElement {
  if (element instanceof HTMLTextAreaElement) return !element.disabled;
  if (!(element instanceof HTMLInputElement)) return false;
  return TEXTUAL_INPUT_TYPES.has(element.type) && !element.disabled;
}

function findEditable(element: HTMLElement): HTMLElement | null {
  const field = element.closest<HTMLElement>(
    "textarea, input, [contenteditable='true'], [contenteditable='plaintext-only']",
  );
  if (!field) return null;
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    return isTextField(field) ? field : null;
  }
  return field;
}

function readInputSelection(element: HTMLInputElement | HTMLTextAreaElement): {
  start: number;
  end: number;
  direction: "forward" | "backward" | "none";
  text: string;
} {
  try {
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? 0;
    const direction = element.selectionDirection ?? "none";
    const text =
      element instanceof HTMLInputElement && element.type === "password"
        ? ""
        : element.value.slice(Math.min(start, end), Math.max(start, end));
    return { start, end, direction, text };
  } catch {
    return { start: 0, end: 0, direction: "none", text: "" };
  }
}

function snapshotEditable(element: HTMLElement): EditableTarget | null {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const selection = readInputSelection(element);
    return {
      kind: "input",
      element,
      start: selection.start,
      end: selection.end,
      direction: selection.direction,
      selectedText: selection.text,
      readOnly: element.readOnly,
      password: element instanceof HTMLInputElement && element.type === "password",
      hasText: element.value.length > 0,
    };
  }

  const selection = window.getSelection();
  const inside =
    selection &&
    selection.rangeCount > 0 &&
    selection.anchorNode !== null &&
    element.contains(selection.anchorNode);
  return {
    kind: "contenteditable",
    element,
    range: inside ? selection.getRangeAt(0).cloneRange() : null,
    selectedText: inside ? selection.toString() : "",
    readOnly:
      element.getAttribute("aria-disabled") === "true" ||
      element.getAttribute("aria-readonly") === "true",
    hasText: (element.textContent ?? "").trim().length > 0,
  };
}

function bridgeHas(name: string): boolean {
  if (!hasAnyClientBridge()) return false;
  try {
    const bridge = readBridge() as unknown as Record<string, unknown>;
    return typeof bridge[name] === "function";
  } catch {
    return false;
  }
}

function findLink(element: HTMLElement): LinkTarget | null {
  const anchor = element.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  const raw = anchor.getAttribute("href")?.trim() ?? "";
  if (!/^(https?:|mailto:)/i.test(raw)) return null;
  let protocol = "";
  try {
    protocol = new URL(anchor.href).protocol;
  } catch {
    return null;
  }
  const http = protocol === "http:" || protocol === "https:";
  return {
    url: anchor.href || raw,
    appBrowser: http && hasClientCapability("nativeBrowserWebContents"),
    systemBrowser: bridgeHas(isBrowserClientRuntime() ? "openExternal" : "openExternalNative"),
  };
}

function threadQuoteFor(element: HTMLElement, editable: HTMLElement | null): ThreadQuote | null {
  if (editable) return null;
  const selection = window.getSelection();
  const text = selection && !selection.isCollapsed ? selection.toString().trim() : "";
  if (!text) return null;
  const pane = element.closest<HTMLElement>("[data-thread-id]");
  if (!pane || !selection?.anchorNode || !selection.focusNode) return null;
  if (!pane.contains(selection.anchorNode) || !pane.contains(selection.focusNode)) return null;
  const threadId = pane.getAttribute("data-thread-id");
  if (!threadId) return null;
  return { threadId, text };
}

function canAddToSideChat(threadId: string): boolean {
  const thread = useAppStore.getState().threads.find((item) => item.id === threadId);
  return (
    !!thread &&
    thread.presentationMode === "gui" &&
    hasClientCapability("nativeShell") &&
    sideChatAvailable(threadId, thread.presentationMode)
  );
}

function pageSelectionOutside(editable: HTMLElement | null): PageSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const text = selection.toString();
  if (!text) return null;
  if (editable && selection.anchorNode && editable.contains(selection.anchorNode)) return null;
  return { text, range: selection.getRangeAt(0).cloneRange() };
}

function textBlock(element: HTMLElement): HTMLElement | null {
  if (!isSelectable(element)) return null;
  const block = element.closest<HTMLElement>(TEXT_BLOCK) ?? element;
  if (
    block === document.body ||
    block === document.documentElement ||
    block.id === "root" ||
    block.classList.contains("poracode-shell")
  ) {
    return null;
  }
  if (!(block.textContent ?? "").trim()) return null;
  return block;
}

function action(
  id: EditActionId,
  enabled: boolean,
  shortcut: EditMenuAction["shortcut"],
): EditMenuAction {
  return { type: "action", id, enabled, shortcut };
}

function editingActions(request: {
  editable: EditableTarget | null;
  pageSelection: PageSelection | null;
  selectAllRoot: HTMLElement | null;
}): EditMenuAction[] {
  const editable = request.editable;
  if (editable) {
    const selected = editable.selectedText.length > 0;
    const canChange = !editable.readOnly;
    const canCopy = selected && !(editable.kind === "input" && editable.password);
    return [
      action("cut", canChange && canCopy, "X"),
      action("copy", canCopy, "C"),
      action("paste", canChange, "V"),
      action("select-all", editable.hasText, "A"),
    ];
  }

  if (!request.selectAllRoot && !request.pageSelection) return [];
  return [
    action("cut", false, "X"),
    action("copy", (request.pageSelection?.text.length ?? 0) > 0, "C"),
    action("paste", false, "V"),
    action("select-all", request.selectAllRoot !== null, "A"),
  ];
}

function linkActions(link: LinkTarget | null): EditMenuAction[] {
  if (!link) return [];
  const items: EditMenuAction[] = [];
  if (link.appBrowser) items.push(action("open-in-app-browser", true, null));
  if (link.systemBrowser) items.push(action("open-in-system-browser", true, null));
  items.push(action("copy-link", true, null));
  return items;
}

function quoteActions(quote: ThreadQuote | null): EditMenuAction[] {
  if (!quote) return [];
  const items = [action("add-to-chat", true, null)];
  if (canAddToSideChat(quote.threadId)) items.push(action("add-to-side-chat", true, null));
  return items;
}

function composeMenu(
  groups: EditMenuAction[][],
  editing: EditMenuAction[],
  editable: boolean,
): EditMenuModelEntry[] {
  const present = groups.filter((group) => group.length > 0);
  const usefulEditing = editing.some((entry) => entry.enabled) ? editing : [];
  if (editable) {
    const entries: EditMenuModelEntry[] = [...usefulEditing];
    if (present.length > 0 && entries.length > 0) entries.push({ type: "separator" });
    present.forEach((group, index) => {
      if (index > 0) entries.push({ type: "separator" });
      entries.push(...group);
    });
    return entries;
  }
  const entries: EditMenuModelEntry[] = [];
  present.forEach((group, index) => {
    if (index > 0) entries.push({ type: "separator" });
    entries.push(...group);
  });
  if (usefulEditing.length > 0) {
    if (entries.length > 0) entries.push({ type: "separator" });
    entries.push(...usefulEditing);
  }
  return entries;
}

function hasEnabledAction(entries: EditMenuModelEntry[]): boolean {
  return entries.some((entry) => entry.type === "action" && entry.enabled);
}

/**
 * Describes the menu for this right-click, or null when the target should keep
 * its own menu (or has nothing to copy, edit, or open).
 */
export function resolveEditContextMenu(event: MouseEvent): EditContextRequest | null {
  if (event.defaultPrevented) return null;
  const element = eventElement(event);
  if (!element || element.closest(FOREIGN_SURFACE)) return null;

  const editableHost = findEditable(element);
  const editable = editableHost ? snapshotEditable(editableHost) : null;
  const link = findLink(element);
  const threadQuote = threadQuoteFor(element, editableHost);
  const pageSelection = pageSelectionOutside(editableHost);
  const selectAllRoot = editableHost ? null : textBlock(element);
  const chrome = element.closest(CHROME_CONTROL);

  if (!editable && !link && !threadQuote && chrome && !pageSelection) return null;
  if (!editable && !link && !threadQuote && !selectAllRoot && !pageSelection) return null;

  const entries = composeMenu(
    [linkActions(link), quoteActions(threadQuote)],
    editingActions({ editable, pageSelection, selectAllRoot }),
    editable !== null,
  );
  if (!hasEnabledAction(entries)) return null;

  return {
    x: event.clientX,
    y: event.clientY,
    entries,
    editable,
    link,
    threadQuote,
    pageSelection,
    selectAllRoot,
  };
}

function runCommand(command: "cut" | "copy" | "paste" | "selectAll"): boolean {
  try {
    return document.execCommand(command);
  } catch {
    return false;
  }
}

async function writeClipboard(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fall through to the hidden field. Electron sometimes refuses writeText
    // when the document is not the focused window.
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.top = "0";
  field.style.left = "0";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.focus();
  field.select();
  try {
    document.execCommand("copy");
  } catch {
    // The clipboard is unavailable. The command is a no-op.
  }
  field.remove();
}

async function readClipboard(): Promise<string> {
  try {
    if (navigator.clipboard?.readText) return await navigator.clipboard.readText();
  } catch {
    return "";
  }
  return "";
}

function inputValueSetter(element: HTMLInputElement | HTMLTextAreaElement) {
  const prototype = Object.getPrototypeOf(element) as object;
  return Object.getOwnPropertyDescriptor(prototype, "value")?.set;
}

function replaceInputRange(
  element: HTMLInputElement | HTMLTextAreaElement,
  start: number,
  end: number,
  insert: string,
): void {
  const next = element.value.slice(0, start) + insert + element.value.slice(end);
  const setter = inputValueSetter(element);
  if (setter) setter.call(element, next);
  else element.value = next;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  const caret = start + insert.length;
  try {
    element.setSelectionRange(caret, caret);
  } catch {
    // number and email inputs reject a restored range
  }
}

function restoreEditable(editable: EditableTarget): void {
  if (editable.kind === "input") {
    editable.element.focus();
    try {
      editable.element.setSelectionRange(editable.start, editable.end, editable.direction);
    } catch {
      // number and email inputs keep the browser's own caret
    }
    return;
  }
  editable.element.focus();
  if (!editable.range) return;
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  try {
    selection.addRange(editable.range);
  } catch {
    // The range was detached while the menu was open.
  }
}

function restorePageSelection(selection: PageSelection | null): void {
  if (!selection?.range) return;
  const live = window.getSelection();
  if (!live) return;
  live.removeAllRanges();
  try {
    live.addRange(selection.range);
  } catch {
    // The quoted range no longer points at live text.
  }
}

function copyText(text: string, restore: () => void): void {
  if (!text) return;
  restore();
  if (!runCommand("copy")) void writeClipboard(text);
}

function cutEditable(editable: EditableTarget): void {
  if (editable.readOnly) return;
  if (editable.kind === "input" && editable.password) return;
  const text = editable.selectedText;
  if (!text) return;
  restoreEditable(editable);
  if (runCommand("cut")) return;
  void writeClipboard(text);
  if (editable.kind === "input") {
    replaceInputRange(editable.element, editable.start, editable.end, "");
    return;
  }
  if (!editable.range) return;
  const hostText = editable.element.textContent ?? "";
  if (!hostText.includes(text)) return;
  try {
    editable.range.deleteContents();
    editable.element.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "deleteByCut" }),
    );
  } catch {
    // The editor already consumed the range.
  }
}

function pasteEditable(editable: EditableTarget): void {
  if (editable.readOnly) return;
  restoreEditable(editable);
  if (editable.kind === "contenteditable") {
    const before = editable.element.innerHTML;
    if (runCommand("paste")) return;
    void readClipboard().then((text) => {
      if (!text || !editable.element.isConnected || editable.element.innerHTML !== before) return;
      restoreEditable(editable);
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", text);
      const paste = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData });
      if (editable.element.dispatchEvent(paste)) document.execCommand("insertText", false, text);
    });
    return;
  }
  const before = editable.element.value;
  if (runCommand("paste") || editable.element.value !== before) return;
  void readClipboard().then((text) => {
    if (!text || editable.element.value !== before) return;
    restoreEditable(editable);
    replaceInputRange(editable.element, editable.start, editable.end, text);
  });
}

function selectAll(request: EditContextRequest): void {
  const editable = request.editable;
  if (editable?.kind === "input") {
    editable.element.focus();
    try {
      editable.element.setSelectionRange(0, editable.element.value.length);
    } catch {
      editable.element.select();
    }
    return;
  }
  if (editable) {
    editable.element.focus();
    if (!runCommand("selectAll")) {
      const range = document.createRange();
      range.selectNodeContents(editable.element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    return;
  }
  const root = request.selectAllRoot;
  if (!root) return;
  const range = document.createRange();
  range.selectNodeContents(root);
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

function openInAppBrowser(url: string): void {
  void readBridge()
    .browserCreateTab({ url, activate: true, reveal: true })
    .catch((error: unknown) => {
      toast.danger(friendlyError(error));
    });
}

function openInSystemBrowser(url: string): void {
  const bridge = readBridge();
  void (isBrowserClientRuntime() ? bridge.openExternal(url) : bridge.openExternalNative(url)).catch(
    (error: unknown) => {
      toast.danger(friendlyError(error));
    },
  );
}

function addSelectionToChat(quote: ThreadQuote): void {
  useComposerInputInbox.getState().enqueue(quote.threadId, [{ kind: "text", content: quote.text }]);
  useAppStore.getState().requestComposerFocus(quote.threadId);
}

/** Runs a menu action against the snapshot taken when the menu opened. */
export function runEditContextAction(id: string, request: EditContextRequest): void {
  switch (id) {
    case "cut":
      if (request.editable) cutEditable(request.editable);
      return;
    case "copy":
      if (request.editable) {
        copyText(request.editable.selectedText, () => restoreEditable(request.editable!));
        return;
      }
      copyText(request.pageSelection?.text ?? "", () =>
        restorePageSelection(request.pageSelection),
      );
      return;
    case "paste":
      if (request.editable) pasteEditable(request.editable);
      return;
    case "select-all":
      selectAll(request);
      return;
    case "open-in-app-browser":
      if (request.link?.appBrowser) openInAppBrowser(request.link.url);
      return;
    case "open-in-system-browser":
      if (request.link?.systemBrowser) openInSystemBrowser(request.link.url);
      return;
    case "copy-link":
      if (request.link) void writeClipboard(request.link.url);
      return;
    case "add-to-chat":
      if (request.threadQuote) addSelectionToChat(request.threadQuote);
      return;
    case "add-to-side-chat":
      if (request.threadQuote)
        void addSelectionToSideChat(request.threadQuote.threadId, request.threadQuote.text).catch(
          (error: unknown) => toast.danger(friendlyError(error)),
        );
      return;
    default:
      return;
  }
}
