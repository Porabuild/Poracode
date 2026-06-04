import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  appIdFor,
  artifactPrefixFor,
  LIGHTCODE_CHANNELS,
  normalizeAppleTeamId,
  productNameFor,
  updaterChannelFor,
  userDataDirNameFor,
  webAuthnKeychainAccessGroupFor,
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
  normalizeAppleTeamId: (teamId: string | undefined | null) => string | null;
  webAuthnKeychainAccessGroupFor: (
    teamId: string | undefined | null,
    channel: string,
  ) => string | null;
};

const APPLE_TEAM_ID_SAMPLES = ["ABCDE12345", "ABCDE12345.", "", "team", undefined];

describe("electron-builder.shared.cjs mirrors src/shared/channel.ts", () => {
  it("exposes the same channel list", () => {
    expect([...cjs.CHANNELS]).toEqual([...LIGHTCODE_CHANNELS]);
  });

  for (const channel of LIGHTCODE_CHANNELS) {
    it(`agrees on every value for "${channel}"`, () => {
      expect(cjs.productNameFor(channel)).toBe(productNameFor(channel));
      expect(cjs.appIdFor(channel)).toBe(appIdFor(channel));
      expect(cjs.userDataDirNameFor(channel)).toBe(userDataDirNameFor(channel));
      expect(cjs.updaterChannelFor(channel)).toBe(updaterChannelFor(channel));
      expect(cjs.artifactPrefixFor(channel)).toBe(artifactPrefixFor(channel));
      for (const teamId of APPLE_TEAM_ID_SAMPLES) {
        expect(cjs.webAuthnKeychainAccessGroupFor(teamId, channel)).toBe(
          webAuthnKeychainAccessGroupFor(teamId, channel),
        );
      }
    });
  }

  it("agrees on Apple team id normalization", () => {
    for (const teamId of APPLE_TEAM_ID_SAMPLES) {
      expect(cjs.normalizeAppleTeamId(teamId)).toBe(normalizeAppleTeamId(teamId));
    }
  });

  it("normalizes any unknown value to stable", () => {
    expect(cjs.normalizeChannel("nightly")).toBe("nightly");
    expect(cjs.normalizeChannel("stable")).toBe("stable");
    expect(cjs.normalizeChannel(undefined)).toBe("stable");
    expect(cjs.normalizeChannel("beta")).toBe("stable");
  });
});
