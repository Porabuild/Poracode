export type LightcodeChannel = "stable" | "nightly";

export const LIGHTCODE_CHANNELS: readonly LightcodeChannel[] = ["stable", "nightly"];

declare const __LIGHTCODE_CHANNEL__: string | undefined;

export function normalizeChannel(value: unknown): LightcodeChannel {
  return value === "nightly" ? "nightly" : "stable";
}

export function resolveLightcodeChannel(): LightcodeChannel {
  return normalizeChannel(typeof __LIGHTCODE_CHANNEL__ === "string" ? __LIGHTCODE_CHANNEL__ : "");
}

export function productNameFor(channel: LightcodeChannel): string {
  return channel === "nightly" ? "Poracode Nightly" : "Poracode";
}

export function appIdFor(channel: LightcodeChannel): string {
  return channel === "nightly" ? "com.poracode.app.nightly" : "com.poracode.app";
}

export function userDataDirNameFor(channel: LightcodeChannel): string {
  return channel === "nightly" ? ".poracode-nightly" : ".poracode";
}

export function updaterChannelFor(channel: LightcodeChannel): string | undefined {
  return channel === "nightly" ? "nightly" : undefined;
}

export function artifactPrefixFor(channel: LightcodeChannel): string {
  return channel === "nightly" ? "Poracode-Nightly" : "Poracode";
}
