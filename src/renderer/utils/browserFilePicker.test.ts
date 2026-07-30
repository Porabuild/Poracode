import { afterEach, describe, expect, it, vi } from "vitest";
import { pickAndUploadBrowserFiles } from "./browserFilePicker";

describe("pickAndUploadBrowserFiles", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies extension filters and uploads every selected file", async () => {
    let accept = "";
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(
      function (this: HTMLInputElement) {
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
  });
});
