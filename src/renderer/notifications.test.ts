import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { showUserNotification } from "./notifications";
import type { UserNotification } from "@/shared/threadNotification";

function notification(overrides: Partial<UserNotification> = {}): UserNotification {
  return {
    threadId: "thread-1",
    category: "done",
    projectName: "Repo",
    threadTitle: "Thread",
    status: "finished",
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

describe("showUserNotification", () => {
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

  it("shows an in-app toast for a host-owned notification when focused", () => {
    showUserNotification(notification());

    expect(toastMock.success).toHaveBeenCalledWith("Repo", {
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

describe("showUserNotification native path", () => {
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
    showUserNotification(notification());

    expect(bridgeMock.showNotification).toHaveBeenCalledWith({
      title: "Repo",
      body: "Thread\nFinished · Waiting for your input",
      threadId: "thread-1",
    });
  });

  it("swallows native notification IPC failures", async () => {
    bridgeMock.showNotification.mockRejectedValueOnce(new Error("boom"));
    showUserNotification(notification());
    await Promise.resolve();

    expect(bridgeMock.showNotification).toHaveBeenCalledOnce();
  });
});

describe("showUserNotification PWA path", () => {
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
    showUserNotification(notification());

    expect(bridgeMock.showNotification).not.toHaveBeenCalled();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      title: "Repo",
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

  it("requests browser notification permission before showing the notification", async () => {
    const { BrowserNotification, notifications } = installBrowserNotification("default");
    showUserNotification(notification());

    expect(BrowserNotification.requestPermission).toHaveBeenCalledOnce();
    expect(notifications).toHaveLength(0);

    await Promise.resolve();

    expect(notifications).toHaveLength(1);
  });
});
