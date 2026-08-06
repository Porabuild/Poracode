import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";

const { sharedSettingsState, toastMock, bridgeMock, openThreadMock } = vi.hoisted(() => ({
  sharedSettingsState: {
    current: {
      notificationsEnabled: true,
      notificationSound: true,
      notificationFilter: "unfocused",
      notificationStatuses: { done: true, needsAttention: true, error: true },
    },
  },
  toastMock: {
    danger: vi.fn<(title: string, options: unknown) => void>(),
    success: vi.fn<(title: string, options: unknown) => void>(),
    warning: vi.fn<(title: string, options: unknown) => void>(),
  },
  bridgeMock: {
    focusWindow: vi.fn<() => Promise<void>>(),
    remote: false,
    showNotification: vi.fn<(payload: unknown) => Promise<boolean>>(),
  },
  openThreadMock: vi.fn<(threadId: string, options?: unknown) => void>(),
}));

vi.mock("@heroui/react", () => ({
  toast: toastMock,
}));

vi.mock("@/renderer/actions/threadActions", () => ({
  openThread: openThreadMock,
}));

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: () => bridgeMock.remote,
  readBridge: () => bridgeMock,
}));

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: {
    getState: () => ({
      view: { kind: "home" },
      projects: [],
    }),
  },
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: {
    getState: () => sharedSettingsState.current,
  },
}));

import {
  handleThreadStateNotification,
  shouldInspectThreadStateForNotification,
} from "./notifications";

function thread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: "project-1",
    title: "Thread",
    agentKind: "codex",
    config: { model: "gpt-5.4" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-04-30T00:00:00.000Z",
    updatedAt: "2026-04-30T00:00:00.000Z",
    ...overrides,
  };
}

type FakeNotification = {
  title: string;
  options: NotificationOptions | undefined;
  onclick: (() => void) | null;
  close: ReturnType<typeof vi.fn>;
};

function installBrowserNotification(permission: NotificationPermission = "granted") {
  const notifications: FakeNotification[] = [];
  class BrowserNotification {
    static permission: NotificationPermission = permission;
    static requestPermission = vi
      .fn<() => Promise<NotificationPermission>>()
      .mockResolvedValue("granted");

    readonly title: string;
    readonly options: NotificationOptions | undefined;
    onclick: (() => void) | null = null;
    close = vi.fn<() => void>();

    constructor(title: string, options?: NotificationOptions) {
      this.title = title;
      this.options = options;
      notifications.push(this);
    }
  }
  vi.stubGlobal("Notification", BrowserNotification);
  return { BrowserNotification, notifications };
}

beforeEach(() => {
  bridgeMock.remote = false;
  bridgeMock.focusWindow.mockClear();
  openThreadMock.mockClear();
  vi.unstubAllGlobals();
});

describe("shouldInspectThreadStateForNotification", () => {
  beforeEach(() => {
    sharedSettingsState.current = {
      notificationsEnabled: true,
      notificationSound: true,
      notificationFilter: "unfocused",
      notificationStatuses: { done: true, needsAttention: true, error: true },
    };
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    toastMock.danger.mockClear();
    toastMock.success.mockClear();
    toastMock.warning.mockClear();
  });

  it("skips focused hot-path work for the default unfocused-only setting", () => {
    expect(shouldInspectThreadStateForNotification()).toBe(false);
  });

  it("keeps unfocused native notification checks enabled", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);

    expect(shouldInspectThreadStateForNotification()).toBe(true);
  });

  it("keeps focused checks when in-app notifications are enabled", () => {
    sharedSettingsState.current = {
      ...sharedSettingsState.current,
      notificationFilter: "all",
    };

    expect(shouldInspectThreadStateForNotification()).toBe(true);
  });

  it("skips checks when every notification category is disabled", () => {
    sharedSettingsState.current = {
      ...sharedSettingsState.current,
      notificationStatuses: { done: false, needsAttention: false, error: false },
    };

    expect(shouldInspectThreadStateForNotification()).toBe(false);
  });
});

