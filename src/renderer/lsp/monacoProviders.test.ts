import { expect, it, vi } from "vitest";
import type { Monaco } from "@monaco-editor/react";
import type { editor as Editor, languages, CancellationToken, Position } from "monaco-editor";
import type { LspIpcTransport } from "./ipcTransport";
import { registerLspProviders } from "./monacoProviders";
function fixture() {
  let completion!: languages.CompletionItemProvider,
    disposed = false;
  const release = vi.fn<() => void>();
  const monaco = {
    languages: {
      CompletionItemKind: { Text: 0 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      registerCompletionItemProvider: (_lang: string, p: languages.CompletionItemProvider) => {
        completion = p;
        return { dispose: release };
      },
      registerHoverProvider: () => ({ dispose: release }),
      registerDefinitionProvider: () => ({ dispose: release }),
      registerSignatureHelpProvider: () => ({ dispose: release }),
    },
    Range: class {
      constructor(
        readonly startLineNumber: number,
        readonly startColumn: number,
        readonly endLineNumber: number,
        readonly endColumn: number,
      ) {}
    },
  } as unknown as Monaco;
  const word = vi.fn<() => { startColumn: number; endColumn: number }>(() => {
    if (disposed) throw Error("disposed model access");
    return { startColumn: 1, endColumn: 2 };
  });
  const model = {
    uri: { toString: () => "file:///repo/a.ts" },
    isDisposed: () => disposed,
    getWordUntilPosition: word,
  } as unknown as Editor.ITextModel;
  let reply!: (value: unknown) => void;
  const sendMessage = vi.fn<(message: unknown) => Promise<unknown>>(
    () =>
      new Promise((r) => {
        reply = r;
      }),
  );
  const transport = {
    sendMessage,
    isDisposed: () => false,
    onMessage: () => {},
  } as unknown as LspIpcTransport;
  const bindings = registerLspProviders(monaco, transport, ["typescript"], "file:///repo");
  const token = {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose: () => {} }),
  } as CancellationToken;
  return {
    completion,
    model,
    word,
    token,
    bindings,
    sendMessage,
    reply: (value: unknown) => reply(value),
    disposeModel: () => {
      disposed = true;
    },
  };
}
it("discards completion after model disposal before accessing words", async () => {
  const f = fixture();
  const result = f.completion.provideCompletionItems(
    f.model,
    { lineNumber: 1, column: 1 } as Position,
    { triggerKind: 0 },
    f.token,
  );
  f.disposeModel();
  f.reply([{ label: "late", kind: 1 }]);
  await expect(result).resolves.toEqual({ suggestions: [] });
  expect(f.word).not.toHaveBeenCalled();
  for (const b of f.bindings) b.dispose();
});
it("keeps live completion mapping but rejects cancellation and retired registration", async () => {
  const f = fixture();
  const result = f.completion.provideCompletionItems(
    f.model,
    { lineNumber: 1, column: 1 } as Position,
    { triggerKind: 0 },
    f.token,
  );
  f.reply([{ label: "live", kind: 1 }]);
  expect((await result)?.suggestions[0]?.label).toBe("live");
  expect(f.word).toHaveBeenCalledOnce();
  for (const b of f.bindings) b.dispose();
  await expect(
    f.completion.provideCompletionItems(
      f.model,
      { lineNumber: 1, column: 1 } as Position,
      { triggerKind: 0 },
      f.token,
    ),
  ).resolves.toEqual({ suggestions: [] });
  expect(f.sendMessage).toHaveBeenCalledOnce();
});

it("releases earlier registrations when a later registration throws", () => {
  const dispose = vi.fn<() => void>();
  const monaco = {
    languages: {
      registerCompletionItemProvider: () => ({ dispose }),
      registerHoverProvider: () => {
        throw new Error("registration failed");
      },
    },
  } as unknown as Monaco;
  expect(() =>
    registerLspProviders(monaco, {} as LspIpcTransport, ["typescript"], "file:///repo"),
  ).toThrow("registration failed");
  expect(dispose).toHaveBeenCalledOnce();
});
