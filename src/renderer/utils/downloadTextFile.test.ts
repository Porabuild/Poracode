import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadTextFile } from "./downloadTextFile";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("text file downloads", () => {
  it("uses the requested file and type and revokes the URL after Chromium starts the download", () => {
    vi.useFakeTimers();
    const create = vi.fn<(blob: Blob) => string>(() => "blob:test");
    const revoke = vi.fn<(url: string) => void>();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });
    let clicked: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      function (this: HTMLAnchorElement) {
        clicked = this;
      },
    );
    downloadTextFile("palette.json", "{}", "application/json");
    expect(clicked?.download).toBe("palette.json");
    expect(clicked?.href).toBe("blob:test");
    expect(create.mock.calls[0]![0].type).toBe("application/json");
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledWith("blob:test");
  });
});
