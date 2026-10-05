import { afterEach, describe, expect, it, vi } from "vitest";
import { PICKER_CANCEL_FALLBACK_MS, pickAndUploadBrowserFiles } from "./browserFilePicker";

describe("pickAndUploadBrowserFiles", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const input of document.querySelectorAll('input[type="file"]')) input.remove();
  });

  it("applies extension filters and uploads every selected file", async () => {
    let accept = "";
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(
      function (this: HTMLInputElement) {
        expect(this.isConnected).toBe(true);
        accept = this.accept;
        const files = [new File(["one"], "one.md"), new File(["two"], "two.png")];
        Object.defineProperty(this, "files", { configurable: true, value: files });
        this.dispatchEvent(new Event("change"));
      },
    );
    const upload = vi.fn<(input: { fileName: string }) => Promise<string>>(
      async ({ fileName }) => `/remote/${fileName}`,
    );

    await expect(
      pickAndUploadBrowserFiles({
        attachmentThreadId: "thread-1",
        filters: [{ extensions: ["md", ".png"] }],
        upload,
      }),
    ).resolves.toEqual(["/remote/one.md", "/remote/two.png"]);

    expect(accept).toBe(".md,.png");
    expect(upload).toHaveBeenCalledTimes(2);
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("returns null when the picker is cancelled", async () => {
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(
      function (this: HTMLInputElement) {
        this.dispatchEvent(new Event("cancel"));
      },
    );
    const upload = vi.fn<() => Promise<string>>(async () => "/unused");

    await expect(
      pickAndUploadBrowserFiles({
        attachmentThreadId: "thread-1",
        upload,
      }),
    ).resolves.toBeNull();
    expect(upload).not.toHaveBeenCalled();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("cleans up a dismissed picker when the browser never fires cancel", async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined);
    const upload = vi.fn<() => Promise<string>>(async () => "/unused");
    const picked = pickAndUploadBrowserFiles({ attachmentThreadId: "thread-1", upload });
    expect(document.querySelector('input[type="file"]')).not.toBeNull();

    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(PICKER_CANCEL_FALLBACK_MS);

    await expect(picked).resolves.toBeNull();
    expect(upload).not.toHaveBeenCalled();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("waits for change when files are selected before the window refocuses", async () => {
    vi.useFakeTimers();
    let picker: HTMLInputElement | undefined;
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(
      function (this: HTMLInputElement) {
        picker = this;
      },
    );
    const upload = vi.fn<(input: { fileName: string }) => Promise<string>>(
      async ({ fileName }) => `/remote/${fileName}`,
    );
    const picked = pickAndUploadBrowserFiles({ attachmentThreadId: "thread-1", upload });
    Object.defineProperty(picker, "files", {
      configurable: true,
      value: [new File(["late"], "late.txt")],
    });

    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(PICKER_CANCEL_FALLBACK_MS * 2);
    expect(picker?.isConnected).toBe(true);
    picker?.dispatchEvent(new Event("change"));

    await expect(picked).resolves.toEqual(["/remote/late.txt"]);
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});
