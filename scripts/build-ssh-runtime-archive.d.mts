export declare const SSH_RUNTIME_ARCHIVE_FORMAT_VERSION: 1;

export interface SshRuntimeArchiveManifest {
  readonly formatVersion: 1;
  readonly archive: string;
  readonly hash: string;
  readonly archiveSha256: string;
  readonly sourceHash: string;
}

export interface SshRuntimeArchiveResult extends SshRuntimeArchiveManifest {
  readonly manifestPath: string;
  readonly archivePath: string;
}

export declare function runtimeDirectoryFiles(
  root: string,
): { readonly path: string; readonly source: string }[];

export declare function hashRuntimeDirectory(root: string): string;

export declare function buildSshRuntimeArchive(options?: {
  readonly mainBundleDir?: string;
  readonly agentPluginsDir?: string;
  readonly wslHelpersDir?: string;
  readonly skillsDir?: string;
  readonly pluginsDir?: string;
  readonly outDir?: string;
  readonly rootPackage?: { readonly version: string; readonly engines?: Record<string, string> };
  readonly nodeModulesDir?: string;
  readonly shrinkwrap?: boolean;
  readonly npmRun?: (
    command: string,
    args: readonly string[],
    cwd: string,
  ) => Buffer | string | void;
}): SshRuntimeArchiveResult;
