import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  appState,
  capabilityState,
  sharedSettingsState,
  toastMock,
  bridgeMock,
  openThreadMock,
  openThreadWindowMock,
  threadsInOtherWindows,
} = vi.hoisted(() => ({
  /** Mirrors the negotiated client capability; tests flip it per flavor. */
  capabilityState: { current: { osNotifications: true } },
  sharedSettingsState: {
    current: {
      notificationsEnabled: true,
      notificationSound: true,
      notificationFilter: "unfocused",
      notificationStatuses: { done: true, needsAttention: true, error: true },
    },
  },
  toastMock: {
    close: vi.fn<(id: unknown) => void>(),
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
  openThreadWindowMock: vi.fn<(thread: { id: string }) => void>(),
  threadsInOtherWindows: new Set<string>(),
  appState: {
    current: {
      view: { kind: "home" } as { kind: string; panes?: string[] },
      projects: [] as unknown[],
      threads: [] as Array<{ id: string }>,
    },
  },
}));

vi.mock("@heroui/react", () => ({
  toast: toastMock,
}));

vi.mock("@/renderer/actions/threadActions", () => ({
  openThread: openThreadMock,
}));

vi.mock("@/renderer/actions/threadWindowActions", () => ({
  openThreadWindow: openThreadWindowMock,
}));

vi.mock("@/renderer/state/auxiliaryThreadWindows", () => ({
  livesInAnotherWindow: (threadId: string) => threadsInOtherWindows.has(threadId),
}));

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: () => bridgeMock.remote,
  readBridge: () => bridgeMock,
}));

vi.mock("@/renderer/clientRuntime", () => ({
  hasClientCapability: (capability: string) =>
    capability === "osNotifications" && capabilityState.current.osNotifications,
}));

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: {
    getState: () => appState.current,
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
  openThreadWindowMock.mockClear();
  threadsInOtherWindows.clear();
  appState.current = { view: { kind: "home" }, projects: [], threads: [] };
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

  it("does not count the placeholder of a thread in its own window as showing it", () => {
    appState.current = {
      view: { kind: "thread", panes: ["thread-1"] },
      projects: [],
      threads: [{ id: "thread-1" }],
    };
    showUserNotification(notification());
    expect(toastMock.success).not.toHaveBeenCalled();

    threadsInOtherWindows.add("thread-1");
    showUserNotification(notification());
    expect(toastMock.success).toHaveBeenCalledOnce();
  });

  it("opens a thread in its own window by focusing that window", () => {
    const thread = { id: "thread-1" };
    appState.current = {
      view: { kind: "thread", panes: ["other"] },
      projects: [],
      threads: [thread],
    };
    threadsInOtherWindows.add("thread-1");
    showUserNotification(notification());

    const [, options] = toastMock.success.mock.calls[0]! as [
      string,
      { actionProps: { onPress(): void }; onPress(): void },
    ];
    options.actionProps.onPress();
    options.onPress();

    expect(openThreadWindowMock).toHaveBeenCalledTimes(2);
    expect(openThreadWindowMock).toHaveBeenCalledWith(thread);
    expect(openThreadMock).not.toHaveBeenCalled();
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
    capabilityState.current.osNotifications = true;
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

  it("hides the native OS notification when the host does not declare osNotifications", () => {
    capabilityState.current.osNotifications = false;
    showUserNotification(notification());

    expect(bridgeMock.showNotification).not.toHaveBeenCalled();
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
