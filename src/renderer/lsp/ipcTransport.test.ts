import { beforeEach, expect, it, vi } from "vitest";
import type { PoracodeBridge, SupervisorEvent } from "@/shared/ipc";
import { LspIpcTransport } from "./ipcTransport";
const bridge = vi.hoisted(() => ({
  onSupervisorEvent: vi.fn<PoracodeBridge["onSupervisorEvent"]>(),
  lspSendMessage: vi.fn<PoracodeBridge["lspSendMessage"]>(),
}));
vi.mock("../bridge", () => ({ readBridge: () => bridge }));
let listener: (event: SupervisorEvent) => void;
const unsubscribe = vi.fn<() => void>();
beforeEach(() => {
  vi.clearAllMocks();
  bridge.onSupervisorEvent.mockImplementation((fn) => {
    listener = fn;
    return unsubscribe;
  });
});
it("releases once and rejects late callbacks/new sends after retirement", async () => {
  const t = new LspIpcTransport("owned"),
    message = vi.fn<(value: unknown) => void>(),
    status = vi.fn<(value: string) => void>();
  t.onMessage(message);
  t.onStatus(status);
  t.dispose();
  t.dispose();
  t.onMessage(message);
  listener({ type: "lsp-message", sessionId: "owned", message: { late: true } });
  await t.sendMessage({ method: "textDocument/didOpen" });
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(message).not.toHaveBeenCalled();
  expect(bridge.lspSendMessage).not.toHaveBeenCalled();
  expect(t.isDisposed()).toBe(true);
});
it("discards an in-flight reply after disposal while preserving live errors", async () => {
  let resolve!: (value: unknown) => void;
  bridge.lspSendMessage.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const t = new LspIpcTransport("owned");
  const reply = t.sendMessage({ id: 1, method: "textDocument/completion" });
  t.dispose();
  resolve({ items: [{ label: "stale" }] });
  await expect(reply).resolves.toBeUndefined();
  const live = new LspIpcTransport("live");
  bridge.lspSendMessage.mockRejectedValueOnce(new Error("live failure"));
  await expect(live.sendMessage({ id: 2, method: "textDocument/hover" })).rejects.toThrow(
    "live failure",
  );
  live.dispose();
});
