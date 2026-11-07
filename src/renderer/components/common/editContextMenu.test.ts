import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "@heroui/react";
import { useComposerInputInbox } from "@/renderer/state/composerInputInbox";
import * as sideChatActions from "@/renderer/components/thread/SideChat/sideChatActions";

const bridgeState = vi.hoisted(() => ({
  present: false,
  browser: false,
  browserCreateTab: vi.fn<
    (payload: { url: string; activate?: boolean; reveal?: boolean }) => Promise<void>
  >(async () => undefined),
  openExternalNative: vi.fn<(url: string) => Promise<void>>(async () => undefined),
  openExternal: vi.fn<(url: string) => Promise<void>>(async () => undefined),
}));

vi.mock("@/renderer/clientRuntime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/renderer/clientRuntime")>();
  return {
    ...actual,
    hasAnyClientBridge: () => bridgeState.present,
    hasClientCapability: () => bridgeState.present && !bridgeState.browser,
    isBrowserClientRuntime: () => bridgeState.browser,
  };
});

vi.mock("@/renderer/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/renderer/bridge")>();
  return { ...actual, readBridge: () => bridgeState };
});
import {
  resolveEditContextMenu,
  runEditContextAction,
  type EditMenuAction,
} from "./editContextMenu";

function contextMenuOn(target: Element, init?: MouseEventInit): MouseEvent {
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: 12,
    clientY: 24,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

function actionsOf(event: MouseEvent): EditMenuAction[] {
  const request = resolveEditContextMenu(event);
  expect(request).not.toBeNull();
  return request!.entries.filter((entry): entry is EditMenuAction => entry.type === "action");
}

function enabledIds(actions: EditMenuAction[]): string[] {
  return actions.filter((action) => action.enabled).map((action) => action.id);
}

function stubExecCommand(result: boolean) {
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    writable: true,
    value: () => result,
  });
  return vi.spyOn(document, "execCommand").mockReturnValue(result);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
  useComposerInputInbox.setState({ itemsByComposer: {} });
  bridgeState.present = false;
  bridgeState.browser = false;
  bridgeState.browserCreateTab.mockClear();
  bridgeState.openExternalNative.mockClear();
  bridgeState.openExternal.mockClear();
});

