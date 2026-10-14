import { describe, expect, it, vi } from "vitest";
import { DocumentSyncManager } from "./documentSync";
import type { LspIpcTransport } from "./ipcTransport";
import type { editor as MonacoEditor } from "monaco-editor";

function createTransport() {
  const messages: unknown[] = [];
  const transport = {
    sendMessage: vi.fn<(message: unknown) => Promise<unknown>>(async (message) => {
      messages.push(message);
      return undefined;
    }),
  } as unknown as LspIpcTransport;
  return { transport, messages };
}

function createModel(uri: string, initialContent: string) {
  let content = initialContent;
  let disposed = false;
  const changes = new Set<() => void>();
  const disposals = new Set<() => void>();
  const changeCallbacks: (() => void)[] = [];
  const disposalCallbacks: (() => void)[] = [];
  const subscriptions: { dispose: ReturnType<typeof vi.fn<() => void>> }[] = [];
  function subscribe(listeners: Set<() => void>, callbacks: (() => void)[], callback: () => void) {
    listeners.add(callback);
    callbacks.push(callback);
    const subscription = {
      dispose: vi.fn<() => void>(() => {
        listeners.delete(callback);
      }),
    };
    subscriptions.push(subscription);
    return subscription;
  }
  const getValue = vi.fn<() => string>(() => {
    if (disposed) throw new Error("Disposed model read");
    return content;
  });
  const model = {
    uri: { toString: () => uri },
    isDisposed: () => disposed,
    getValue,
    onDidChangeContent: (callback: () => void) => subscribe(changes, changeCallbacks, callback),
    onWillDispose: (callback: () => void) => subscribe(disposals, disposalCallbacks, callback),
  } as unknown as MonacoEditor.ITextModel;
  return {
    model,
    getValue,
    subscriptions,
    change(nextContent: string) {
      content = nextContent;
      for (const callback of [...changes]) callback();
    },
    disposeModel() {
      for (const callback of [...disposals]) callback();
      disposed = true;
      changes.clear();
      disposals.clear();
    },
    lateChange() {
      for (const callback of changeCallbacks) callback();
    },
    lateDisposal() {
      for (const callback of disposalCallbacks) callback();
    },
    listenerCount: () => changes.size + disposals.size,
  };
}

