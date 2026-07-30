import { describe, expect, it, vi } from "vitest";
import { handleSupervisorIpcFailure } from "./ipcFailure";

describe("handleSupervisorIpcFailure", () => {
  it("preserves the caller rejection while reporting the original failure for classification", () => {
    const error = new Error("Unknown thread session: caller-visible-id");
    const capture = vi.fn<(error: unknown, operation: string) => void>();

    expect(handleSupervisorIpcFailure(error, "writeTerminal", "request-1", capture)).toEqual({
      replyTo: "request-1",
      ok: false,
      error: "Unknown thread session: caller-visible-id",
    });
    expect(capture).toHaveBeenCalledExactlyOnceWith(error, "writeTerminal");
  });

  it("keeps non-Error rejection text unchanged for the caller", () => {
    expect(
      handleSupervisorIpcFailure(
        "rejected",
        "startThread",
        "request-2",
        vi.fn<(error: unknown, operation: string) => void>(),
      ),
    ).toEqual({
      replyTo: "request-2",
      ok: false,
      error: "rejected",
    });
  });
});
