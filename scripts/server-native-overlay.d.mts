export declare function runtimePlatformKey(): string;

export declare function applyServerNativeOverlay(options: {
  readonly prefix: string;
  readonly overlayRoot: string;
}): { readonly nodePtyTarget: string; readonly betterSqliteBinding: string | undefined };

export declare function validateOverlayWrapperVersions(options: {
  readonly prefix: string;
  readonly overlayRoot: string;
}): {
  readonly checked: boolean;
  readonly reason?: string;
  readonly packages?: readonly { readonly package: string; readonly version: string }[];
};

export interface NodePtyOverlayTarget {
  readonly platform: string;
  readonly arch: string;
  readonly dir: string;
  readonly overlayTarget: string;
  readonly stagedSha256: Record<string, string>;
}

export declare function readNodePtyOverlay(overlayRoot: string): Record<string, unknown>;

export declare function readBetterSqlite3Overlay(
  overlayRoot: string,
): Record<string, unknown> | null;

export declare function overlayTargets(overlay: Record<string, unknown>): NodePtyOverlayTarget[];

export declare function selectOverlayTarget(
  targets: readonly NodePtyOverlayTarget[],
  platform?: string,
  arch?: string,
): NodePtyOverlayTarget;

export declare function betterSqlite3OverlayTargets(
  overlay: Record<string, unknown> | null,
): string[];
