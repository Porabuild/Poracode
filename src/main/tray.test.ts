import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";

interface TrayMockInstance {
  destroy(): void;
  on(event: string, listener: () => void): void;
  setContextMenu(menu: unknown): void;
  setToolTip(tooltip: string): void;
}

const existsSyncMock = vi.hoisted(() => vi.fn<(path: string) => boolean>());
const trayConstructorMock = vi.hoisted(() =>
  vi.fn<(image: unknown) => TrayMockInstance>(function TrayMock(_image: unknown) {
    return {
      destroy: vi.fn<() => void>(),
      on: vi.fn<(event: string, listener: () => void) => void>(),
      setContextMenu: vi.fn<(menu: unknown) => void>(),
      setToolTip: vi.fn<(tooltip: string) => void>(),
    };
  }),
);
const imageMock = vi.hoisted(() => {
  const image = {
    isEmpty: vi.fn<() => boolean>(() => false),
    resize: vi.fn<(size: { width: number; height: number }) => unknown>(),
    setTemplateImage: vi.fn<(value: boolean) => void>(),
  };
  image.resize.mockReturnValue(image);
  return image;
});
const appMock = vi.hoisted(() => ({ isPackaged: false }));
const buildFromTemplateMock = vi.hoisted(() => vi.fn<(template: unknown[]) => unknown>(() => ({})));

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
}));

vi.mock("electron", () => ({
  app: appMock,
  Menu: { buildFromTemplate: buildFromTemplateMock },
  nativeImage: {
    createFromPath: vi.fn<(path: string) => unknown>(() => imageMock),
  },
  Tray: trayConstructorMock,
}));

import { createTray, resolveTrayIconPath } from "./tray";

