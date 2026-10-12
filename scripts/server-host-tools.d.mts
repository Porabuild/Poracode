/**
 * Type surface for `server-host-tools.mjs` (tar/npm resolution, default
 * prefix, junction/symlink helper, transient-lock retry).
 */
export interface TarTool {
  readonly command: string;
  readonly baseArgs: readonly string[];
}

export interface HostToolOptions {
  readonly platform?: NodeJS.Platform;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly exists?: (path: string) => boolean;
  readonly execPath?: string;
  readonly run?: (command: string, args: readonly string[], options?: object) => unknown;
}

export interface NpmInvocation {
  readonly command: string;
  readonly args: readonly string[];
  readonly shell: boolean;
}

export declare function resolveTar(options?: HostToolOptions): TarTool;
export declare function tarCommand(
  tool: TarTool,
  args: readonly string[],
): [string, readonly string[]];
export declare function npmInvocation(
  args: readonly string[],
  options?: HostToolOptions,
): NpmInvocation;
export declare function defaultServerPrefix(
  platform?: NodeJS.Platform,
  env?: Readonly<Record<string, string | undefined>>,
): string;
export declare function scratchId(platform?: NodeJS.Platform): string;
export declare function sleepSync(milliseconds: number): void;

export interface RetryOptions {
  readonly retries?: number;
  readonly baseDelayMs?: number;
  readonly sleep?: (milliseconds: number) => void;
  readonly shouldRetry?: (error: unknown) => boolean;
}

export declare function retryTransientFsSync<T>(operation: () => T, options?: RetryOptions): T;
export declare function renameWithRetry(
  source: string,
  destination: string,
  options?: RetryOptions & {
    readonly rename?: (source: string, destination: string) => void;
    readonly exists?: (path: string) => boolean;
  },
): void;

export interface DirectoryLinkOptions {
  readonly platform?: NodeJS.Platform;
  readonly symlink?: (target: string, path: string, type: string) => void;
  readonly rm?: (path: string, options: { force: boolean }) => void;
  readonly rmdir?: (path: string) => void;
}

export declare function writeDirectoryLink(
  linkPath: string,
  targetDir: string,
  options?: DirectoryLinkOptions,
): void;
export declare function removeDirectoryLink(linkPath: string, options?: DirectoryLinkOptions): void;
