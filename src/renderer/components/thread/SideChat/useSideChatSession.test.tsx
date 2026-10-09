import { I18nProvider } from "@lingui/react";
import { i18n } from "@/renderer/i18n/i18n";
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { SideChatBootstrap } from "@/shared/ipc/sideChat";
import { setAuxiliaryThreadIds } from "@/renderer/state/auxiliaryThreadWindows";
const mocks = vi.hoisted(() => ({
  launch: vi.fn<(...args: unknown[]) => Promise<void>>(),
  create: vi.fn<() => unknown>(),
  bind: vi.fn<(...args: unknown[]) => Promise<void>>(),
  threads: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: {
    getState: () => ({
      threads: mocks.threads,
      createThread: mocks.create,
      deleteThread: vi.fn<() => void>(),
      openThread: vi.fn<() => void>(),
    }),
  },
}));
vi.mock("@/renderer/state/useThread", () => ({
  useProject: () => ({ id: "project", remoteServerId: "host", remoteId: "host-project" }),
  useThread: () => undefined,
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    bindSideChatThread: mocks.bind,
    getSideChatThreadIds: async () => ["child"],
  }),
}));
vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: { getState: () => ({ launchRemoteThread: mocks.launch }) },
}));
vi.mock("@/renderer/actions/threadLaunchActions", () => ({
  performInitialThreadLaunch: vi.fn<() => void>(),
  markThreadLaunchFailed: vi.fn<() => void>(),
}));
vi.mock("@/renderer/actions/threadActions", () => ({
  openThread: vi.fn<() => void>(),
  reopenStoredThread: vi.fn<() => void>(),
  unloadStoredThread: vi.fn<() => void>(),
}));
vi.mock("@/renderer/state/chatRuntimePersister", () => ({
  hydrateThreadRuntimeItems: vi.fn<() => void>(),
}));
vi.mock("./sideChatPanelStore", () => ({ updateSideChatPanelDraft: vi.fn<() => void>() }));
import { useSideChatSession } from "./useSideChatSession";
import { useSideChatLaunchState } from "./sideChatLaunchState";
function wrapper({ children }: { children: ReactNode }) {
  return <I18nProvider i18n={i18n}>{children}</I18nProvider>;
}
const entry = {
  id: "entry",
  title: "Side chat",
  prompt: "",
  context: null,
  source: {
    id: "parent",
    projectId: "project",
    agentKind: "neutral-gui",
    config: {},
    title: "Parent",
    remoteServerId: "host",
    remoteId: "host-parent",
  },
} as SideChatBootstrap;
beforeEach(() => {
  vi.clearAllMocks();
  setAuxiliaryThreadIds([]);
  useSideChatLaunchState.setState({ threadIds: new Set() });
  mocks.threads = [];
  mocks.bind.mockResolvedValue();
  mocks.create.mockImplementation(() => {
    const row = {
      id: "child",
      projectId: "project",
      agentKind: "neutral-gui",
      config: {},
      title: "Side chat",
      remoteServerId: "host",
      remoteId: "host-child",
    };
    mocks.threads.push(row);
    return row;
  });
});
it("keeps a hidden panel's pending remote launch owned and prevents remount from duplicating it", async () => {
  let finish!: () => void;
  mocks.launch.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const first = renderHook(() => useSideChatSession(entry, "panel"), { wrapper });
  let pending!: Promise<void>;
  await act(async () => {
    pending = first.result.current.start("question");
    await Promise.resolve();
  });
  expect(mocks.launch).toHaveBeenCalledTimes(1);
  const options = mocks.launch.mock.calls[0]?.[1] as { isPendingLaunchOwned: () => boolean };
  setAuxiliaryThreadIds(["child"]);
  first.unmount();
  expect(options.isPendingLaunchOwned()).toBe(true);
  const restored = renderHook(
    () => useSideChatSession({ ...entry, existingThreadId: "child", prompt: "question" }, "panel"),
    { wrapper },
  );
  expect(restored.result.current.busy).toBe(true);
  await act(async () => {
    await restored.result.current.start("question");
  });
  expect(mocks.launch).toHaveBeenCalledTimes(1);
  expect(mocks.create).toHaveBeenCalledTimes(1);
  setAuxiliaryThreadIds([]);
  expect(options.isPendingLaunchOwned()).toBe(false);
  await act(async () => {
    finish();
    await pending;
  });
  expect(restored.result.current.busy).toBe(false);
  restored.unmount();
});

it("never submits typed draft updates or restored unsent text automatically", () => {
  const hook = renderHook(({ entry: inputEntry }) => useSideChatSession(inputEntry, "panel"), {
    wrapper,
    initialProps: { entry },
  });
  act(() => {
    hook.result.current.setPrompt("typed question");
  });
  hook.rerender({ entry: { ...entry, prompt: "typed question" } });
  expect(mocks.launch).not.toHaveBeenCalled();
  hook.unmount();
  const restored = renderHook(
    () => useSideChatSession({ ...entry, prompt: "typed question", autoStart: false }, "panel"),
    { wrapper },
  );
  expect(mocks.launch).not.toHaveBeenCalled();
  restored.unmount();
});
