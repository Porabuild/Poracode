import { describe, expect, it, vi } from "vitest";
import {
  HOST_RESOURCE_BUSY_CODE,
  HOST_RESOURCE_POLICY_UNAVAILABLE_CODE,
} from "@/shared/hostResourceAdmission";
import {
  HostResourceBusyError,
  HostResourcePolicyUnavailableError,
} from "./runtime/hostResourceAdmission";
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

  it("carries the typed busy code and retry hint additively", () => {
    const error = new HostResourceBusyError({
      resourceClass: "agent-session",
      limit: 1,
      active: 1,
      pending: 0,
      retiring: 0,
      retryAfterMs: 1_000,
    });
    expect(handleSupervisorIpcFailure(error, "startThread", "request-3", () => {})).toEqual({
      replyTo: "request-3",
      ok: false,
      error: error.message,
      errorCode: HOST_RESOURCE_BUSY_CODE,
      retryAfterMs: 1_000,
    });
  });

  it("carries the fail-closed policy code without inventing a retry promise", () => {
    const error = new HostResourcePolicyUnavailableError("host-resource-admission-invalid");
    expect(handleSupervisorIpcFailure(error, "startThread", "request-4", () => {})).toEqual({
      replyTo: "request-4",
      ok: false,
      error: error.message,
      errorCode: HOST_RESOURCE_POLICY_UNAVAILABLE_CODE,
    });
  });
});
