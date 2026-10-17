import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { remoteThreadId } from "@/renderer/state/remoteProjection";
import type { ConversationSearchHit } from "./useConversationSearch";
import {
  openConversationSearchHit,
  isConversationSearchTargetCurrent,
  useConversationSearchTarget,
} from "./conversationSearchNavigation";

const mocks = vi.hoisted(() => ({
  open: vi.fn<typeof import("@/renderer/actions/threadActions").openThread>(),
  standalone: vi.fn<(threadId: string) => void>(),
  apply:
    vi.fn<
      typeof import("@/renderer/state/managedRootCatalog/rootCatalogRows").applyRootCatalogThreadRows
    >(),
  warning: vi.fn<(message: string) => void>(),
  claim: vi.fn<() => () => boolean>(() => () => true),
  suppress: vi.fn<(threadId: string) => void>(),
  bounded: vi.fn<() => Promise<unknown>>(),
  remote: vi.fn<() => Promise<boolean>>(),
  generation: 1,
  activationSeq: 1,
  activationListeners: new Set<() => void>(),
}));
vi.mock("@heroui/react", () => ({ toast: { warning: mocks.warning } }));
vi.mock("@/renderer/actions/threadActions", () => ({
  openThread: mocks.open,
  claimThreadNavigation: mocks.claim,
  suppressAutomaticThreadReopen: mocks.suppress,
}));
vi.mock("@/renderer/actions/workspaceActions", () => ({
  switchWorkspaceForProject: vi.fn<(projectId: string) => void>(),
}));
vi.mock("@/renderer/state/managedRootCatalog/rootCatalogRows", () => ({
  applyRootCatalogThreadRows: mocks.apply,
}));
vi.mock("@/renderer/state/remoteServers/eventSocketRegistry", () => ({
  currentRemoteServerGeneration: () => mocks.generation,
}));
vi.mock("@/renderer/hostTransport/loopbackHttpWsTransport", () => {
  const activation = {
    get seq() {
      return mocks.activationSeq;
    },
    client: { boundedThreadHistory: mocks.bounded },
  };
  return {
    readManagedLoopbackActivation: () => activation,
    subscribeManagedLoopbackActivation: (listener: () => void) => {
      mocks.activationListeners.add(listener);
      return () => mocks.activationListeners.delete(listener);
    },
  };
});
vi.mock("@/renderer/state/remoteServersStore", async () => {
  const { create } = await import("zustand");
  return {
    useRemoteServersStore: create(() => ({ openRemoteThread: mocks.remote, runtime: {} })),
  };
});
vi.mock("@/renderer/state/appStore", async () => {
  const { create } = await import("zustand");
  return {
    useAppStore: create(() => ({
      threads: [],
      view: { kind: "home" },
      pendingActiveThreadId: null,
      openThreadStandalone: mocks.standalone,
    })),
  };
});
function thread(id: string): Thread {
  return {
    id,
    projectId: "project",
    title: "Saved",
    agentKind: "claude",
    config: { model: "default" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: true,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}
function hit(id: string): ConversationSearchHit {
  return {
    threadId: id,
    itemId: "message",
    projectId: "project",
    title: "Saved",
    projectName: "Project",
    archived: true,
    role: "user",
    excerpt: "needle",
    key: id,
    sourceLabel: "",
    source: { kind: "managed", activationSeq: 1 },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.generation = 1;
  mocks.activationSeq = 1;
  useConversationSearchTarget.setState({ target: null });
  useAppStore.setState({ threads: [], view: { kind: "home" }, pendingActiveThreadId: null });
});

describe("saved message navigation", () => {
  it("opens an archived match standalone without relaunching its provider", async () => {
    useAppStore.setState({ threads: [thread("saved")] });
    await openConversationSearchHit(hit("saved"));
    expect(mocks.claim).toHaveBeenCalledOnce();
    expect(mocks.open).toHaveBeenCalledWith("saved", {
      focusComposer: false,
      switchWorkspace: true,
      reopenRuntime: false,
      standalone: true,
    });
    expect(useConversationSearchTarget.getState().target).toEqual({
      threadId: "saved",
      itemId: "message",
      source: { kind: "managed", activationSeq: 1 },
    });
  });

  it("does not steal a pending user navigation while resolving an unopened managed chat", async () => {
    const pending = deferred<unknown>();
    mocks.bounded.mockReturnValueOnce(pending.promise);
    const opening = openConversationSearchHit(hit("old"));
    useAppStore.setState({ pendingActiveThreadId: "user-selected" });
    pending.resolve({ negotiation: "bounded", page: { thread: thread("old") } });
    await opening;
    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(useConversationSearchTarget.getState().target).toBeNull();
  });

  it("retires a handed-off jump when the user navigates away before the pane mounts", async () => {
    useAppStore.setState({ threads: [thread("saved")] });
    await openConversationSearchHit(hit("saved"));
    expect(useConversationSearchTarget.getState().target).not.toBeNull();
    useAppStore.setState({ view: { kind: "draft", projectId: "project" } });
    expect(useConversationSearchTarget.getState().target).toBeNull();
    useAppStore.setState({ view: { kind: "thread", panes: ["saved"] } });
    expect(useConversationSearchTarget.getState().target).toBeNull();
  });

  it("lets the latest remote hit win even when older history finishes later", async () => {
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    mocks.remote.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    useAppStore.setState({
      threads: [thread(remoteThreadId("host", "first")), thread(remoteThreadId("host", "second"))],
    });
    const remoteHit = (id: string): ConversationSearchHit => ({
      ...hit(id),
      source: { kind: "remote", connectionKey: "host", generation: 1 },
    });
    const old = openConversationSearchHit(remoteHit("first"));
    const latest = openConversationSearchHit(remoteHit("second"));
    second.resolve(true);
    await latest;
    first.resolve(true);
    await old;
    expect(mocks.remote).toHaveBeenCalledWith("host", "first", { focus: false });
    expect(mocks.standalone).toHaveBeenCalledExactlyOnceWith(remoteThreadId("host", "second"));
    expect(mocks.suppress).toHaveBeenCalledExactlyOnceWith(remoteThreadId("host", "second"));
    expect(mocks.suppress.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.standalone.mock.invocationCallOrder[0]!,
    );
  });

  it("refuses a result from a replaced remote identity", async () => {
    mocks.generation = 2;
    await openConversationSearchHit({
      ...hit("old"),
      source: { kind: "remote", connectionKey: "host", generation: 1 },
    });
    expect(mocks.remote).not.toHaveBeenCalled();
    expect(mocks.warning).toHaveBeenCalledOnce();
    expect(useConversationSearchTarget.getState().target).toBeNull();
  });

  it("retires a handed-off managed jump when its activation changes", async () => {
    useAppStore.setState({ threads: [thread("saved")] });
    await openConversationSearchHit(hit("saved"));
    expect(mocks.activationListeners.size).toBe(1);
    mocks.activationSeq = 2;
    for (const listener of [...mocks.activationListeners]) listener();
    expect(useConversationSearchTarget.getState().target).toBeNull();
    expect(mocks.activationListeners.size).toBe(0);
  });

  it("fences a handed-off remote jump across re-pairing even when its thread remains", async () => {
    useAppStore.setState({ threads: [thread(remoteThreadId("host", "saved"))] });
    mocks.remote.mockResolvedValueOnce(true);
    await openConversationSearchHit({
      ...hit("saved"),
      source: { kind: "remote", connectionKey: "host", generation: 1 },
    });
    const target = useConversationSearchTarget.getState().target!;
    expect(isConversationSearchTargetCurrent(target)).toBe(true);
    mocks.generation = 2;
    expect(isConversationSearchTargetCurrent(target)).toBe(false);
    useRemoteServersStore.setState({ runtime: {} });
    expect(useConversationSearchTarget.getState().target).toBeNull();
    expect(useAppStore.getState().threads[0]?.id).toBe(remoteThreadId("host", "saved"));
  });
});
