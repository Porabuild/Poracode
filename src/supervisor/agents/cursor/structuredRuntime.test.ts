import { describe, expect, it } from "vitest";
import type { SessionRef } from "@/shared/contracts";
import {
  configuredCursorStructuredRuntime,
  cursorSdkSessionId,
  resolveCursorStructuredRuntime,
} from "./structuredRuntime";

function ref(providerSessionId: string): SessionRef {
  return { providerSessionId, discoveredAt: "2026-07-27T00:00:00.000Z" };
}

describe("configuredCursorStructuredRuntime", () => {
  it("keeps ACP as the backwards-compatible default", () => {
    expect(configuredCursorStructuredRuntime(undefined)).toBe("acp");
    expect(configuredCursorStructuredRuntime({ structuredRuntime: "unknown" })).toBe("acp");
  });

  it("accepts SDK mode", () => {
    expect(configuredCursorStructuredRuntime({ structuredRuntime: "sdk" })).toBe("sdk");
  });
});

describe("resolveCursorStructuredRuntime", () => {
  it("uses the selected runtime for a fresh thread", () => {
    expect(resolveCursorStructuredRuntime({ structuredRuntime: "sdk" }, undefined)).toEqual({
      runtime: "sdk",
    });
  });

  it("pins SDK resumes independently of the new default", () => {
    expect(
      resolveCursorStructuredRuntime({ structuredRuntime: "acp" }, ref("sdk:agent-1")),
    ).toEqual({ runtime: "sdk", providerSessionId: "agent-1" });
  });

  it("treats historical unprefixed session ids as ACP", () => {
    expect(
      resolveCursorStructuredRuntime({ structuredRuntime: "sdk" }, ref("legacy-acp-id")),
    ).toEqual({
      runtime: "acp",
      providerSessionId: "legacy-acp-id",
    });
  });
});

describe("runtime-prefixed Cursor session ids", () => {
  it("prefixes each runtime id exactly once", () => {
    expect(cursorSdkSessionId("agent-1")).toBe("sdk:agent-1");
    expect(cursorSdkSessionId("sdk:agent-1")).toBe("sdk:agent-1");
  });
});