describe("handleThreadStateNotification", () => {
  beforeEach(() => {
    sharedSettingsState.current = {
      notificationsEnabled: true,
      notificationSound: false,
      notificationFilter: "all",
      notificationStatuses: { done: true, needsAttention: true, error: true },
    };
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    toastMock.danger.mockClear();
    toastMock.success.mockClear();
    toastMock.warning.mockClear();
  });

  it("does not notify for attention-only updates when status is unchanged", () => {
    const oldThread = thread({ status: "idle", attention: "none" });

    handleThreadStateNotification(
      {
        type: "thread-state",
        threadId: oldThread.id,
        status: "idle",
        attention: "needs_reply",
      },
      oldThread,
      { status: "idle", attention: "needs_reply" },
    );

    expect(toastMock.warning).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.danger).not.toHaveBeenCalled();
  });

  it("uses the actual stored next status for done notifications", () => {
    const oldThread = thread({ status: "working", attention: "working" });

    handleThreadStateNotification(
      {
        type: "thread-state",
        threadId: oldThread.id,
        status: "idle",
        attention: "none",
      },
      oldThread,
      { status: "finished", attention: "none" },
    );

    expect(toastMock.success).toHaveBeenCalledWith("Unknown project", {
      actionProps: {
        children: "Open",
        onPress: expect.any(Function),
        variant: "secondary",
      },
      description: "Thread\nFinished · Waiting for your input",
      onPress: expect.any(Function),
      timeout: 6000,
    });
  });
});

describe("handleThreadStateNotification native path", () => {
  beforeEach(() => {
    sharedSettingsState.current = {
      notificationsEnabled: true,
      notificationSound: false,
      notificationFilter: "unfocused",
      notificationStatuses: { done: true, needsAttention: true, error: true },
    };
    bridgeMock.remote = false;
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    bridgeMock.showNotification.mockClear();
    bridgeMock.showNotification.mockResolvedValue(true);
  });

  it("shows a native OS notification through the bridge when the window is unfocused", () => {
    const oldThread = thread({ status: "working", attention: "working" });

    handleThreadStateNotification(
      {
        type: "thread-state",
        threadId: oldThread.id,
        status: "finished",
        attention: "none",
      },
      oldThread,
      { status: "finished", attention: "none" },
    );

    expect(bridgeMock.showNotification).toHaveBeenCalledWith({
      title: "Unknown project",
      body: "Thread\nFinished · Waiting for your input",
      threadId: "thread-1",
    });
  });

  it("swallows native notification IPC failures", async () => {
    bridgeMock.showNotification.mockRejectedValueOnce(new Error("boom"));
    const oldThread = thread({ status: "working", attention: "working" });

    handleThreadStateNotification(
      {
        type: "thread-state",
        threadId: oldThread.id,
        status: "finished",
        attention: "none",
      },
      oldThread,
      { status: "finished", attention: "none" },
    );

    await Promise.resolve();

    expect(bridgeMock.showNotification).toHaveBeenCalledOnce();
  });
});

describe("handleThreadStateNotification PWA path", () => {
  beforeEach(() => {
    sharedSettingsState.current = {
      notificationsEnabled: true,
      notificationSound: false,
      notificationFilter: "unfocused",
      notificationStatuses: { done: true, needsAttention: true, error: true },
    };
    bridgeMock.remote = true;
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    bridgeMock.showNotification.mockClear();
  });

  it("shows a browser notification instead of calling desktop notification IPC", () => {
    const { notifications } = installBrowserNotification();
    const oldThread = thread({ status: "working", attention: "working" });

    handleThreadStateNotification(
      {
        type: "thread-state",
        threadId: oldThread.id,
        status: "finished",
        attention: "none",
      },
      oldThread,
      { status: "finished", attention: "none" },
    );

    expect(bridgeMock.showNotification).not.toHaveBeenCalled();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      title: "Unknown project",
      options: {
        body: "Thread\nFinished · Waiting for your input",
        silent: true,
      },
    });

    notifications[0]!.onclick?.();

    expect(bridgeMock.focusWindow).toHaveBeenCalledOnce();
    expect(openThreadMock).toHaveBeenCalledWith("thread-1", {
      focusComposer: true,
      switchWorkspace: true,
    });
    expect(notifications[0]!.close).toHaveBeenCalledOnce();
  });

  it("does not notify when a desktop stop or steer force-closes the active turn", () => {
    const { notifications } = installBrowserNotification();
    const oldThread = thread({ status: "working", attention: "working" });

    handleThreadStateNotification(
      {
        type: "thread-state",
        threadId: oldThread.id,
        status: "idle",
        attention: "none",
        forceCloseActiveTurn: true,
      },
      oldThread,
      { status: "finished", attention: "none" },
    );

    expect(notifications).toHaveLength(0);
    expect(bridgeMock.showNotification).not.toHaveBeenCalled();
  });

  it("requests browser notification permission before showing the notification", async () => {
    const { BrowserNotification, notifications } = installBrowserNotification("default");
    const oldThread = thread({ status: "working", attention: "working" });

    handleThreadStateNotification(
      {
        type: "thread-state",
        threadId: oldThread.id,
        status: "finished",
        attention: "none",
      },
      oldThread,
      { status: "finished", attention: "none" },
    );

    expect(BrowserNotification.requestPermission).toHaveBeenCalledOnce();
    expect(notifications).toHaveLength(0);

    await Promise.resolve();

    expect(notifications).toHaveLength(1);
  });
});
