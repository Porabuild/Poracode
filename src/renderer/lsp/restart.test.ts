import { expect, it, vi } from "vitest";
import type { Monaco } from "@monaco-editor/react";
import type { editor as Editor } from "monaco-editor";
import type { PoracodeBridge, SupervisorEvent } from "@/shared/ipc";
import { LspOrchestrator } from "./index";
const bridge = vi.hoisted(() => ({
  lspStart: vi.fn<PoracodeBridge["lspStart"]>().mockResolvedValue(undefined),
  lspStop: vi.fn<PoracodeBridge["lspStop"]>().mockResolvedValue(undefined),
  lspSendMessage: vi.fn<PoracodeBridge["lspSendMessage"]>().mockResolvedValue(undefined),
  onSupervisorEvent: vi.fn<PoracodeBridge["onSupervisorEvent"]>(),
}));
vi.mock("../bridge", () => ({ readBridge: () => bridge }));
vi.mock("./monacoProviders", () => ({ registerLspProviders: () => [] }));
it("replays the latest unsaved model and last saved text after server restart", async () => {
  const listeners = new Set<(event: SupervisorEvent) => void>();
  bridge.onSupervisorEvent.mockImplementation((fn) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  });
  const o = new LspOrchestrator(),
    monaco = { Uri: { parse: (s: string) => ({ toString: () => s }) } } as unknown as Monaco;
  const session = await o.ensureServer(monaco, "owned", { kind: "posix", path: "/repo" }, "a.ts");
  expect(session).not.toBeNull();
  let text = "initial α😀";
  const changes = new Set<() => void>();
  const model = {
    uri: { toString: () => "file:///repo/a.ts" },
    isDisposed: () => false,
    getValue: () => text,
    onDidChangeContent: (fn: () => void) => {
      changes.add(fn);
      return {
        dispose: () => {
          changes.delete(fn);
        },
      };
    },
    onWillDispose: () => ({ dispose: () => {} }),
  } as unknown as Editor.ITextModel;
  session!.docSync.bindModel(model, "a.ts");
  const status = (value: "starting" | "ready") => {
    for (const fn of [...listeners])
      fn({
        type: "lsp-status",
        sessionId: "owned:typescript",
        languageId: "typescript",
        status: value,
      });
  };
  status("starting");
  text = "saved during restart α😀";
  for (const fn of changes) fn();
  session!.docSync.didSave(model.uri.toString(), text);
  text = "newer unsaved content 😀";
  for (const fn of changes) fn();
  bridge.lspSendMessage.mockClear();
  status("ready");
  await Promise.resolve();
  const replay = bridge.lspSendMessage.mock.calls.map(([p]) => p.message);
  o.dispose();
  expect(replay).toMatchObject([
    {
      method: "textDocument/didOpen",
      params: { textDocument: { version: 1, text: "newer unsaved content 😀" } },
    },
    { method: "textDocument/didSave", params: { text: "saved during restart α😀" } },
  ]);
  expect(changes.size).toBe(0);
});
