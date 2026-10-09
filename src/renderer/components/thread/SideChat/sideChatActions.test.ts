import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  open: vi.fn<(...args: unknown[]) => Promise<void>>(),
  context: vi.fn<(...args: unknown[]) => Promise<null>>(),
  environment: vi.fn<() => Promise<unknown>>(),
  reopen: vi.fn<(tab: string) => void>(),
  entry: null as {
    source: { id: string };
    prompt: string;
    existingThreadId?: string;
  } | null,
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => ({ openSideChatPanel: mocks.open }) }));
vi.mock("./sideChatContext", () => ({ readSideChatContext: mocks.context }));
vi.mock("./sideChatPanelStore", () => ({
  useSideChatPanelStore: { getState: () => ({ entry: mocks.entry }) },
}));
vi.mock("@/renderer/state/panelStore", () => ({
  usePanelStore: { getState: () => ({ setRightPanelTab: mocks.reopen }) },
}));
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
import { openSideChat, showSideChat, sideChatAvailable } from "./sideChatActions";
import { retainAuxiliaryThreadId } from "@/renderer/state/auxiliaryThreadWindows";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue(null);
  mocks.open.mockResolvedValue();
  mocks.entry = null;
  mocks.environment.mockResolvedValue({
    capabilities: { conversationSnapshots: { versions: [1] } },
  });
});
describe("menu reopening", () => {
  it("offers side chat only for GUI presentation outside an auxiliary child", () => {
    expect(sideChatAvailable("parent", "terminal")).toBe(false);
    expect(sideChatAvailable("parent", "gui")).toBe(true);
    const release = retainAuxiliaryThreadId("parent");
    try {
      expect(sideChatAvailable("parent", "gui")).toBe(false);
    } finally {
      release();
    }
  });
  it.each([undefined, "child"])(
    "reopens the same-source entry without replacing its draft or child (%s)",
    async (existingThreadId) => {
      const entry = {
        source: { id: "parent" },
        prompt: "unsent draft",
        ...(existingThreadId ? { existingThreadId } : {}),
      };
      mocks.entry = entry;
      await expect(showSideChat("parent")).resolves.toBe(true);
      expect(mocks.reopen).toHaveBeenCalledWith("sideChat");
      expect(mocks.entry).toBe(entry);
      expect(mocks.open).not.toHaveBeenCalled();
      expect(mocks.context).not.toHaveBeenCalled();
      expect(mocks.environment).not.toHaveBeenCalled();
    },
  );
  it("starts a fresh empty panel for a different source", async () => {
    mocks.entry = { source: { id: "another-parent" }, prompt: "another draft" };
    await expect(showSideChat("parent")).resolves.toBe(true);
    expect(mocks.reopen).not.toHaveBeenCalled();
    expect(mocks.open).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "", autoStart: false }),
    );
  });
  it("keeps bare /btw empty even when a same-source draft is retained", async () => {
    mocks.entry = { source: { id: "parent" }, prompt: "retained draft" };
    await expect(openSideChat("parent")).resolves.toBe(true);
    expect(mocks.reopen).not.toHaveBeenCalled();
    expect(mocks.open).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "", autoStart: false }),
    );
  });
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
