export type PoracodeChannel = "stable" | "nightly";

export const PORACODE_CHANNELS: readonly PoracodeChannel[] = ["stable", "nightly"];

declare const __PORACODE_CHANNEL__: string | undefined;

export function normalizeChannel(value: unknown): PoracodeChannel {
  return value === "nightly" ? "nightly" : "stable";
}

export function resolvePoracodeChannel(): PoracodeChannel {
  return normalizeChannel(typeof __PORACODE_CHANNEL__ === "string" ? __PORACODE_CHANNEL__ : "");
}

export function productNameFor(channel: PoracodeChannel): string {
  return channel === "nightly" ? "Poracode Nightly" : "Poracode";
}

export function appIdFor(channel: PoracodeChannel): string {
  // Keep the pre-rebrand install identity so Poracode upgrades the existing
  // Lightcode app and retains OS-owned credentials, permissions, and metadata.
  return channel === "nightly" ? "com.lightcode.app.nightly" : "com.lightcode.app";
}

export function userDataDirNameFor(channel: PoracodeChannel): string {
  return channel === "nightly" ? ".poracode-nightly" : ".poracode";
}

export function updaterChannelFor(channel: PoracodeChannel): string | undefined {
  return channel === "nightly" ? "nightly" : undefined;
}

export function artifactPrefixFor(channel: PoracodeChannel): string {
  return channel === "nightly" ? "Poracode-Nightly" : "Poracode";
}
