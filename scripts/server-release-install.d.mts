/**
 * Type surface for `server-release-install.mjs`, the single release-directory
 * install contract (safe extraction → native overlay → npm install).
 */
export declare const RUNTIME_NPM_INSTALL_ARGS: readonly string[];

export declare class UnsafeServerTarballError extends Error {}

export declare function assertSafeTarballEntries(
  entries: readonly string[],
  verboseListing: readonly string[],
): void;

export interface ExtractServerTarballOptions {
  readonly tarball: string;
  readonly destination: string;
  readonly tar?: string;
  /** Test seam for `resolveTar` (platform/env/exists/run injection). */
  readonly tarResolution?: import("./server-host-tools.mjs").HostToolOptions;
  readonly run?: (command: string, args: readonly string[], options?: object) => unknown;
}

export declare function extractServerTarball(options: ExtractServerTarballOptions): {
  readonly entries: number;
};

export declare function npmInstallRuntimeDependencies(
  releaseDir: string,
  options?: {
    readonly npm?: string;
    readonly run?: unknown;
    readonly ignoreScripts?: boolean;
    readonly npmResolution?: import("./server-host-tools.mjs").HostToolOptions;
  },
): void;

export declare const STANDALONE_RUNTIME_FILE: "standalone.json";
export declare const STANDALONE_RUNTIME_KIND: "poracode-standalone-runtime";
export declare const STANDALONE_RUNTIME_FORMAT_VERSION: 1;

export declare class StandaloneRuntimeError extends Error {}

export interface StandaloneRuntimeMarker {
  readonly formatVersion: 1;
  readonly kind: "poracode-standalone-runtime";
  readonly version: string;
  readonly target: string;
  readonly node: { readonly version: string; readonly executable: string };
  readonly [key: string]: unknown;
}

export declare function hostRuntimeTarget(): string;

export declare function readStandaloneRuntimeMarker(
  releaseDir: string,
): StandaloneRuntimeMarker | null;

export declare function standaloneNodeExecutable(
  releaseDir: string,
  marker: StandaloneRuntimeMarker,
): string;

export interface InstallServerReleaseOptions extends ExtractServerTarballOptions {
  readonly releaseDir: string;
  readonly skipNpmInstall?: boolean;
  /** Test seam: the host target a standalone archive must match. */
  readonly hostTarget?: string;
}

export declare function installServerRelease(options: InstallServerReleaseOptions): {
  readonly releaseDir: string;
  readonly overlayApplied: boolean;
  readonly standalone: boolean;
};

export declare function writeCurrentSymlink(
  prefix: string,
  releaseDir: string,
  options?: import("./server-host-tools.mjs").DirectoryLinkOptions & {
    readonly retry?: import("./server-host-tools.mjs").RetryOptions;
  },
): void;
