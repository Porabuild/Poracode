/**
 * Type surface for `standalone-runtime.mjs` (self-contained CLI archive
 * naming, pinned Node runtime and sidecar metadata).
 */
export declare const STANDALONE_NODE_VERSION: string;
export declare const STANDALONE_NODE_ARCHIVE_SHA256: Readonly<Record<string, string>>;
export declare const STANDALONE_TARGETS: readonly string[];
export declare const STANDALONE_ARCHIVE_METADATA_VERSION: 1;
export declare const STANDALONE_ARCHIVE_KIND: "poracode-standalone-archive";

export declare function isWindowsTarget(target: string): boolean;
export declare function standaloneArchiveName(version: string, target: string): string;
export declare function standaloneMetadataName(target: string): string;
export declare function nodeArchiveFileName(target: string, version?: string): string;
export declare function nodeArchiveUrl(target: string, version?: string): string;
export declare function satisfiesNodeFloor(
  version: string,
  floor: string | null | undefined,
): boolean;
export declare function renderSha256Sums(
  entries: readonly { readonly name: string; readonly sha256: string }[],
): string;
