// @vitest-environment node
import { describe, expect, it } from "vitest";
import { RemoteClientError } from "@/shared/remote/client";
import { isSessionActionSeamUnsupported } from "./sessionActionHost";

describe("isSessionActionSeamUnsupported", () => {
  it("classifies only the typed remote old-host answer", () => {
    expect(
      isSessionActionSeamUnsupported(
        new RemoteClientError(
          'Procedure "listThreadSessionActions" is not available to remote clients.',
          403,
          "git_procedure_not_allowed",
        ),
      ),
    ).toBe(true);
    expect(isSessionActionSeamUnsupported(new RemoteClientError("boom", 500, "network"))).toBe(
      false,
    );
    expect(
      isSessionActionSeamUnsupported(new RemoteClientError("nope", 403, "some_other_code")),
    ).toBe(false);
  });

  it("classifies the host-served shim TypeError naming the missing verb", () => {
    expect(
      isSessionActionSeamUnsupported(
        new TypeError("readBridge(...).listThreadSessionActions is not a function"),
      ),
    ).toBe(true);
    expect(
      isSessionActionSeamUnsupported(
        new TypeError("bridge.invokeThreadSessionAction is not a function"),
      ),
    ).toBe(true);
    expect(
      isSessionActionSeamUnsupported(
        new TypeError("Cannot read properties of undefined (reading 'threadId')"),
      ),
    ).toBe(false);
  });

  it("keeps auth and server failures visible even if they carry the old-host code", () => {
    for (const status of [401, 500]) {
      expect(
        isSessionActionSeamUnsupported(
          new RemoteClientError("Request failed", status, "git_procedure_not_allowed"),
        ),
      ).toBe(false);
    }
  });

  it("never classifies ordinary failures as unsupported", () => {
    expect(isSessionActionSeamUnsupported(new Error("socket hang up"))).toBe(false);
    expect(isSessionActionSeamUnsupported(new Error("Failed to fetch"))).toBe(false);
    expect(isSessionActionSeamUnsupported(undefined)).toBe(false);
    expect(isSessionActionSeamUnsupported("listThreadSessionActions is not a function")).toBe(
      false,
    );
  });
});
