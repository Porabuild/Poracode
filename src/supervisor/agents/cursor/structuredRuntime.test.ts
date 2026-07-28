import { describe, expect, it } from "vitest";
import type { SessionRef } from "@/shared/contracts";
import {
  cursorSdkConfiguredPath,
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

describe("cursorSdkConfiguredPath", () => {
  it("trims native paths and ignores a blank setting", () => {
    expect(
      cursorSdkConfiguredPath(
        { sdkPackagePath: "  /opt/node_modules/@cursor/sdk  " },
        { kind: "posix", path: "/repo" },
      ),
    ).toBe("/opt/node_modules/@cursor/sdk");
    expect(
      cursorSdkConfiguredPath({ sdkPackagePath: "  " }, { kind: "posix", path: "/repo" }),
    ).toBeUndefined();
  });

  it("maps a same-distro WSL UNC path but preserves native Linux paths", () => {
    const location = {
      kind: "wsl" as const,
      distro: "Ubuntu",
      linuxPath: "/home/demo/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\repo",
    };
    expect(
      cursorSdkConfiguredPath(
        { sdkPackagePath: "\\\\wsl.localhost\\Ubuntu\\opt\\cursor-sdk" },
        location,
      ),
    ).toBe("/opt/cursor-sdk");
    expect(cursorSdkConfiguredPath({ sdkPackagePath: "/opt/cursor-sdk" }, location)).toBe(
      "/opt/cursor-sdk",
    );
  });

  it("does not reinterpret a UNC path for another distro", () => {
    const configured = "\\\\wsl.localhost\\Debian\\opt\\cursor-sdk";
    expect(
      cursorSdkConfiguredPath(
        { sdkPackagePath: configured },
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/repo",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
        },
      ),
    ).toBe(configured);
  });
});
