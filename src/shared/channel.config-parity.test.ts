import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  appIdFor,
  artifactPrefixFor,
  PORACODE_CHANNELS,
  productNameFor,
  updaterChannelFor,
  userDataDirNameFor,
} from "./channel";

const requireFromHere = createRequire(import.meta.url);
const cjs = requireFromHere("../../scripts/electron-builder.shared.cjs") as {
  CHANNELS: readonly string[];
  normalizeChannel: (v: unknown) => string;
  productNameFor: (channel: string) => string;
  appIdFor: (channel: string) => string;
  userDataDirNameFor: (channel: string) => string;
  updaterChannelFor: (channel: string) => string | undefined;
  artifactPrefixFor: (channel: string) => string;
};

describe("electron-builder.shared.cjs mirrors src/shared/channel.ts", () => {
  it("exposes the same channel list", () => {
    expect([...cjs.CHANNELS]).toEqual([...PORACODE_CHANNELS]);
  });

  for (const channel of PORACODE_CHANNELS) {
    it(`agrees on every value for "${channel}"`, () => {
      expect(cjs.productNameFor(channel)).toBe(productNameFor(channel));
      expect(cjs.appIdFor(channel)).toBe(appIdFor(channel));
      expect(cjs.userDataDirNameFor(channel)).toBe(userDataDirNameFor(channel));
      expect(cjs.updaterChannelFor(channel)).toBe(updaterChannelFor(channel));
      expect(cjs.artifactPrefixFor(channel)).toBe(artifactPrefixFor(channel));
    });
  }

  it("normalizes any unknown value to stable", () => {
    expect(cjs.normalizeChannel("nightly")).toBe("nightly");
    expect(cjs.normalizeChannel("stable")).toBe("stable");
    expect(cjs.normalizeChannel(undefined)).toBe("stable");
    expect(cjs.normalizeChannel("beta")).toBe("stable");
  });
});
