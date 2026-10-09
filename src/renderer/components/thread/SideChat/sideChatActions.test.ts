import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  open: vi.fn<(...args: unknown[]) => Promise<void>>(),
  context: vi.fn<(...args: unknown[]) => Promise<null>>(),
  environment: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => ({ openSideChatPanel: mocks.open }) }));
vi.mock("./sideChatContext", () => ({ readSideChatContext: mocks.context }));
vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: {
    getState: () => ({
      threads: [
        {
          id: "parent",
          presentationMode: "gui",
          title: "Parent",
          config: {},
          remoteServerId: "host",
          remoteId: "parent-host",
        },
      ],
    }),
  },
}));
vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: {
    getState: () => ({
      withClient: (_id: string, invoke: (client: unknown) => Promise<unknown>) =>
        invoke({ environment: mocks.environment }),
    }),
  },
}));
import { openSideChat } from "./sideChatActions";
import { retainAuxiliaryThreadId } from "@/renderer/state/auxiliaryThreadWindows";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue(null);
  mocks.open.mockResolvedValue();
});
describe("hidden context host compatibility", () => {
  it("does not replace a conversation when /btw is invoked inside an auxiliary child", async () => {
    const release = retainAuxiliaryThreadId("parent");
    try {
      await expect(openSideChat("parent", "nested question")).resolves.toBe(false);
      expect(mocks.open).not.toHaveBeenCalled();
      expect(mocks.context).not.toHaveBeenCalled();
    } finally {
      release();
    }
  });
  it("refuses an older host before reading context or opening a window", async () => {
    mocks.environment.mockResolvedValue({ capabilities: {} });
    await expect(openSideChat("parent", "Why?")).rejects.toThrow("Update the remote host");
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it("supports an advertised host and preserves a bare-command empty prompt", async () => {
    mocks.environment.mockResolvedValue({
      capabilities: { conversationSnapshots: { versions: [1] } },
    });
    await expect(openSideChat("parent")).resolves.toBe(true);
    expect(mocks.open).toHaveBeenCalledWith(expect.objectContaining({ prompt: "", context: null }));
  });
  it("does not create duplicate panels while an earlier open is pending", async () => {
    mocks.environment.mockResolvedValue({
      capabilities: { conversationSnapshots: { versions: [1] } },
    });
    let resolveContext!: (value: null) => void;
    mocks.context.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveContext = resolve;
      }),
    );
    const first = openSideChat("parent", "first");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(openSideChat("parent", "next")).resolves.toBe(false);
    resolveContext(null);
    await expect(first).resolves.toBe(true);
    expect(mocks.open).toHaveBeenCalledTimes(1);
    expect(mocks.context).toHaveBeenCalledWith(expect.anything(), 50_000);
  });
});
