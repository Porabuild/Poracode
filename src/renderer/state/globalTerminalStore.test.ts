import { beforeEach, expect, it, vi } from "vitest";
import type { CloseThreadPayload, ProjectLocation, StartShellPayload } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";

const bridge = vi.hoisted(() => ({
  getHomeScopeLocation: vi.fn<() => Promise<ProjectLocation>>(),
  startShell: vi.fn<(payload: StartShellPayload) => Promise<void>>(),
  closeThread: vi.fn<(payload: CloseThreadPayload) => Promise<void>>(),
  onSupervisorEvent: vi.fn<(listener: (event: SupervisorEvent) => void) => () => void>(),
}));

vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));
vi.mock("@heroui/react", () => ({ toast: { danger: vi.fn<(message: string) => void>() } }));
vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  waitForPendingSharedSettings: () => Promise.resolve(),
}));

import { forgetShellLaunch, wasShellLaunched } from "@/renderer/utils/shellStartRegistry";
import { useGlobalTerminalStore } from "./globalTerminalStore";

const homeLocation = { kind: "windows", path: "C:\\Users\\test" } as const;
const size = { cols: 100, rows: 35 };

beforeEach(() => {
  for (const tab of useGlobalTerminalStore.getState().tabs) forgetShellLaunch(tab.id);
  useGlobalTerminalStore.setState({ tabs: [], activeTabId: null, location: null });
  bridge.getHomeScopeLocation.mockReset().mockResolvedValue(homeLocation);
  bridge.startShell.mockReset().mockResolvedValue(undefined);
  bridge.closeThread.mockReset().mockResolvedValue(undefined);
  bridge.onSupervisorEvent.mockReturnValue(() => undefined);
});

it("allocates the first tab lazily and preserves tabs and selection when reopened", () => {
  const store = useGlobalTerminalStore.getState();
  store.open();
  const first = useGlobalTerminalStore.getState().tabs[0]!;
  expect(first).toMatchObject({ id: expect.stringMatching(/^shell:/), title: "~" });
  expect(first).not.toHaveProperty("projectId");
  expect(first).not.toHaveProperty("worktreePath");
  expect(useGlobalTerminalStore.getState().activeTabId).toBe(first.id);

  const second = store.addTab();
  expect(second.id).not.toBe(first.id);
  expect(useGlobalTerminalStore.getState().activeTabId).toBe(second.id);
  store.setActiveTab(first.id);
  store.open();
  expect(useGlobalTerminalStore.getState()).toMatchObject({
    tabs: [first, second],
    activeTabId: first.id,
  });
  expect(bridge.getHomeScopeLocation).not.toHaveBeenCalled();
  expect(bridge.startShell).not.toHaveBeenCalled();
});

it("starts each measured tab at native home and keeps its shell across repeated opens", async () => {
  const store = useGlobalTerminalStore.getState();
  const first = store.addTab();
  const second = store.addTab();
  const secondSize = { cols: 80, rows: 24 };
  await Promise.all([
    store.ensureStarted(first.id, size),
    store.ensureStarted(second.id, secondSize),
  ]);
  expect(bridge.getHomeScopeLocation).toHaveBeenCalledOnce();
  expect(bridge.startShell).toHaveBeenCalledWith({
    shellId: first.id,
    projectLocation: homeLocation,
    startInHome: true,
    initialSize: size,
  });
  expect(bridge.startShell).toHaveBeenCalledWith({
    shellId: second.id,
    projectLocation: homeLocation,
    startInHome: true,
    initialSize: secondSize,
  });
  store.open();
  await store.ensureStarted(first.id, secondSize);
  expect(bridge.startShell).toHaveBeenCalledTimes(2);
  expect(bridge.closeThread).not.toHaveBeenCalled();
});

