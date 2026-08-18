import { describe, expect, it, vi } from "vitest";
import { createMainWindowCloseLifecycle } from "./mainWindowClose";

function createHarness(overrides: { isQuitting?: boolean; closeToTrayEnabled?: boolean } = {}) {
  const event = { preventDefault: vi.fn<() => void>() };
  const options = {
    isQuitting: vi.fn<() => boolean>(() => overrides.isQuitting ?? false),
    closeToTrayEnabled: vi.fn<() => boolean>(() => overrides.closeToTrayEnabled ?? false),
    hide: vi.fn<() => void>(),
    markQuitting: vi.fn<() => void>(),
    quit: vi.fn<() => void>(),
  };
  const lifecycle = createMainWindowCloseLifecycle(options);
  return { event, options, lifecycle };
}

describe("createMainWindowCloseLifecycle", () => {
  it("starts an orderly app quit only after the main window has closed", () => {
    const { event, options, lifecycle } = createHarness();

    lifecycle.handleClose(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(options.hide).not.toHaveBeenCalled();
    expect(options.markQuitting).toHaveBeenCalledOnce();
    expect(options.quit).not.toHaveBeenCalled();

    lifecycle.handleClosed();

    expect(options.quit).toHaveBeenCalledOnce();
    lifecycle.handleClosed();
    expect(options.quit).toHaveBeenCalledOnce();
  });

  it("keeps the app running and hides the window when close to tray is enabled", () => {
    const { event, options, lifecycle } = createHarness({ closeToTrayEnabled: true });

    lifecycle.handleClose(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(options.hide).toHaveBeenCalledOnce();
    expect(options.markQuitting).not.toHaveBeenCalled();
    lifecycle.handleClosed();
    expect(options.quit).not.toHaveBeenCalled();
  });

  it("does not interfere with a quit already in progress", () => {
    const { event, options, lifecycle } = createHarness({ isQuitting: true });

    lifecycle.handleClose(event);
    lifecycle.handleClosed();

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(options.closeToTrayEnabled).not.toHaveBeenCalled();
    expect(options.hide).not.toHaveBeenCalled();
    expect(options.markQuitting).not.toHaveBeenCalled();
    expect(options.quit).not.toHaveBeenCalled();
  });

  it("does not consume another window's armed close", () => {
    const first = createHarness();
    const second = createHarness();

    first.lifecycle.handleClose(first.event);
    second.lifecycle.handleClosed();

    expect(first.options.quit).not.toHaveBeenCalled();
    expect(second.options.quit).not.toHaveBeenCalled();

    first.lifecycle.handleClosed();

    expect(first.options.quit).toHaveBeenCalledOnce();
  });
});
