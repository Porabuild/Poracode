import { describe, expect, it } from "vitest";
import {
  hasKimiCredential,
  hasKimiOAuthCredential,
  kimiDefaultCapabilities,
  kimiDetectionSpec,
} from "./detection";

describe("hasKimiCredential", () => {
  it("detects a non-empty api_key under [providers.*]", () => {
    const toml = ["[providers.moonshot]", 'api_key = "sk-real-value"'].join("\n");
    expect(hasKimiCredential(toml)).toBe(true);
  });

  it("detects an oauth sub-table", () => {
    const toml = ["[providers.moonshot.oauth]", 'access_token = "tok-123"'].join("\n");
    expect(hasKimiCredential(toml)).toBe(true);
  });

  it("detects an inline oauth table with a value", () => {
    const toml = '[providers.moonshot]\noauth = { access_token = "tok-123" }';
    expect(hasKimiCredential(toml)).toBe(true);
  });

  it("does not treat a managed OAuth storage reference as a live credential", () => {
    const toml = [
      '[providers."managed:kimi-code"]',
      'api_key = "oauth-placeholder"',
      '[providers."managed:kimi-code".oauth]',
      'storage = "file"',
      'key = "kimi-code"',
    ].join("\n");
    expect(hasKimiCredential(toml)).toBe(false);
  });

  it("returns false for a config with no credentials", () => {
    const toml = ["[settings]", 'theme = "dark"', "", "[providers.moonshot]"].join("\n");
    expect(hasKimiCredential(toml)).toBe(false);
  });

  it("returns false for an empty api_key", () => {
    expect(hasKimiCredential('[providers.moonshot]\napi_key = ""')).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(hasKimiCredential("")).toBe(false);
  });
});

describe("hasKimiOAuthCredential", () => {
  it("detects Kimi's persisted OAuth token", () => {
    expect(hasKimiOAuthCredential('{"access_token":"tok-123"}')).toBe(true);
  });

  it("rejects missing or malformed token data", () => {
    expect(hasKimiOAuthCredential("{}")).toBe(false);
    expect(hasKimiOAuthCredential("not-json")).toBe(false);
  });
});

describe("kimiDetectionSpec", () => {
  it("builds login commands from the detected executable path", () => {
    expect(kimiDetectionSpec.kind).toBe("kimi");
    expect(kimiDetectionSpec.label).toBe("Kimi Code");
    expect(kimiDetectionSpec.binary).toBe("kimi");
    expect(typeof kimiDetectionSpec.loginCommand).toBe("function");
    if (typeof kimiDetectionSpec.loginCommand !== "function") return;
    expect(
      kimiDetectionSpec.loginCommand({
        location: { kind: "windows", path: "C:\\repo" },
        executablePath: "C:\\Users\\demo\\.kimi-code\\bin\\kimi.exe",
      }),
    ).toBe("& 'C:\\Users\\demo\\.kimi-code\\bin\\kimi.exe' login");
    expect(
      kimiDetectionSpec.loginCommand({
        location: {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/demo/repo",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\repo",
        },
        executablePath: "/home/demo/.kimi-code/bin/kimi",
      }),
    ).toBe("'/home/demo/.kimi-code/bin/kimi' login");
  });

  it("ships both the built-in updater and the npm package", () => {
    expect(kimiDetectionSpec.update?.builtIn).toEqual({ binary: "kimi", args: ["upgrade"] });
    expect(kimiDetectionSpec.update?.npm).toBe("@moonshot-ai/kimi-code");
  });

  it("reports credential state through the capabilities probe", () => {
    expect(kimiDetectionSpec.authProbes).toBeUndefined();
    expect(typeof kimiDetectionSpec.capabilitiesProbe).toBe("function");
  });
});

describe("kimiDefaultCapabilities", () => {
  it("advertises manual/auto/yolo approval policies with a yolo bypass posture", () => {
    expect(kimiDefaultCapabilities.approvalPolicies?.map((p) => p.id)).toEqual([
      "default",
      "auto",
      "yolo",
    ]);
    expect(kimiDefaultCapabilities.bypassPermissions).toEqual({ approvalPolicy: "yolo" });
    expect(kimiDefaultCapabilities.defaultApprovalPolicy).toBe("default");
  });

  it("supports both terminal and GUI presentation", () => {
    expect(kimiDefaultCapabilities.presentationModes).toEqual(["terminal", "gui"]);
    expect(kimiDefaultCapabilities.modes).toEqual(["agent", "plan"]);
  });
});
