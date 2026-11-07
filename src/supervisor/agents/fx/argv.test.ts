import { describe, expect, it } from "vitest";
import type { ThreadConfig } from "@/shared/contracts";
import { buildFxArgs, buildFxLaunchEnv, fxPermissionModeFor } from "./argv";

describe("fxPermissionModeFor", () => {
  it("maps full-bypass policies to full-access", () => {
    for (const policy of ["bypassPermissions", "yolo", "never", "dontAsk", "full-access"]) {
      expect(fxPermissionModeFor(policy)).toBe("full-access");
    }
  });

  it("maps ask through and everything else to auto", () => {
    expect(fxPermissionModeFor("ask")).toBe("ask");
    expect(fxPermissionModeFor("auto")).toBe("auto");
    expect(fxPermissionModeFor("default")).toBe("auto");
    expect(fxPermissionModeFor(undefined)).toBe("auto");
  });
});

describe("buildFxLaunchEnv", () => {
  it("puts the resolved permission mode in the spawn env", () => {
    expect(buildFxLaunchEnv({ model: "", approvalPolicy: "bypassPermissions" })).toEqual({
      FX_PERMISSION_MODE: "full-access",
    });
    expect(buildFxLaunchEnv({ model: "", approvalPolicy: "ask" })).toEqual({
      FX_PERMISSION_MODE: "ask",
    });
    expect(buildFxLaunchEnv({ model: "" })).toEqual({ FX_PERMISSION_MODE: "auto" });
  });
});

describe("buildFxArgs", () => {
  const base: ThreadConfig = { model: "spacexai/grok-4.7", effort: "auto" };

  it("puts --resume <id> last, after model/effort/fast", () => {
    expect(buildFxArgs({ ...base, fast: true }, "iHHa9odhGUbU")).toEqual([
      "--model",
      "spacexai/grok-4.7",
      "--effort",
      "auto",
      "--fast",
      "--resume",
      "iHHa9odhGUbU",
    ]);
    expect(buildFxArgs({ ...base, fast: false }, "-eSRLyehg4Kg").slice(-2)).toEqual([
      "--resume",
      "-eSRLyehg4Kg",
    ]);
  });

  it("emits --no-fast for an explicit false", () => {
    expect(buildFxArgs({ ...base, fast: false })).toEqual([
      "--model",
      "spacexai/grok-4.7",
      "--effort",
      "auto",
      "--no-fast",
    ]);
  });

  it("omits model, effort, and fast when unset", () => {
    expect(buildFxArgs({ model: "" })).toEqual([]);
    expect(buildFxArgs({ model: "", effort: "" })).toEqual([]);
  });
});
