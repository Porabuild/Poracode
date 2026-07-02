import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_EVENT_CHANNELS } from "@/shared/ipc";

interface FakeNotificationInstance {
  options: { title?: string; body?: string; silent?: boolean };
  listeners: Record<string, Array<() => void>>;
  show: ReturnType<typeof vi.fn>;
  emit(event: string): void;
}

const notificationState = vi.hoisted(() => ({
  instances: [] as FakeNotificationInstance[],
  isSupported: vi.fn<() => boolean>(() => true),
  showThrows: false,
}));

vi.mock("electron", () => {
  class FakeNotification {
    options: FakeNotificationInstance["options"];
    listeners: FakeNotificationInstance["listeners"] = {};
    show = vi.fn<() => void>(() => {
      if (notificationState.showThrows) {
        throw new Error("show failed");
      }
    });

    constructor(options: FakeNotificationInstance["options"]) {
      this.options = options;
      notificationState.instances.push(this as unknown as FakeNotificationInstance);
    }

    on(event: string, cb: () => void): this {
      (this.listeners[event] ??= []).push(cb);
      return this;
    }

    emit(event: string): void {
      for (const cb of this.listeners[event] ?? []) cb();
    }

    static isSupported = notificationState.isSupported;
  }
  return { Notification: FakeNotification };
});

import { showOsNotification } from "./osNotifications";

function createFakeWindow() {
  return {
    isDestroyed: vi.fn<() => boolean>(() => false),
    isMinimized: vi.fn<() => boolean>(() => false),
    isVisible: vi.fn<() => boolean>(() => true),
    restore: vi.fn<() => void>(),
    show: vi.fn<() => void>(),
    focus: vi.fn<() => void>(),
    webContents: { send: vi.fn<(channel: string, payload: unknown) => void>() },
  };
}

type FakeWindow = ReturnType<typeof createFakeWindow>;

beforeEach(() => {
  notificationState.instances.length = 0;
  notificationState.isSupported.mockReturnValue(true);
  notificationState.showThrows = false;
});

describe("showOsNotification", () => {
  it("creates a silent native notification with the given title and body and shows it", () => {
    const win = createFakeWindow();
    const shown = showOsNotification(
      { title: "Project", body: "Body", threadId: "t1" },
      () => win as never,
    );

    expect(shown).toBe(true);
    expect(notificationState.instances).toHaveLength(1);
    const notification = notificationState.instances[0]!;
    expect(notification.options).toEqual({ title: "Project", body: "Body", silent: true });
    expect(notification.show).toHaveBeenCalledOnce();
  });

  it("focuses the window and forwards a notificationClick event when clicked", () => {
    const win = createFakeWindow();
    showOsNotification({ title: "Project", body: "Body", threadId: "t1" }, () => win as never);

    notificationState.instances[0]!.emit("click");

    expect(win.focus).toHaveBeenCalledOnce();
    expect(win.webContents.send).toHaveBeenCalledWith(IPC_EVENT_CHANNELS.notificationClick, {
      threadId: "t1",
    });
  });

  it("restores a minimized window before focusing on click", () => {
    const win = createFakeWindow();
    win.isMinimized.mockReturnValue(true);
    showOsNotification({ title: "P", body: "B", threadId: "t2" }, () => win as never);

    notificationState.instances[0]!.emit("click");

    expect(win.restore).toHaveBeenCalledOnce();
    expect(win.focus).toHaveBeenCalledOnce();
  });

  it("shows a hidden (closed-to-tray) window before focusing on click", () => {
    const win = createFakeWindow();
    win.isVisible.mockReturnValue(false);
    showOsNotification({ title: "P", body: "B", threadId: "t5" }, () => win as never);

    notificationState.instances[0]!.emit("click");

    expect(win.show).toHaveBeenCalledOnce();
    expect(win.focus).toHaveBeenCalledOnce();
  });

  it("does nothing when the window is gone at click time", () => {
    let win: FakeWindow | null = createFakeWindow();
    showOsNotification({ title: "P", body: "B", threadId: "t3" }, () => win as never);
    const notification = notificationState.instances[0]!;
    win = null;

    expect(() => notification.emit("click")).not.toThrow();
  });

  it("skips entirely when native notifications are unsupported", () => {
    notificationState.isSupported.mockReturnValue(false);
    const win = createFakeWindow();
    const shown = showOsNotification({ title: "P", body: "B", threadId: "t4" }, () => win as never);

    expect(shown).toBe(false);
    expect(notificationState.instances).toHaveLength(0);
  });

  it("returns false when showing the native notification fails", () => {
    notificationState.showThrows = true;
    const win = createFakeWindow();

    const shown = showOsNotification({ title: "P", body: "B", threadId: "t6" }, () => win as never);

    expect(shown).toBe(false);
  });
});
