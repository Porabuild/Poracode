// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
const mocks = vi.hoisted(() => ({
  threads: [] as Thread[],
  read: vi.fn<(...args: unknown[]) => Promise<{ summary: string } | null>>(),
}));
vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: { getState: () => ({ threads: mocks.threads }) },
}));
vi.mock("./sideChatContext", () => ({ readSideChatContext: mocks.read }));
import { captureSideChatTurnContext } from "./sideChatTurnContext";
const original = { id: "parent", config: { model: "a" } } as Thread;
beforeEach(() => {
  mocks.threads = [original];
  mocks.read.mockReset();
});
it("reads a fresh parent snapshot for every message rather than reusing the opening context", async () => {
  mocks.read
    .mockResolvedValueOnce({ summary: "first answer" })
    .mockResolvedValueOnce({ summary: "new main-chat answer" });
  expect(await captureSideChatTurnContext(original)).toEqual({
    conversationSnapshot: { text: "first answer" },
  });
  const latest = { ...original, config: { model: "b", contextSize: "200k" } };
  mocks.threads = [latest];
  expect(await captureSideChatTurnContext(original)).toEqual({
    conversationSnapshot: { text: "new main-chat answer" },
  });
  expect(mocks.read).toHaveBeenCalledTimes(2);
  expect(mocks.read.mock.calls[1]?.[0]).toBe(latest);
});
it("refuses the send when the latest snapshot cannot be read", async () => {
  mocks.read.mockRejectedValue(new Error("host disconnected"));
  await expect(captureSideChatTurnContext(original)).rejects.toThrow(
    "Could not read the thread context for side chat",
  );
});
