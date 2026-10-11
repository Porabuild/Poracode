import type { editor as MonacoEditor } from "monaco-editor";
import type { LspIpcTransport } from "./ipcTransport";
import { getLanguageFromPath } from "../views/FileEditorOverlay/parts/FileEditorPane/FileEditorPane";

type IDisposable = { dispose(): void };

interface ModelBinding {
  model: MonacoEditor.ITextModel;
  nextVersion: number;
  changeListener?: IDisposable;
  disposalListener?: IDisposable;
}

function getLspDocumentLanguageId(filePath: string): string {
  const fileName = filePath.split("/").pop()?.toLowerCase() ?? "";
  const ext = fileName.split(".").pop() ?? "";
  switch (ext) {
    case "tsx":
      return "typescriptreact";
    case "jsx":
      return "javascriptreact";
    default:
      return getLanguageFromPath(filePath);
  }
}

/**
 * Manages LSP document synchronization — sends didOpen, didChange, didClose,
 * didSave notifications to the language server.
 */
export class DocumentSyncManager {
  private suspended = false;
  private pendingSaves = new Map<string, string>();
  private openDocuments = new Map<string, string>();
  private modelBindings = new Map<string, ModelBinding>();

  constructor(private readonly transport: LspIpcTransport) {}

  /** Notify the server that a document was opened. */
  didOpen(uri: string, content: string, filePath: string): void {
    if (this.openDocuments.has(uri)) return;
    this.openDocument(uri, content, getLspDocumentLanguageId(filePath));
  }

  private openDocument(uri: string, content: string, languageId: string): void {
    if (this.openDocuments.has(uri)) return;
    this.openDocuments.set(uri, languageId);
    if (this.suspended) return;

    void this.transport.sendMessage({
      jsonrpc: "2.0",
      method: "textDocument/didOpen",
      params: {
        textDocument: {
          uri,
          languageId,
          version: 1,
          text: content,
        },
      },
    });
  }

  /** Bind the actual live model, shared by all editors using that model. */
  bindModel(model: MonacoEditor.ITextModel, filePath: string): void {
    if (model.isDisposed()) return;
    const uri = model.uri.toString();
    if (this.modelBindings.get(uri)?.model === model) {
      if (!this.openDocuments.has(uri)) this.didOpen(uri, model.getValue(), filePath);
      return;
    }

    this.didClose(uri);
    this.didOpen(uri, model.getValue(), filePath);
    this.watchModel(model);
  }

  /** Subscribe to model content changes and forward them as didChange. */
  watchModel(model: MonacoEditor.ITextModel): void {
    if (model.isDisposed()) return;
    const uri = model.uri.toString();
    const current = this.modelBindings.get(uri);
    if (current?.model === model) return;

    if (current) {
      const languageId = this.openDocuments.get(uri);
      this.didClose(uri);
      if (languageId !== undefined) this.openDocument(uri, model.getValue(), languageId);
    }

    const binding: ModelBinding = { model, nextVersion: 2 };
    this.modelBindings.set(uri, binding);
    binding.changeListener = model.onDidChangeContent(() => {
      if (this.modelBindings.get(uri) !== binding || model.isDisposed() || this.suspended) return;
      void this.transport.sendMessage({
        jsonrpc: "2.0",
        method: "textDocument/didChange",
        params: {
          textDocument: { uri, version: binding.nextVersion++ },
          contentChanges: [{ text: model.getValue() }],
        },
      });
    });
    binding.disposalListener = model.onWillDispose(() => {
      if (this.modelBindings.get(uri) === binding) this.didClose(uri);
    });
  }

  /** Notify the server that a document was saved. */
  didSave(uri: string, content: string): void {
    if (!this.openDocuments.has(uri)) return;
    if (this.suspended) {
      if (this.modelBindings.has(uri)) this.pendingSaves.set(uri, content);
      return;
    }
    void this.transport.sendMessage({
      jsonrpc: "2.0",
      method: "textDocument/didSave",
      params: {
        textDocument: { uri },
        text: content,
      },
    });
  }

  /** Notify the server that a document was closed. */
  didClose(uri: string): void {
    this.pendingSaves.delete(uri);
    const wasOpen = this.openDocuments.delete(uri);
    this.releaseBinding(uri);
    if (!wasOpen || this.suspended) return;

    void this.transport.sendMessage({
      jsonrpc: "2.0",
      method: "textDocument/didClose",
      params: { textDocument: { uri } },
    });
  }

  private releaseBinding(uri: string): void {
    const binding = this.modelBindings.get(uri);
    if (!binding) return;
    this.modelBindings.delete(uri);
    binding.changeListener?.dispose();
    binding.disposalListener?.dispose();
  }

  /** A new server must receive current full text, not queued old change versions. */
  suspend(): void {
    this.suspended = true;
  }

  resume(): void {
    if (!this.suspended) return;
    this.suspended = false;
    const languages = new Map(this.openDocuments);
    this.openDocuments.clear();
    for (const [uri, binding] of this.modelBindings) {
      const languageId = languages.get(uri);
      if (languageId === undefined || binding.model.isDisposed()) continue;
      binding.nextVersion = 2;
      this.openDocument(uri, binding.model.getValue(), languageId);
    }
    const saves = this.pendingSaves;
    this.pendingSaves = new Map();
    for (const [uri, content] of saves) this.didSave(uri, content);
  }

  dispose(): void {
    for (const uri of this.modelBindings.keys()) this.releaseBinding(uri);
    this.openDocuments.clear();
    this.pendingSaves.clear();
    this.suspended = false;
  }
}
