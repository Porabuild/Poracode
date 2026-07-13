import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appIdFor,
  artifactPrefixFor,
  PORACODE_CHANNELS,
  productNameFor,
  updaterChannelFor,
  userDataDirNameFor,
} from "./channel";

describe("channel", () => {
  it("enumerates exactly stable and nightly", () => {
    expect(PORACODE_CHANNELS).toEqual(["stable", "nightly"]);
  });

  it("returns the right product names", () => {
    expect(productNameFor("stable")).toBe("Poracode");
    expect(productNameFor("nightly")).toBe("Poracode Nightly");
  });

  it("returns the right app ids", () => {
    expect(appIdFor("stable")).toBe("com.lightcode.app");
    expect(appIdFor("nightly")).toBe("com.lightcode.app.nightly");
  });

  it("returns the right user data dir names", () => {
    expect(userDataDirNameFor("stable")).toBe(".poracode");
    expect(userDataDirNameFor("nightly")).toBe(".poracode-nightly");
  });

  it("only returns a published channel name for nightly", () => {
    expect(updaterChannelFor("stable")).toBeUndefined();
    expect(updaterChannelFor("nightly")).toBe("nightly");
  });

  it("returns artifact prefixes that are distinct between channels", () => {
    expect(artifactPrefixFor("stable")).toBe("Poracode");
    expect(artifactPrefixFor("nightly")).toBe("Poracode-Nightly");
    expect(artifactPrefixFor("stable")).not.toBe(artifactPrefixFor("nightly"));
  });
});

describe("resolvePoracodeChannel", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("defaults to stable when __PORACODE_CHANNEL__ is unset", async () => {
    vi.resetModules();
    const mod = await import("./channel");
    expect(mod.resolvePoracodeChannel()).toBe("stable");
  });

  it("returns nightly when the build-time constant is 'nightly'", async () => {
    vi.resetModules();
    vi.stubGlobal("__PORACODE_CHANNEL__", "nightly");
    const mod = await import("./channel");
    expect(mod.resolvePoracodeChannel()).toBe("nightly");
    vi.unstubAllGlobals();
  });

  it("falls back to stable for any unknown value", async () => {
    vi.resetModules();
    vi.stubGlobal("__PORACODE_CHANNEL__", "beta");
    const mod = await import("./channel");
    expect(mod.resolvePoracodeChannel()).toBe("stable");
    vi.unstubAllGlobals();
  });
});
