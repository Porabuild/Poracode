import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { PersistedRuntimeItem } from "@/shared/ipc";

const harness = vi.hoisted(() => ({
  read: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  activation: {} as unknown,
}));
vi.mock("@/renderer/state/managedRootCatalog/rootHistory", () => ({
  managedRootHistoryActivation: () => harness.activation,
}));
vi.mock("@/renderer/state/remoteProjection", () => ({ remoteOwner: () => null }));
vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: { getState: () => ({}) },
}));
import { formatSideChatContextItem, readSideChatContext } from "./sideChatContext";

const thread = { id: "parent", agentKind: "neutral-gui", config: { model: "default" } } as Thread;
const user = (id: string, text: string): PersistedRuntimeItem => ({
  id,
  type: "user_message",
  state: "completed",
  payload: { content: [{ kind: "text", text }] },
  streams: {},
});
const page = (items: PersistedRuntimeItem[], nextCursor: number | null) => ({
  negotiation: "bounded",
  page: { items, nextCursor, reads: "bounded-v1" },
});
beforeEach(() => {
  harness.read.mockReset();
  harness.activation = { client: { boundedThreadHistoryItems: harness.read } };
});

describe("independent side chat snapshot", () => {
  it("walks authoritative history and preserves the original request beyond the visible tail", async () => {
    harness.read
      .mockResolvedValueOnce(page([user("recent", "recent question")], 5))
      .mockResolvedValueOnce(page([user("original", "original marker-42")], null));
    const result = await readSideChatContext(thread, 50_000);
    expect(result?.summary).toContain("original marker-42");
    expect(result?.summary.indexOf("original marker-42")).toBeLessThan(
      result!.summary.indexOf("recent question"),
    );
    expect(harness.read.mock.calls[0]![0]).not.toHaveProperty("beforePosition");
    expect(harness.read.mock.calls[1]![0]).toMatchObject({
      beforePosition: 5,
      after: { reads: "bounded-v1" },
    });
    expect(harness.read.mock.calls[0]![0]).not.toHaveProperty("noticesCapable");
  });
  it("keeps failed tool output and recent rows under a bounded budget", async () => {
    harness.read.mockResolvedValueOnce(
      page(
        [
          user("original", "original ask"),
          ...Array.from({ length: 20 }, (_, index) => user(`long-${index}`, "x".repeat(2_000))),
          {
            id: "failed",
            type: "command_execution",
            state: "completed",
            payload: { command: "pnpm build", exitCode: 1, status: "failed" },
            streams: { command_output: "error: missing module" },
          },
        ],
        null,
      ),
    );
    const result = await readSideChatContext(thread, 10_000);
    expect(result?.summary).toContain("original ask");
    expect(result?.summary).toContain("error: missing module");
    expect(result?.summary).toContain("exit 1");
    expect(result?.summary).toContain("[earlier turns omitted]");
    expect(result!.summary.length).toBeLessThanOrEqual(10_000);
  });
  it("refuses a broken cursor or lost connection rather than claiming complete context", async () => {
    harness.read.mockResolvedValue(page([user("one", "ask")], 5));
    await expect(readSideChatContext(thread, 50_000)).rejects.toThrow("cursor");
    harness.read.mockImplementation(async () => {
      harness.activation = null;
      return page([], null);
    });
    await expect(readSideChatContext(thread, 50_000)).rejects.toThrow("connection changed");
  });
  it("includes normalized tool results without large images or ANSI control sequences", () => {
    const text = formatSideChatContextItem({
      id: "tool",
      type: "tool_call",
      state: "completed",
      payload: {
        name: "read_file",
        status: "failed",
        args: { path: "missing.txt" },
        result: "\u001b[31mnot found\u001b[0m",
        images: ["data:large-image"],
      },
      streams: {},
    });
    expect(text).toContain("read_file");
    expect(text).toContain("not found");
    expect(text).not.toContain("data:large-image");
    expect(text).not.toContain("\u001b");
  });
});