it("deduplicates repeated resizes for a tab while home and its start are pending", async () => {
  let resolveHome!: (location: ProjectLocation) => void;
  let resolveStart!: () => void;
  bridge.getHomeScopeLocation.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveHome = resolve;
    }),
  );
  bridge.startShell.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveStart = resolve;
    }),
  );
  const store = useGlobalTerminalStore.getState();
  const tab = store.addTab();
  const first = store.ensureStarted(tab.id, size);
  expect(store.ensureStarted(tab.id, { cols: 80, rows: 24 })).toBe(first);
  expect(bridge.getHomeScopeLocation).toHaveBeenCalledOnce();
  resolveHome(homeLocation);
  await vi.waitFor(() => expect(bridge.startShell).toHaveBeenCalledOnce());
  expect(store.ensureStarted(tab.id, size)).toBe(first);
  resolveStart();
  await first;
});

it("allows independent tabs to start without waiting for another tab's PTY", async () => {
  let resolveFirst!: () => void;
  bridge.startShell.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveFirst = resolve;
    }),
  );
  const store = useGlobalTerminalStore.getState();
  const first = store.addTab();
  const second = store.addTab();
  const firstStart = store.ensureStarted(first.id, size);
  await store.ensureStarted(second.id, size);
  expect(bridge.startShell).toHaveBeenCalledTimes(2);
  resolveFirst();
  await firstStart;
});

it("retries a failed shared home lookup and a failed spawn", async () => {
  bridge.getHomeScopeLocation.mockRejectedValueOnce(new Error("home unavailable"));
  const store = useGlobalTerminalStore.getState();
  const first = store.addTab();
  const second = store.addTab();
  await expect(
    Promise.all([store.ensureStarted(first.id, size), store.ensureStarted(second.id, size)]),
  ).rejects.toThrow("home unavailable");
  expect(bridge.getHomeScopeLocation).toHaveBeenCalledOnce();
  expect(bridge.startShell).not.toHaveBeenCalled();

  bridge.startShell.mockRejectedValueOnce(new Error("spawn failed"));
  await expect(store.ensureStarted(first.id, size)).rejects.toThrow("spawn failed");
  expect(wasShellLaunched(first.id)).toBe(false);
  await store.ensureStarted(first.id, size);
  expect(bridge.getHomeScopeLocation).toHaveBeenCalledTimes(2);
  expect(bridge.startShell).toHaveBeenCalledTimes(2);
  expect(wasShellLaunched(first.id)).toBe(true);
});

it("cycles only global tabs and ignores selection or starts for unrelated ids", async () => {
  const store = useGlobalTerminalStore.getState();
  await store.ensureStarted("shell:unrelated", size);
  store.setActiveTab("shell:unrelated");
  store.cycleTab("next");
  expect(useGlobalTerminalStore.getState().activeTabId).toBeNull();
  const first = store.addTab();
  store.cycleTab("next");
  expect(useGlobalTerminalStore.getState().activeTabId).toBe(first.id);
  const second = store.addTab();
  store.cycleTab("next");
  expect(useGlobalTerminalStore.getState().activeTabId).toBe(first.id);
  store.cycleTab("previous");
  expect(useGlobalTerminalStore.getState().activeTabId).toBe(second.id);
  store.setActiveTab("shell:unrelated");
  expect(useGlobalTerminalStore.getState().activeTabId).toBe(second.id);
  expect(bridge.getHomeScopeLocation).not.toHaveBeenCalled();
});

it("normalizes shell titles consistently with project terminal tabs", () => {
  const store = useGlobalTerminalStore.getState();
  const first = store.addTab();
  const second = store.addTab();
  store.updateTabTitle(first.id, "C:\\Windows\\System32\\pwsh.exe");
  store.updateTabTitle(second.id, "wsl.exe");
  store.updateTabTitle("shell:unrelated", "Other");
  expect(useGlobalTerminalStore.getState().tabs).toMatchObject([
    { id: first.id, title: "pwsh" },
    { id: second.id, title: "~" },
  ]);
});

