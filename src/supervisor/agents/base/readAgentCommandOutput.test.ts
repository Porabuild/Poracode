import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";

const readCommandOutputAsyncMock = vi.hoisted(() =>
  vi.fn<
    (
      command: string,
      args: string[],
      options?: { cwd?: string; env?: Record<string, string>; timeout?: number },
    ) => Promise<{ ok: boolean; stdout: string; stderr: string }>
  >(),
);

vi.mock("./processRuntime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./processRuntime")>();
  return {
    ...actual,
    readCommandOutputAsync: readCommandOutputAsyncMock,
  };
});

import { readAgentCommandOutput } from "./index";

const WINDOWS_LOCATION: ProjectLocation = {
  kind: "windows",
  path: "C:\\repo",
};

describe("readAgentCommandOutput", () => {
  beforeEach(() => {
    readCommandOutputAsyncMock.mockReset();
    readCommandOutputAsyncMock.mockResolvedValue({ ok: true, stdout: "", stderr: "" });
  });

  it("forwards timeoutMs to native readCommandOutputAsync", async () => {
    await readAgentCommandOutput(WINDOWS_LOCATION, "cursor-agent", ["update"], {
      timeoutMs: 300_000,
    });

    expect(readCommandOutputAsyncMock).toHaveBeenCalledOnce();
    expect(readCommandOutputAsyncMock.mock.calls[0]?.[2]?.timeout).toBe(300_000);
  });

  it("does not set a timeout when timeoutMs is omitted", async () => {
    await readAgentCommandOutput(WINDOWS_LOCATION, "cursor-agent", ["--version"]);

    expect(readCommandOutputAsyncMock).toHaveBeenCalledOnce();
    expect(readCommandOutputAsyncMock.mock.calls[0]?.[2]?.timeout).toBeUndefined();
  });
});
