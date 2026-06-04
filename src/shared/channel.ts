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
  return channel === "nightly" ? "Lightcode Nightly" : "Lightcode";
}

export function appIdFor(channel: LightcodeChannel): string {
  return channel === "nightly" ? "com.lightcode.app.nightly" : "com.lightcode.app";
}

export function userDataDirNameFor(channel: LightcodeChannel): string {
  return channel === "nightly" ? ".lightcode-nightly" : ".lightcode";
}

export function updaterChannelFor(channel: LightcodeChannel): string | undefined {
  return channel === "nightly" ? "nightly" : undefined;
}

export function artifactPrefixFor(channel: LightcodeChannel): string {
  return channel === "nightly" ? "Lightcode-Nightly" : "Lightcode";
}

export function normalizeAppleTeamId(teamId: string | undefined | null): string | null {
  const normalized = (teamId ?? "").trim().replace(/\.+$/, "");
  return /^[A-Z0-9]{10}$/.test(normalized) ? normalized : null;
}

// The keychain access group must be byte-identical between the entitlements
// plist embedded at sign time (scripts/build-desktop-artifact.mjs) and the
// value passed to app.configureWebAuthn at runtime (src/main/browser/webauthn.ts),
// or macOS platform passkeys silently fail. Keep it single-sourced here.
export function webAuthnKeychainAccessGroupFor(
  teamId: string | undefined | null,
  channel: LightcodeChannel,
): string | null {
  const normalizedTeamId = normalizeAppleTeamId(teamId);
  return normalizedTeamId ? `${normalizedTeamId}.${appIdFor(channel)}.webauthn` : null;
}
