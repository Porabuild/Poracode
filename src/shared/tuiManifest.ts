import { z } from "zod";

/**
 * TUI binary distribution manifest (`resources/tui/manifest.json` in the
 * installed layout, `dist/tui/manifest.json` from `bun run tui:build`).
 *
 * The manifest is the trust root for downloaded TUI binaries: it is staged
 * inside the release artifact, so its sha256/size entries are never fetched
 * alongside the binary they pin. Compatibility boundary — see versioning.md.
 */
export const TUI_MANIFEST_FORMAT_VERSION = 1;
export const TUI_MANIFEST_NAME = "manifest.json";

/** Downloaded binary cache marker format (`.poracode-tui.json`). */
export const TUI_CACHE_MARKER_VERSION = 1;
export const TUI_CACHE_MARKER_NAME = ".poracode-tui.json";

export const TUI_TARGETS = [
  "win32-x64",
  "win32-arm64",
  "darwin-x64",
  "darwin-arm64",
  "linux-x64",
  "linux-arm64",
] as const;
export type TuiTarget = (typeof TUI_TARGETS)[number];

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export const tuiManifestAssetSchema = z.strictObject({
  name: z.string().min(1).max(255),
  size: z.number().int().positive(),
  sha256: z.string().regex(SHA256_PATTERN),
});
export type TuiManifestAsset = z.infer<typeof tuiManifestAssetSchema>;

export const tuiManifestSchema = z.strictObject({
  formatVersion: z.literal(TUI_MANIFEST_FORMAT_VERSION),
  appVersion: z.string().min(1),
  // Release download base (e.g. "https://github.com/<repo>/releases/download"),
  // written at manifest generation so the installed artifact carries the repo
  // identity instead of depending on a package.json repository field.
  downloadBaseUrl: z.string().url().optional(),
  assets: z.partialRecord(z.enum(TUI_TARGETS), tuiManifestAssetSchema),
});
export type TuiManifest = z.infer<typeof tuiManifestSchema>;

/** Parsed `.poracode-tui.json` cache marker written after a verified install. */
export const tuiCacheMarkerSchema = z.strictObject({
  formatVersion: z.literal(TUI_CACHE_MARKER_VERSION),
  sha256: z.string().regex(SHA256_PATTERN),
  size: z.number().int().positive(),
});
export type TuiCacheMarker = z.infer<typeof tuiCacheMarkerSchema>;

export function parseTuiManifest(value: unknown): TuiManifest | undefined {
  const parsed = tuiManifestSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function tuiBinaryTarget(platform: NodeJS.Platform, arch: string): TuiTarget | undefined {
  const candidate = `${platform}-${arch}`;
  return (TUI_TARGETS as readonly string[]).includes(candidate)
    ? (candidate as TuiTarget)
    : undefined;
}

/** Release asset name for a target, also used as the cache file name. */
export function tuiBinaryAssetName(target: TuiTarget): string {
  return `poracode-tui-${target}${target === "win32-x64" || target === "win32-arm64" ? ".exe" : ""}`;
}
