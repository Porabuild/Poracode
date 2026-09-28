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

export interface InstallServerReleaseOptions extends ExtractServerTarballOptions {
  readonly releaseDir: string;
  readonly skipNpmInstall?: boolean;
}

export declare function installServerRelease(options: InstallServerReleaseOptions): {
  readonly releaseDir: string;
  readonly overlayApplied: boolean;
};

export declare function writeCurrentSymlink(
  prefix: string,
  releaseDir: string,
  options?: import("./server-host-tools.mjs").DirectoryLinkOptions & {
    readonly retry?: import("./server-host-tools.mjs").RetryOptions;
  },
): void;