it("removes only owned shells, clears their launch marks and selects a remaining tab", async () => {
  const store = useGlobalTerminalStore.getState();
  const first = store.addTab();
  const second = store.addTab();
  await store.ensureStarted(first.id, size);
  store.removeTab("shell:unrelated");
  expect(bridge.closeThread).not.toHaveBeenCalled();

  store.removeTab(first.id);
  expect(wasShellLaunched(first.id)).toBe(false);
  expect(useGlobalTerminalStore.getState().activeTabId).toBe(second.id);
  expect(bridge.closeThread).toHaveBeenCalledExactlyOnceWith({ threadId: first.id });
  store.removeTab(second.id);
  expect(useGlobalTerminalStore.getState()).toMatchObject({ tabs: [], activeTabId: null });
  expect(bridge.closeThread).toHaveBeenLastCalledWith({ threadId: second.id });
  store.removeTab(second.id);
  expect(bridge.closeThread).toHaveBeenCalledTimes(2);
  store.open();
  expect(useGlobalTerminalStore.getState().tabs[0]?.id).not.toBe(second.id);
});

it("never spawns a removed tab after the shared home lookup resolves", async () => {
  let resolveHome!: (location: ProjectLocation) => void;
  bridge.getHomeScopeLocation.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveHome = resolve;
    }),
  );
  const store = useGlobalTerminalStore.getState();
  const first = store.addTab();
  const second = store.addTab();
  const firstStart = store.ensureStarted(first.id, size);
  const secondStart = store.ensureStarted(second.id, size);
  store.removeTab(first.id);
  expect(bridge.closeThread).not.toHaveBeenCalled();
  resolveHome(homeLocation);
  await Promise.all([firstStart, secondStart]);
  await vi.waitFor(() =>
    expect(bridge.closeThread).toHaveBeenCalledExactlyOnceWith({ threadId: first.id }),
  );
  expect(bridge.startShell).toHaveBeenCalledExactlyOnceWith({
    shellId: second.id,
    projectLocation: homeLocation,
    startInHome: true,
    initialSize: size,
  });
});

it("waits for a pending spawn before closing a removed tab", async () => {
  let resolveStart!: () => void;
  bridge.startShell.mockReturnValueOnce(
    new Promise((resolve) => {
      resolveStart = resolve;
    }),
  );
  const store = useGlobalTerminalStore.getState();
  const tab = store.addTab();
  const started = store.ensureStarted(tab.id, size);
  await vi.waitFor(() => expect(bridge.startShell).toHaveBeenCalledOnce());
  store.removeTab(tab.id);
  expect(wasShellLaunched(tab.id)).toBe(false);
  expect(bridge.closeThread).not.toHaveBeenCalled();
  resolveStart();
  await started;
  await vi.waitFor(() =>
    expect(bridge.closeThread).toHaveBeenCalledExactlyOnceWith({ threadId: tab.id }),
  );
  expect(wasShellLaunched(tab.id)).toBe(false);
  await store.ensureStarted(tab.id, size);
  expect(bridge.startShell).toHaveBeenCalledOnce();
});

it("still cleans up a removed tab after its pending start rejects", async () => {
  let rejectStart!: (error: Error) => void;
  bridge.startShell.mockReturnValueOnce(
    new Promise((_resolve, reject) => {
      rejectStart = reject;
    }),
  );
  const store = useGlobalTerminalStore.getState();
  const tab = store.addTab();
  const started = store.ensureStarted(tab.id, size);
  const failed = started.catch((error: unknown) => error);
  await vi.waitFor(() => expect(bridge.startShell).toHaveBeenCalledOnce());
  store.removeTab(tab.id);
  rejectStart(new Error("spawn failed"));
  expect(await failed).toMatchObject({ message: "spawn failed" });
  await vi.waitFor(() =>
    expect(bridge.closeThread).toHaveBeenCalledExactlyOnceWith({ threadId: tab.id }),
  );
  expect(wasShellLaunched(tab.id)).toBe(false);
});