describe("resolveTrayIconPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appMock.isPackaged = false;
    imageMock.isEmpty.mockReturnValue(false);
  });

  afterEach(() => vi.useRealTimers());

  it("prefers the nightly icon in dev nightly builds", () => {
    const filename = process.platform === "win32" ? "tray-icon-nightly.ico" : "icon-nightly.png";
    existsSyncMock.mockImplementation((path) => path.endsWith(filename));

    expect(resolveTrayIconPath("nightly")).toMatch(
      new RegExp(`build[\\\\/]${filename.replace(".", "\\.")}$`, "u"),
    );
  });

  it("uses the stable icon in dev stable builds", () => {
    const filename = process.platform === "win32" ? "tray-icon.ico" : "icon.png";
    existsSyncMock.mockImplementation((path) => path.endsWith(filename));

    expect(resolveTrayIconPath("stable")).toMatch(
      new RegExp(`build[\\\\/]${filename.replace(".", "\\.")}$`, "u"),
    );
  });

  it("falls back to no tray when the icon is missing", () => {
    existsSyncMock.mockReturnValue(false);

    const handle = createTray({
      appName: "Poracode",
      channel: "stable",
      onShow: vi.fn<() => void>(),
      onQuit: vi.fn<() => void>(),
    });

    expect(trayConstructorMock).not.toHaveBeenCalled();
    expect(handle.available).toBe(false);
    expect(() => handle.destroy()).not.toThrow();
    expect(() => handle.refreshMenu()).not.toThrow();
    expect(() => handle.setQuickComposerShortcut("Ctrl+Shift+K")).not.toThrow();
  });

  it("adds a quick composer entry with the registered shortcut", () => {
    existsSyncMock.mockReturnValue(true);
    const onQuickComposer = vi.fn<() => void>();
    const onShow = vi.fn<() => void>();
    const onQuit = vi.fn<() => void>();

    const handle = createTray({
      appName: "Poracode",
      channel: "stable",
      onShow,
      onQuickComposer,
      onQuit,
    });
    handle.setQuickComposerShortcut("CommandOrControl+Alt+Space");

    const template = buildFromTemplateMock.mock.calls.at(-1)?.[0] as Array<{
      label?: string;
      click?: () => void;
    }>;
    expect(handle.available).toBe(true);
    expect(template[0]?.label).toBe("New Task (CommandOrControl+Alt+Space)");
    template[0]?.click?.();
    expect(onQuickComposer).toHaveBeenCalledOnce();
    template.find((item) => item.label === "Open Poracode")?.click?.();
    expect(onShow).toHaveBeenCalledOnce();
    template.find((item) => item.label === "Exit")?.click?.();
    expect(onQuit).toHaveBeenCalledOnce();

    handle.setQuickComposerShortcut("Ctrl+Shift+K");
    const updated = buildFromTemplateMock.mock.calls.at(-1)?.[0] as Array<{ label?: string }>;
    expect(updated[0]?.label).toBe("New Task (Ctrl+Shift+K)");
  });

  it("shows unread and recent threads and opens the selected thread", () => {
    vi.useFakeTimers();
    existsSyncMock.mockReturnValue(true);
    const onOpenThread = vi.fn<(threadId: string) => void>();
    const projects: Project[] = [
      {
        id: "project-1",
        name: "Tasks",
        location: { kind: "windows", path: "C:\\code" },
        createdAt: "2026-07-15T00:00:00.000Z",
      },
    ];
    const makeThread = (id: string, title: string, updatedAt: string): Thread => ({
      id,
      projectId: "project-1",
      title,
      agentKind: "codex",
      config: { model: "gpt-5" },
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      createdAt: updatedAt,
      updatedAt,
    });
    const threads: Thread[] = [
      {
        ...makeThread("unread", "Finished task", "2026-07-15T06:00:00.000Z"),
        status: "finished",
      },
      makeThread("recent-4", "Fourth recent", "2026-07-15T05:00:00.000Z"),
      {
        ...makeThread("recent-3", "Third recent", "2026-07-15T04:00:00.000Z"),
        worktreeBranch: "poracode/quiet-meadow",
      },
      makeThread("recent-2", "Second recent", "2026-07-15T03:00:00.000Z"),
      makeThread("recent-1", "First recent", "2026-07-15T02:00:00.000Z"),
      { ...makeThread("archived", "Archived", "2026-07-15T07:00:00.000Z"), archived: true },
      { ...makeThread("done", "Done", "2026-07-15T08:00:00.000Z"), done: true },
    ];

    const getThreads = vi.fn<() => Thread[]>(() => threads);
    const handle = createTray({
      appName: "Poracode",
      channel: "stable",
      getProjects: () => projects,
      getThreads,
      onOpenThread,
      onQuickComposer: vi.fn<() => void>(),
      onShow: vi.fn<() => void>(),
      onQuit: vi.fn<() => void>(),
    });

    type TemplateItem = {
      label?: string;
      enabled?: boolean;
      click?: () => void;
      submenu?: TemplateItem[];
    };
    const template = buildFromTemplateMock.mock.calls.at(-1)?.[0] as TemplateItem[];
    const itemLabel = (title: string, context: string) => `${title} — ${context}`;
    expect(template.find((item) => item.label === "Unread")?.enabled).toBe(false);
    expect(
      template.find((item) => item.label === itemLabel("Finished task", "Tasks")),
    ).toBeDefined();
    expect(
      template.find((item) => item.label === itemLabel("Fourth recent", "Tasks")),
    ).toBeDefined();
    expect(
      template.find((item) => item.label === itemLabel("Third recent", "poracode/quiet-meadow")),
    ).toBeDefined();
    expect(
      template.find((item) => item.label === itemLabel("Second recent", "Tasks")),
    ).toBeDefined();
    expect(
      template.find((item) => item.label === itemLabel("First recent", "Tasks")),
    ).toBeUndefined();
    const recentIndex = template.findIndex((item) => item.label === "Recent");
    expect(template.slice(recentIndex + 1, recentIndex + 4).map((item) => item.label)).toEqual([
      itemLabel("Fourth recent", "Tasks"),
      itemLabel("Third recent", "poracode/quiet-meadow"),
      itemLabel("Second recent", "Tasks"),
    ]);
    expect(template.find((item) => item.label === "More")?.submenu?.[0]?.label).toBe(
      itemLabel("First recent", "Tasks"),
    );
    expect(
      template.some(
        (item) =>
          item.label === itemLabel("Archived", "Tasks") ||
          item.label === itemLabel("Done", "Tasks"),
      ),
    ).toBe(false);

    template.find((item) => item.label === itemLabel("Finished task", "Tasks"))?.click?.();
    expect(onOpenThread).toHaveBeenCalledWith("unread");
    template.find((item) => item.label === "More")?.submenu?.[0]?.click?.();
    expect(onOpenThread).toHaveBeenLastCalledWith("recent-1");

    const buildCount = buildFromTemplateMock.mock.calls.length;
    const readCount = getThreads.mock.calls.length;
    handle.refreshMenu();
    handle.refreshMenu();
    expect(getThreads).toHaveBeenCalledTimes(readCount);
    vi.runAllTimers();
    expect(getThreads).toHaveBeenCalledTimes(readCount + 1);
    expect(buildFromTemplateMock).toHaveBeenCalledTimes(buildCount);
    threads[1] = { ...threads[1]!, title: "Renamed recent" };
    handle.refreshMenu();
    handle.refreshMenu();
    vi.runAllTimers();
    expect(getThreads).toHaveBeenCalledTimes(readCount + 2);
    expect(buildFromTemplateMock).toHaveBeenCalledTimes(buildCount + 1);
  });

  it.skipIf(process.platform !== "darwin")("uses the macOS template glyph without resizing", () => {
    existsSyncMock.mockImplementation((path) => path.endsWith("tray-icon-mac.png"));

    const resolved = resolveTrayIconPath("stable");
    expect(resolved).toMatch(/build[\\/]tray-icon-mac\.png$/u);

    const handle = createTray({
      appName: "Poracode",
      channel: "stable",
      onShow: vi.fn<() => void>(),
      onQuit: vi.fn<() => void>(),
    });

    expect(handle.available).toBe(true);
    expect(imageMock.setTemplateImage).toHaveBeenCalledWith(true);
    expect(imageMock.resize).not.toHaveBeenCalled();
  });
});