describe("DocumentSyncManager", () => {
  it("uses React-flavored TypeScript language IDs for TSX documents", () => {
    const { transport, messages } = createTransport();
    const sync = new DocumentSyncManager(transport);

    sync.didOpen("file:///repo/src/App.tsx", "export function App() {}", "src/App.tsx");

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      method: "textDocument/didOpen",
      params: {
        textDocument: {
          uri: "file:///repo/src/App.tsx",
          languageId: "typescriptreact",
        },
      },
    });
  });

  it("forwards changes from a recreated model at the same URI through the existing API", () => {
    const { transport, messages } = createTransport();
    const sync = new DocumentSyncManager(transport);
    const uri = "file:///repo/src/example.ts";
    const first = createModel(uri, "first");
    sync.didOpen(uri, "first", "src/example.ts");
    sync.watchModel(first.model);
    first.change("first edited");
    first.disposeModel();

    const replacement = createModel(uri, "replacement");
    sync.didOpen(uri, "replacement", "src/example.ts");
    sync.watchModel(replacement.model);
    replacement.change("replacement edited");

    expect(messages.at(-1)).toMatchObject({
      method: "textDocument/didChange",
      params: {
        textDocument: { uri, version: 2 },
        contentChanges: [{ text: "replacement edited" }],
      },
    });
    expect(messages).toMatchObject([
      {
        method: "textDocument/didOpen",
        params: { textDocument: { uri, version: 1, text: "first" } },
      },
      { method: "textDocument/didChange" },
      { method: "textDocument/didClose", params: { textDocument: { uri } } },
      {
        method: "textDocument/didOpen",
        params: { textDocument: { uri, version: 1, text: "replacement" } },
      },
      { method: "textDocument/didChange" },
    ]);
    expect(first.subscriptions).toHaveLength(2);
    for (const subscription of first.subscriptions)
      expect(subscription.dispose).toHaveBeenCalledOnce();
  });

  it("shares one live binding and preserves versions without rereading on repeated binds", () => {
    const { transport, messages } = createTransport();
    const sync = new DocumentSyncManager(transport);
    const uri = "file:///repo/src/shared.tsx";
    const shared = createModel(uri, "export const initial = '😀';");

    sync.bindModel(shared.model, "src/shared.tsx");
    shared.change("export const changed = '😀';");
    sync.bindModel(shared.model, "src/shared.tsx");
    sync.watchModel(shared.model);
    sync.didOpen(uri, "stale buffer", "src/shared.tsx");
    shared.change("export const final = '𐐀';");
    sync.didSave(uri, "saved full text");

    expect(shared.listenerCount()).toBe(2);
    expect(shared.getValue).toHaveBeenCalledTimes(3);
    expect(messages).toEqual([
      {
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: {
          textDocument: {
            uri,
            languageId: "typescriptreact",
            version: 1,
            text: "export const initial = '😀';",
          },
        },
      },
      {
        jsonrpc: "2.0",
        method: "textDocument/didChange",
        params: {
          textDocument: { uri, version: 2 },
          contentChanges: [{ text: "export const changed = '😀';" }],
        },
      },
      {
        jsonrpc: "2.0",
        method: "textDocument/didChange",
        params: {
          textDocument: { uri, version: 3 },
          contentChanges: [{ text: "export const final = '𐐀';" }],
        },
      },
      {
        jsonrpc: "2.0",
        method: "textDocument/didSave",
        params: { textDocument: { uri }, text: "saved full text" },
      },
    ]);

    shared.disposeModel();
    shared.lateDisposal();
    sync.didClose(uri);
    sync.didSave(uri, "after close");
    expect(messages).toHaveLength(5);
    expect(messages[4]).toEqual({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri } },
    });
    expect(shared.listenerCount()).toBe(0);
  });

  it("retires a replaced owner while late callbacks cannot erase it or an unrelated URI", () => {
    const { transport, messages } = createTransport();
    const sync = new DocumentSyncManager(transport);
    const uri = "file:///repo/src/replaced.ts";
    const otherUri = "file:///repo/src/other.ts";
    const first = createModel(uri, "old");
    const replacement = createModel(uri, "new\r\n😀");
    const other = createModel(otherUri, "other");
    sync.bindModel(first.model, "src/replaced.ts");
    sync.bindModel(other.model, "src/other.ts");
    first.change("old edited");
    sync.bindModel(replacement.model, "src/replaced.ts");
    const beforeLateCallbacks = messages.length;

    first.lateChange();
    first.lateDisposal();
    expect(messages).toHaveLength(beforeLateCallbacks);
    expect(first.listenerCount()).toBe(0);
    expect(first.getValue).toHaveBeenCalledTimes(2);
    expect(first.model.isDisposed()).toBe(false);
    for (const subscription of first.subscriptions)
      expect(subscription.dispose).toHaveBeenCalledOnce();
    replacement.change("new edited\r\n😀");
    other.change("other edited");

    expect(messages.slice(3)).toMatchObject([
      { method: "textDocument/didClose", params: { textDocument: { uri } } },
      {
        method: "textDocument/didOpen",
        params: { textDocument: { uri, version: 1, text: "new\r\n😀" } },
      },
      {
        method: "textDocument/didChange",
        params: {
          textDocument: { uri, version: 2 },
          contentChanges: [{ text: "new edited\r\n😀" }],
        },
      },
      {
        method: "textDocument/didChange",
        params: {
          textDocument: { uri: otherUri, version: 2 },
          contentChanges: [{ text: "other edited" }],
        },
      },
    ]);
    expect(replacement.listenerCount()).toBe(2);
    expect(other.listenerCount()).toBe(2);
  });

  it("also replaces the existing watchModel API using the original language and actual text", () => {
    const { transport, messages } = createTransport();
    const sync = new DocumentSyncManager(transport);
    const uri = "file:///repo/src/example.jsx";
    const first = createModel(uri, "first");
    const replacement = createModel(uri, "replacement");
    sync.didOpen(uri, "first", "src/example.jsx");
    sync.watchModel(first.model);
    sync.watchModel(replacement.model);
    first.lateChange();
    first.lateDisposal();
    replacement.change("new edit");

    expect(messages).toMatchObject([
      {
        method: "textDocument/didOpen",
        params: { textDocument: { uri, languageId: "javascriptreact" } },
      },
      { method: "textDocument/didClose", params: { textDocument: { uri } } },
      {
        method: "textDocument/didOpen",
        params: {
          textDocument: { uri, languageId: "javascriptreact", version: 1, text: "replacement" },
        },
      },
      {
        method: "textDocument/didChange",
        params: { textDocument: { uri, version: 2 }, contentChanges: [{ text: "new edit" }] },
      },
    ]);
  });

  it("ignores disposed admission without reading it or retiring the valid owner", () => {
    const { transport, messages } = createTransport();
    const sync = new DocumentSyncManager(transport);
    const uri = "file:///repo/src/example.ts";
    const live = createModel(uri, "live");
    const disposed = createModel(uri, "disposed");
    disposed.disposeModel();
    sync.bindModel(disposed.model, "src/example.ts");
    sync.watchModel(disposed.model);
    expect(messages).toHaveLength(0);
    sync.bindModel(live.model, "src/example.ts");
    sync.bindModel(disposed.model, "src/example.ts");
    sync.watchModel(disposed.model);
    live.change("still live");

    expect(disposed.getValue).not.toHaveBeenCalled();
    expect(disposed.subscriptions).toHaveLength(0);
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      method: "textDocument/didChange",
      params: { textDocument: { uri, version: 2 }, contentChanges: [{ text: "still live" }] },
    });
  });

  it("manager disposal releases every owned subscription without disposing shared models", () => {
    const { transport, messages } = createTransport();
    const sync = new DocumentSyncManager(transport);
    const first = createModel("file:///repo/a.ts", "a");
    const second = createModel("file:///repo/b.ts", "b");
    sync.bindModel(first.model, "a.ts");
    sync.bindModel(second.model, "b.ts");
    sync.dispose();
    sync.dispose();

    for (const owner of [first, second]) {
      expect(owner.listenerCount()).toBe(0);
      expect(owner.model.isDisposed()).toBe(false);
      for (const subscription of owner.subscriptions)
        expect(subscription.dispose).toHaveBeenCalledOnce();
      owner.lateChange();
      owner.lateDisposal();
      sync.didSave(owner.model.uri.toString(), "stale save");
      sync.didClose(owner.model.uri.toString());
    }
    expect(messages).toHaveLength(2);

    sync.bindModel(first.model, "a.ts");
    first.change("a reopened");
    expect(messages.slice(2)).toMatchObject([
      { method: "textDocument/didOpen", params: { textDocument: { version: 1, text: "a" } } },
      {
        method: "textDocument/didChange",
        params: { textDocument: { version: 2 }, contentChanges: [{ text: "a reopened" }] },
      },
    ]);
  });

  it("explicit repeated close releases a compatibility watcher even if it was not opened", () => {
    const { transport, messages } = createTransport();
    const sync = new DocumentSyncManager(transport);
    const uri = "file:///repo/watched.ts";
    const watched = createModel(uri, "watched");
    sync.watchModel(watched.model);
    sync.didClose(uri);
    sync.didClose(uri);
    watched.lateChange();
    watched.lateDisposal();

    expect(messages).toHaveLength(0);
    expect(watched.listenerCount()).toBe(0);
    for (const subscription of watched.subscriptions)
      expect(subscription.dispose).toHaveBeenCalledOnce();
  });
});