describe("resolveEditContextMenu", () => {
  it("offers the editing commands for a text field", () => {
    const input = document.createElement("input");
    input.value = "hello";
    document.body.append(input);
    input.focus();
    input.setSelectionRange(1, 4);

    const actions = actionsOf(contextMenuOn(input));

    expect(actions.map((action) => action.id)).toEqual(["cut", "copy", "paste", "select-all"]);
    expect(enabledIds(actions)).toEqual(["cut", "copy", "paste", "select-all"]);
  });

  it("disables cut and paste in a read-only field", () => {
    const input = document.createElement("input");
    input.value = "hello";
    input.readOnly = true;
    document.body.append(input);
    input.setSelectionRange(0, 5);

    expect(enabledIds(actionsOf(contextMenuOn(input)))).toEqual(["copy", "select-all"]);
  });

  it("does not offer copy or cut for a password", () => {
    const input = document.createElement("input");
    input.type = "password";
    input.value = "secret";
    document.body.append(input);
    input.setSelectionRange(0, 6);

    expect(enabledIds(actionsOf(contextMenuOn(input)))).toEqual(["paste", "select-all"]);
  });

  it("offers cut, copy, paste, and select all on selected page text", () => {
    const paragraph = document.createElement("p");
    paragraph.textContent = "Review the README";
    document.body.append(paragraph);
    const text = paragraph.firstChild;
    if (!(text instanceof Text)) throw new Error("expected a text node");
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 6);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    const actions = actionsOf(contextMenuOn(paragraph));

    expect(actions.map((action) => action.id)).toEqual(["cut", "copy", "paste", "select-all"]);
    expect(enabledIds(actions)).toEqual(["copy", "select-all"]);
  });

  it("puts link actions ahead of the editing commands", () => {
    const anchor = document.createElement("a");
    anchor.href = "https://example.com/pr/2220";
    anchor.textContent = "#2220";
    document.body.append(anchor);

    const request = resolveEditContextMenu(contextMenuOn(anchor));

    expect(
      request?.entries.map((entry) => (entry.type === "action" ? entry.id : "separator")),
    ).toEqual(["copy-link", "separator", "cut", "copy", "paste", "select-all"]);
    expect(
      enabledIds(
        request!.entries.filter((entry): entry is EditMenuAction => entry.type === "action"),
      ),
    ).toEqual(["copy-link", "select-all"]);
  });

  it("offers the Poracode browser and the system browser when both can open the link", () => {
    bridgeState.present = true;
    const anchor = document.createElement("a");
    anchor.href = "https://example.com/pr/2220";
    anchor.textContent = "#2220";
    document.body.append(anchor);

    const request = resolveEditContextMenu(contextMenuOn(anchor));
    runEditContextAction("open-in-app-browser", request!);
    runEditContextAction("open-in-system-browser", request!);

    expect(enabledIds(actionsOf(contextMenuOn(anchor)))).toEqual([
      "open-in-app-browser",
      "open-in-system-browser",
      "copy-link",
      "select-all",
    ]);
    expect(bridgeState.browserCreateTab).toHaveBeenCalledWith({
      url: "https://example.com/pr/2220",
      activate: true,
      reveal: true,
    });
    expect(bridgeState.openExternalNative).toHaveBeenCalledWith("https://example.com/pr/2220");
  });

  it("opens links through the browser client without offering a native browser panel", () => {
    bridgeState.present = true;
    bridgeState.browser = true;
    const anchor = document.createElement("a");
    anchor.href = "https://example.com";
    document.body.append(anchor);
    const request = resolveEditContextMenu(contextMenuOn(anchor));
    expect(request?.entries).not.toContainEqual(
      expect.objectContaining({ id: "open-in-app-browser" }),
    );
    runEditContextAction("open-in-system-browser", request!);
    expect(bridgeState.openExternal).toHaveBeenCalledWith("https://example.com/");
    expect(bridgeState.openExternalNative).not.toHaveBeenCalled();
  });

  it("adds selected thread text to its own composer, including a side chat", () => {
    const pane = document.createElement("div");
    pane.dataset.threadId = "thread-1";
    const paragraph = document.createElement("p");
    paragraph.textContent = "Review the README";
    pane.append(paragraph);
    document.body.append(pane);
    const text = paragraph.firstChild;
    if (!(text instanceof Text)) throw new Error("expected a text node");
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 6);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    const request = resolveEditContextMenu(contextMenuOn(paragraph));
    expect(request?.threadQuote).toEqual({ threadId: "thread-1", text: "Review" });
    expect(enabledIds(actionsOf(contextMenuOn(paragraph)))).toContain("add-to-chat");
    expect(enabledIds(actionsOf(contextMenuOn(paragraph)))).not.toContain("add-to-side-chat");
    runEditContextAction("add-to-chat", request!);
    expect(useComposerInputInbox.getState().itemsByComposer["thread-1"]).toEqual([
      [{ kind: "text", content: "Review" }],
    ]);

    const side = document.createElement("div");
    side.dataset.sideChatSource = "parent";
    const child = document.createElement("div");
    child.dataset.threadId = "child";
    const note = document.createElement("p");
    note.textContent = "side note";
    child.append(note);
    side.append(child);
    document.body.append(side);
    const noteText = note.firstChild;
    if (!(noteText instanceof Text)) throw new Error("expected a text node");
    const sideRange = document.createRange();
    sideRange.selectNodeContents(noteText);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(sideRange);

    expect(resolveEditContextMenu(contextMenuOn(note))?.threadQuote?.threadId).toBe("child");
    expect(resolveEditContextMenu(contextMenuOn(paragraph))?.threadQuote).toBeNull();
    useComposerInputInbox.setState({ itemsByComposer: {} });
  });

  it("leaves a button, a foreign editor, and an already-handled click alone", () => {
    const button = document.createElement("button");
    button.textContent = "Save";
    const editor = document.createElement("div");
    editor.className = "monaco-editor";
    editor.textContent = "const value = 1";
    const handled = document.createElement("p");
    handled.textContent = "Already claimed";
    document.body.append(button, editor, handled);

    expect(resolveEditContextMenu(contextMenuOn(button))).toBeNull();
    expect(resolveEditContextMenu(contextMenuOn(editor))).toBeNull();

    const event = contextMenuOn(handled);
    event.preventDefault();
    expect(resolveEditContextMenu(event)).toBeNull();
  });

  it("ignores text the user cannot select", () => {
    const paragraph = document.createElement("p");
    paragraph.textContent = "Pinned";
    paragraph.style.userSelect = "none";
    document.body.append(paragraph);

    expect(resolveEditContextMenu(contextMenuOn(paragraph))).toBeNull();
  });
});

