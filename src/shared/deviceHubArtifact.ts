import { z } from "zod";

// A deployed helper boundary, independent of the remote protocol. A changed
// package, client adaptation or layout invalidates the disposable artifact.
// Artifact 3 omits additional macOS native simulator payloads (`capability-loader`,
// `simax`, `simpb`) on other platforms alongside `bin`, `native`, and `simcam`.
export const DEVICE_HUB_ARTIFACT_VERSION = 3 as const;
// Adapter 3 updates the maintained transport/view-only patch for @expo/hub-client 1.12.2
// (async input-socket open, skipping exec-ws/appstate under custom transport, host status overlay).
export const DEVICE_HUB_CLIENT_ADAPTER_VERSION = 3 as const;
export const DEVICE_HUB_VERSION = "0.23.2";
export const DEVICE_HUB_CLIENT_VERSION = "1.12.2";
export const DEVICE_HUB_SOURCE_COMMIT = "469524564f7d31c9450d0bd50b1c83d2b3c745b8";
export const DEVICE_HUB_PACKAGE_INTEGRITY =
  "sha512-j96m6mWj0w++zGWkMEpDidvFTwT8Pj7aUMtWlfPYrpvqsANZI8D/1ee2I7f2+sshFfvxYsclrrfuN2vJjLcBig==";
export const DEVICE_HUB_CLIENT_INTEGRITY =
  "sha512-cs27+un0dh63lJUybm/wlepF6D9BN1qFRwnj80Ju+RPi4TLp3uKX5MCIS4nnLYlbTIHM+M0M/DOPo7i280fPsg==";
export const DEVICE_HUB_CLIENT_PATCH_SHA256 =
  "70ef1cce3e419488f9c99007e2e97c221fe007636e15509b35ccd0f39e6629be";
export const DEVICE_HUB_ENTRY = "node_modules/expo-device-hub/dist/server/cli.mjs";
export const DEVICE_HUB_BOOTSTRAP = "bootstrap.mjs";
export const DEVICE_HUB_LOCKFILE = "package-lock.json";
export const DEVICE_HUB_SCRCPY_VERSION = "4.0";
export const DEVICE_HUB_SCRCPY_SHA256 =
  "84924bd564a1eb6089c872c7521f968058977f91f5ff02514a8c74aff3210f3a";
export const DEVICE_HUB_SCRCPY_PATH =
  "node_modules/expo-device-hub/vendor/serve-emu/vendor/scrcpy-server-v4.0";
// Native patch1 changes only JAR integrity admission. The files closure carries
// the receipt; pre-patch artifacts are refused intact.
export const DEVICE_HUB_NATIVE_PATCH_VERSION = 1 as const;
export const DEVICE_HUB_NATIVE_MODULE_PATH =
  "node_modules/expo-device-hub/vendor/serve-emu/dist/scrcpy.js";
export const DEVICE_HUB_NATIVE_UPSTREAM_SHA256 =
  "7517679c3e0972c8d701f760382fd97d2f1ad01f7bd467f225cb511d94b36932";
export const DEVICE_HUB_NATIVE_MODULE_SHA256 =
  "9bb3c2845e164a01582266b8eb65037032648079dc420d56971389c69a76079c";
export const DEVICE_HUB_NATIVE_PATCH_SHA256 =
  "1ea96cf1bbd5ec2641579ce1a922abaf12ab987d6d09f2b3a9ed725cf5191935";
export const DEVICE_HUB_NATIVE_RECEIPT_PATH = "poracode-native-patch-v1.json";
export const DEVICE_HUB_NATIVE_PATCH_RECEIPT = {
  version: DEVICE_HUB_NATIVE_PATCH_VERSION,
  hubVersion: DEVICE_HUB_VERSION,
  upstreamModuleSha256: DEVICE_HUB_NATIVE_UPSTREAM_SHA256,
  patchSha256: DEVICE_HUB_NATIVE_PATCH_SHA256,
  moduleSha256: DEVICE_HUB_NATIVE_MODULE_SHA256,
} as const;

// Added only after the exact helper/client/runtime ABI is qualified on that
// native host. A Windows run cannot qualify CoreSimulator or another ABI.
export const DEVICE_HUB_QUALIFIED_TARGETS: readonly {
  platform: string;
  arch: string;
  runtimeAbi: string;
  platforms: readonly ("android" | "ios")[];
}[] = [
  { platform: "win32", arch: "x64", runtimeAbi: "149", platforms: ["android"] },
  // serve-sim from the pinned hub is verified on Apple-silicon macOS against
  // CoreSimulator, including the foldable hinge channel.
  { platform: "darwin", arch: "arm64", runtimeAbi: "149", platforms: ["ios"] },
];

const relativeFile = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !/[\\:\0]/u.test(value) &&
      value.split("/").every((part) => part !== "" && part !== "." && part !== ".."),
  );

export const deviceHubArtifactSchema = z.strictObject({
  version: z.literal(DEVICE_HUB_ARTIFACT_VERSION),
  adapterVersion: z.literal(DEVICE_HUB_CLIENT_ADAPTER_VERSION),
  hubVersion: z.literal(DEVICE_HUB_VERSION),
  clientVersion: z.literal(DEVICE_HUB_CLIENT_VERSION),
  sourceCommit: z.literal(DEVICE_HUB_SOURCE_COMMIT),
  packageIntegrity: z.literal(DEVICE_HUB_PACKAGE_INTEGRITY),
  clientIntegrity: z.literal(DEVICE_HUB_CLIENT_INTEGRITY),
  clientPatchSha256: z.literal(DEVICE_HUB_CLIENT_PATCH_SHA256),
  scrcpyVersion: z.literal(DEVICE_HUB_SCRCPY_VERSION),
  scrcpySha256: z.literal(DEVICE_HUB_SCRCPY_SHA256),
  platform: z.enum(["win32", "darwin", "linux"]),
  arch: z.enum(["x64", "arm64"]),
  runtimeAbi: z.string().min(1).max(20),
  qualifiedPlatforms: z.array(z.enum(["android", "ios"])).max(2),
  entry: z.literal(DEVICE_HUB_ENTRY),
  files: z
    .array(z.strictObject({ path: relativeFile, sha256: z.string().regex(/^[a-f0-9]{64}$/u) }))
    .min(1)
    .max(16_384),
});
export type DeviceHubArtifactManifest = z.infer<typeof deviceHubArtifactSchema>;
