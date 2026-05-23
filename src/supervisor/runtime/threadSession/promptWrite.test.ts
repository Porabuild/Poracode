import { afterEach, describe, expect, it, vi } from "vitest";
import { writeSubmittedPrompt } from "./promptWrite";

describe("writeSubmittedPrompt", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes direct-input chunks sequentially with delays between them", async () => {
    vi.useFakeTimers();
    const write = vi.fn<(data: string) => void>();

    const pending = writeSubmittedPrompt({ write }, ["h", "i", "\r"], {
      kind: "posix",
      path: "/tmp/project",
    });

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenNthCalledWith(1, "h");

    await vi.advanceTimersByTimeAsync(24);
    await pending;

    expect(write).toHaveBeenCalledTimes(3);
    expect(write).toHaveBeenNthCalledWith(2, "i");
    expect(write).toHaveBeenNthCalledWith(3, "\r");
  });

  it("preserves inner newlines on posix so the prompt is not submitted mid-stream", async () => {
    vi.useFakeTimers();
    const write = vi.fn<(data: string) => void>();

    const pending = writeSubmittedPrompt({ write }, ["hi\n\n@/tmp/file ", "\r"], {
      kind: "posix",
      path: "/tmp/project",
    });

    await vi.advanceTimersByTimeAsync(16);
    await pending;

    expect(write).toHaveBeenNthCalledWith(1, "hi\n\n@/tmp/file ");
    expect(write).toHaveBeenNthCalledWith(2, "\r");
  });

  it("passes chunks through unchanged on Windows", async () => {
    vi.useFakeTimers();
    const write = vi.fn<(data: string) => void>();

    const pending = writeSubmittedPrompt({ write }, ["hi\n\n@C:/tmp/file ", "\r"], {
      kind: "windows",
      path: "C:/tmp/project",
    });

    await vi.advanceTimersByTimeAsync(16);
    await pending;

    expect(write).toHaveBeenNthCalledWith(1, "hi\n\n@C:/tmp/file ");
    expect(write).toHaveBeenNthCalledWith(2, "\r");
  });
});