describe("runEditContextAction", () => {
  it("cuts a field selection when the browser command is unavailable", () => {
    const input = document.createElement("input");
    input.value = "hello";
    document.body.append(input);
    input.focus();
    input.setSelectionRange(1, 4);
    stubExecCommand(false);
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText, readText: async () => "" },
    });

    const request = resolveEditContextMenu(contextMenuOn(input));
    runEditContextAction("cut", request!);

    expect(writeText).toHaveBeenCalledWith("ell");
    expect(input.value).toBe("ho");
  });

  it("pastes clipboard text into a field when the browser command is unavailable", async () => {
    const input = document.createElement("input");
    input.value = "ab";
    document.body.append(input);
    input.focus();
    input.setSelectionRange(1, 1);
    stubExecCommand(false);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => undefined, readText: async () => "X" },
    });

    const request = resolveEditContextMenu(contextMenuOn(input));
    runEditContextAction("paste", request!);

    await vi.waitFor(() => {
      expect(input.value).toBe("aXb");
    });
  });

  it("delivers fallback paste to the contenteditable handler at the saved selection", async () => {
    vi.stubGlobal(
      "DataTransfer",
      class {
        private data = new Map<string, string>();
        setData(type: string, value: string) {
          this.data.set(type, value);
        }
        getData(type: string) {
          return this.data.get(type) ?? "";
        }
      },
    );
    vi.stubGlobal(
      "ClipboardEvent",
      class extends Event {
        readonly clipboardData: DataTransfer | null;
        constructor(type: string, init: ClipboardEventInit) {
          super(type, init);
          this.clipboardData = init.clipboardData ?? null;
        }
      },
    );
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    editor.textContent = "ab";
    document.body.append(editor);
    const range = document.createRange();
    range.setStart(editor.firstChild!, 1);
    range.collapse(true);
    window.getSelection()?.addRange(range);
    const exec = stubExecCommand(false);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { readText: async () => "X" },
    });
    const paste = vi.fn<(event: Event) => void>((event) => {
      event.preventDefault();
      const current = window.getSelection()!.getRangeAt(0);
      current.deleteContents();
      current.insertNode(
        document.createTextNode((event as ClipboardEvent).clipboardData!.getData("text/plain")),
      );
    });
    editor.addEventListener("paste", paste);
    const request = resolveEditContextMenu(contextMenuOn(editor));
    window.getSelection()?.removeAllRanges();

    runEditContextAction("paste", request!);

    await vi.waitFor(() => expect(editor.textContent).toBe("aXb"));
    expect(paste).toHaveBeenCalledOnce();
    expect(exec).toHaveBeenCalledExactlyOnceWith("paste");
  });

  it("shows a side chat failure instead of leaving a rejected action unhandled", async () => {
    const addSelection = vi
      .spyOn(sideChatActions, "addSelectionToSideChat")
      .mockRejectedValueOnce(new Error("Side chat unavailable"));
    const danger = vi.spyOn(toast, "danger").mockReturnValue("test-toast");
    const pane = document.createElement("div");
    pane.dataset.threadId = "thread-1";
    pane.textContent = "Review";
    document.body.append(pane);
    const range = document.createRange();
    range.selectNodeContents(pane);
    window.getSelection()?.addRange(range);
    const request = resolveEditContextMenu(contextMenuOn(pane));

    runEditContextAction("add-to-side-chat", request!);

    expect(addSelection).toHaveBeenCalledWith("thread-1", "Review");
    await vi.waitFor(() => expect(danger).toHaveBeenCalledWith("Side chat unavailable"));
  });

  it("copies a page selection and opens a link", () => {
    const anchor = document.createElement("a");
    anchor.href = "https://example.com/pr/2220";
    anchor.textContent = "pull request";
    document.body.append(anchor);
    const text = anchor.firstChild;
    if (!(text instanceof Text)) throw new Error("expected a text node");
    const range = document.createRange();
    range.selectNodeContents(text);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    const exec = stubExecCommand(true);

    const request = resolveEditContextMenu(contextMenuOn(anchor));
    runEditContextAction("copy", request!);
    runEditContextAction("select-all", request!);

    expect(exec).toHaveBeenCalledWith("copy");
    expect(window.getSelection()?.toString()).toBe("pull request");
  });
});
