import { z } from "zod";

// A deployed helper boundary, independent of the remote protocol. A changed
// package, client adaptation or layout invalidates the disposable artifact.
// Artifact 2 omits macOS native simulator payloads on other platforms.
export const DEVICE_HUB_ARTIFACT_VERSION = 2 as const;
export const DEVICE_HUB_CLIENT_ADAPTER_VERSION = 1 as const;
export const DEVICE_HUB_VERSION = "0.15.3";
export const DEVICE_HUB_CLIENT_VERSION = "1.5.0";
export const DEVICE_HUB_SOURCE_COMMIT = "42918bc8e66021da5a983aaa09b43365e58c3dce";
export const DEVICE_HUB_PACKAGE_INTEGRITY =
  "sha512-fM3qIT9akHUgL20ejtjpelZPk7lzUursyb0G1bcNCiYeJXXqC0q4WwBUmg6OkSppVFk/0axZVIhSuhNoAv01xw==";
export const DEVICE_HUB_CLIENT_INTEGRITY =
  "sha512-viMiTybFWoxNShOw0C/78Ky479Hhl+cKysNv0ZPUN+F8n8lI8ECTFs+CCKQA3LI8En/ASFIuaaunD+1JUk6ipw==";
export const DEVICE_HUB_CLIENT_PATCH_SHA256 =
  "4ce62299dbaf6ee08233da9df25a5bdb7054e9fa798834a9d925cf866c14800a";
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
  "a94853e492a024f85e985ee1e5f5c3059026cfa2bd05df7a62cb73a138a42961";
export const DEVICE_HUB_NATIVE_MODULE_SHA256 =
  "52723d4e46c7e3189661aa53a5c0b96e86e8af1327ed6e4828b59f3cef6e9a16";
export const DEVICE_HUB_NATIVE_PATCH_SHA256 =
  "f0926cbcefa2af037470e7b7c2f609a97cf2d650a1e679c0ccc34ea874b4f5c5";
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
}[] = [{ platform: "win32", arch: "x64", runtimeAbi: "149", platforms: ["android"] }];

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
