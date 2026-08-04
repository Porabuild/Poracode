import { beforeEach, describe, expect, it, vi } from "vitest";

const getMobileRuntimePlatform = vi.fn<() => string>();
vi.mock("./mobilePlatform", () => ({
  getMobileRuntimePlatform: () => getMobileRuntimePlatform(),
}));

type ToastUpdateAction = "add" | "remove" | "clear";
const queue: { wrapUpdate?: (fn: () => void, action: ToastUpdateAction) => void } = {};
vi.mock("@heroui/react", () => ({
  toast: { getQueue: () => queue },
}));

import { disableToastExitViewTransitionsInIosBrowser } from "./toastViewTransitions";

describe("disableToastExitViewTransitionsInIosBrowser", () => {
  const doc = {
    documentElement: { dataset: {} as DOMStringMap },
  } as Document;

  beforeEach(() => {
    delete doc.documentElement.dataset.mobileBrowserChrome;
  });

  it("bypasses exit transitions in an iOS Safari tab but keeps entrance transitions", () => {
    const originalWrapUpdate = vi.fn<(update: () => void, action: ToastUpdateAction) => void>(
      (update) => update(),
    );
    queue.wrapUpdate = originalWrapUpdate;
    getMobileRuntimePlatform.mockReturnValue("ios");
    doc.documentElement.dataset.mobileBrowserChrome = "true";

    disableToastExitViewTransitionsInIosBrowser(doc);

    const update = vi.fn<() => void>();
    queue.wrapUpdate?.(update, "remove");
    expect(update).toHaveBeenCalledOnce();
    expect(originalWrapUpdate).not.toHaveBeenCalled();

    update.mockClear();
    queue.wrapUpdate?.(update, "clear");
    expect(update).toHaveBeenCalledOnce();
    expect(originalWrapUpdate).not.toHaveBeenCalled();

    update.mockClear();
    queue.wrapUpdate?.(update, "add");
    expect(originalWrapUpdate).toHaveBeenCalledWith(update, "add");
    expect(update).toHaveBeenCalledOnce();
  });

  it("keeps the wrapper in an installed iOS app", () => {
    const originalWrapUpdate = vi.fn<(update: () => void, action: ToastUpdateAction) => void>();
    queue.wrapUpdate = originalWrapUpdate;
    getMobileRuntimePlatform.mockReturnValue("ios");

    disableToastExitViewTransitionsInIosBrowser(doc);

    expect(queue.wrapUpdate).toBe(originalWrapUpdate);
  });

  it.each(["android", "web", "windows"])("keeps the wrapper on %s", (platform) => {
    const originalWrapUpdate = vi.fn<(update: () => void, action: ToastUpdateAction) => void>();
    queue.wrapUpdate = originalWrapUpdate;
    getMobileRuntimePlatform.mockReturnValue(platform);
    doc.documentElement.dataset.mobileBrowserChrome = "true";

    disableToastExitViewTransitionsInIosBrowser(doc);

    expect(queue.wrapUpdate).toBe(originalWrapUpdate);
  });
});
