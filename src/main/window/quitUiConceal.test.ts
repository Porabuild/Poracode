import type { BrowserWindow, WebContents } from "electron";
import { afterEach, describe, expect, it, vi } from "vitest";
import { concealAppUiForQuit } from "./quitUiConceal";

const electron = vi.hoisted(() => ({
  hideApp: vi.fn<() => void>(),
  onApp: vi.fn<(event: string, listener: (event: unknown, source: unknown) => void) => void>(),
  windows: [] as {
    isDestroyed: ReturnType<typeof vi.fn<() => boolean>>;
    isVisible: ReturnType<typeof vi.fn<() => boolean>>;
    hide: ReturnType<typeof vi.fn<() => void>>;
  }[],
  contents: [] as Pick<WebContents, "on">[],
}));

vi.mock("electron", () => ({
  app: { hide: electron.hideApp, on: electron.onApp },
  BrowserWindow: { getAllWindows: () => electron.windows },
  webContents: { getAllWebContents: () => electron.contents },
}));

let platformDescriptor: PropertyDescriptor | undefined;

afterEach(() => {
  if (platformDescriptor) Object.defineProperty(process, "platform", platformDescriptor);
  else Reflect.deleteProperty(process, "platform");
  platformDescriptor = undefined;
  electron.windows = [];
  electron.contents = [];
  electron.hideApp.mockReset();
  electron.onApp.mockReset();
});

function concealOn(
  platform: NodeJS.Platform,
  conceal: typeof concealAppUiForQuit = concealAppUiForQuit,
): void {
  platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
  Object.defineProperty(process, "platform", { configurable: true, value: platform });
  conceal();
}

function createWindow(visible: boolean) {
  return {
    isDestroyed: vi.fn<() => boolean>(() => false),
    isVisible: vi.fn<() => boolean>(() => visible),
    hide: vi.fn<() => void>(),
  };
}

type UnloadVetoEvent = { preventDefault(): void };

function createContents() {
  const vetoes: Array<(event: UnloadVetoEvent) => void> = [];
  const source = {
    on: vi.fn<(event: "will-prevent-unload", listener: (event: UnloadVetoEvent) => void) => void>(
      (_event, listener) => {
        vetoes.push(listener);
      },
    ),
  };
  return {
    vetoes,
    source: source as unknown as Pick<WebContents, "on"> & typeof source,
  };
}

describe("concealAppUiForQuit", () => {
  it("hides the whole app in one step on macOS", () => {
    const window = createWindow(true);
    electron.windows = [window];

    concealOn("darwin");

    expect(electron.hideApp).toHaveBeenCalledOnce();
    expect(window.hide).not.toHaveBeenCalled();
  });

  it.each(["win32", "linux"] as const)("hides every window that is on screen on %s", (platform) => {
    const shown = createWindow(true);
    const hidden = createWindow(false);
    const destroyed = createWindow(true);
    destroyed.isDestroyed = vi.fn<() => boolean>(() => true);
    electron.windows = [shown, hidden, destroyed];

    concealOn(platform);

    expect(electron.hideApp).not.toHaveBeenCalled();
    expect(shown.hide).toHaveBeenCalledOnce();
    expect(hidden.hide).not.toHaveBeenCalled();
    expect(destroyed.hide).not.toHaveBeenCalled();
  });

  it.each(["darwin", "win32"] as const)(
    "leaves the unload to the quit once a renderer vetoes it on %s",
    (platform) => {
      const contents = [createContents(), createContents()];
      electron.contents = contents.map((entry) => entry.source);

      concealOn(platform);

      for (const { source, vetoes } of contents) {
        expect(source.on).toHaveBeenCalledExactlyOnceWith(
          "will-prevent-unload",
          expect.any(Function),
        );
        const event = { preventDefault: vi.fn<() => void>() };
        vetoes[0]!(event);
        expect(event.preventDefault).toHaveBeenCalledOnce();
      }
    },
  );

  it("overrules the unload veto of a web contents created after the quit began", () => {
    concealOn("darwin");

    expect(electron.onApp).toHaveBeenCalledExactlyOnceWith(
      "web-contents-created",
      expect.any(Function),
    );
    const late = createContents();
    const [, onCreated] = electron.onApp.mock.calls[0]!;
    onCreated({}, late.source);

    expect(late.source.on).toHaveBeenCalledExactlyOnceWith(
      "will-prevent-unload",
      expect.any(Function),
    );
  });

  it("keeps a later reveal from bringing a window back", async () => {
    // Fresh modules, so this test's guard is the one the conceal arms.
    vi.resetModules();
    const { concealAppUiForQuit: conceal } = await import("./quitUiConceal");
    const { showAndFocusWindow } = await import("./showAndFocusWindow");
    const hidden = createWindow(false);
    const revealed = { show: vi.fn<() => void>(), focus: vi.fn<() => void>() };
    electron.windows = [hidden];

    concealOn("win32", conceal);
    showAndFocusWindow({ ...hidden, ...revealed } as unknown as BrowserWindow);

    expect(revealed.show).not.toHaveBeenCalled();
    expect(revealed.focus).not.toHaveBeenCalled();
  });
});
