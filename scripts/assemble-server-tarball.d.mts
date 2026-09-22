/**
 * Type surface for `assemble-server-tarball.mjs` (V6 D.2/F.1, plan D2/D3) so
 * the vitest suite in `src/server/assemble-server-tarball.test.ts` imports it
 * typed.
 */
export interface AssembleServerTarballOptions {
  /** Directory receiving the tarball, `.sha256`, metadata, and staging tree. */
  outDir?: string;
  /** Compiled main-bundle directory carrying the `*.ssh-runtime-manifest.json` union. */
  mainBundleDir?: string;
  /** Prepared native overlay (`prepare-server-native.mjs` output) shipped inside the tarball. */
  overlaySource?: string;
  /** Canonical web build output copied to `renderer/` (default `dist/web`). */
  webDir?: string;
  /** Advertised machine shapes; defaults to the packaging host's own. */
  targets?: readonly string[];
  /** Build an explicit API-only artifact without a bundled web client. */
  apiOnly?: boolean;
  /** Set false only for tests that do not exercise closure freezing. */
  shrinkwrap?: boolean;
  /** Injectable npm runner used by the shrinkwrap step in tests. */
  npmRun?: (command: string, args: readonly string[], cwd: string) => unknown;
  /** Explicit source revision recorded in the artifact metadata. */
  sourceRevision?: string;
}

export interface AssembleServerTarballResult {
  tarballPath: string;
  sha256: string;
  stageDir: string;
  metadataPath: string;
  webClient: { present: boolean; files?: number; bytes?: number; sha256?: string };
}

export declare function assembleServerTarball(
  options?: AssembleServerTarballOptions,
): AssembleServerTarballResult;

export declare function assertTargetCoverage(
  overlayRoot: string,
  targets: readonly string[],
): { nodePtyDirs: string[]; sqliteDirs: string[] };

export declare function webClientIdentity(rendererDir: string): {
  present: true;
  files: number;
  bytes: number;
  sha256: string;
  buildVersion?: string;
};
