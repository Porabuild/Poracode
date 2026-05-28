import { describe, expect, it } from "vitest";
import { claudeCapabilitiesFromCliVersion, win32PathToWslMount } from "./probe";

describe("claudeCapabilitiesFromCliVersion", () => {
  it("hides Opus 4.7 and 4.8 when CLI is below 2.1.111", () => {
    const p = claudeCapabilitiesFromCliVersion("2.1.110");
    expect(p?.models?.map((m) => m.id)).not.toContain("claude-opus-4-7");
    expect(p?.models?.map((m) => m.id)).not.toContain("claude-opus-4-8");
    expect(p?.modelEfforts && "claude-opus-4-7" in p.modelEfforts).toBe(false);
    expect(p?.models?.map((m) => m.id)).toContain("claude-opus-4-6");
  });

  it("hides only Opus 4.8 when CLI supports Opus 4.7 but not 4.8", () => {
    const p = claudeCapabilitiesFromCliVersion("2.1.153");
    expect(p?.models?.map((m) => m.id)).toContain("claude-opus-4-7");
    expect(p?.models?.map((m) => m.id)).toContain("claude-opus-4-6");
    expect(p?.models?.map((m) => m.id)).not.toContain("claude-opus-4-8");
  });

  it("returns undefined when CLI supports Opus 4.8", () => {
    expect(claudeCapabilitiesFromCliVersion("2.1.154")).toBeUndefined();
    expect(claudeCapabilitiesFromCliVersion("3.0.0")).toBeUndefined();
  });

  it("returns undefined when version is missing or unparsable", () => {
    expect(claudeCapabilitiesFromCliVersion(undefined)).toBeUndefined();
    expect(claudeCapabilitiesFromCliVersion("")).toBeUndefined();
    expect(claudeCapabilitiesFromCliVersion("not-a-semver")).toBeUndefined();
  });
});

describe("win32PathToWslMount", () => {
  it("maps drive letters to /mnt", () => {
    expect(win32PathToWslMount("C:\\Users\\x\\app\\worker.mjs")).toBe(
      "/mnt/c/Users/x/app/worker.mjs",
    );
  });

  it("maps wsl.localhost UNC paths", () => {
    expect(win32PathToWslMount("//wsl.localhost/Ubuntu/home/u/w.mjs")).toBe("/home/u/w.mjs");
  });
});
