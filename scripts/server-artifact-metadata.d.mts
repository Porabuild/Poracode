/**
 * Type surface for `server-artifact-metadata.mjs` (plan D3). D4 upgrade
 * identity should read build identity through these helpers rather than
 * re-deriving it from environment variables.
 */
export declare const SERVER_ARTIFACT_METADATA_VERSION: 1;
export declare const SERVER_ARTIFACT_KIND: "poracode-server-artifact";
export declare const SERVER_ARTIFACT_FILE_NAME: "server-artifact.json";

export interface ServerArtifactMetadata {
  formatVersion: 1;
  kind: "poracode-server-artifact";
  version: string;
  sourceRevision?: string;
  builtAt: string;
  platform: string;
  arch: string;
  targets: string[];
  node: { minimum: string | null; packaging: string };
  runtime: {
    nodePty: string;
    betterSqlite3: string;
    dependencies: Record<string, string>;
    overlayTargets: { nodePty: string[]; betterSqlite3: string[] };
  };
  webClient:
    | { present: false }
    | { present: true; files: number; bytes: number; sha256: string; buildVersion?: string };
  tarball: { name: string; sha256: string; bytes: number };
  files: Record<string, string>;
}

export declare function assertServerArtifactMetadata(value: unknown): ServerArtifactMetadata;

export declare function writeServerArtifactMetadata(
  outDir: string,
  metadata: Omit<ServerArtifactMetadata, "formatVersion" | "kind">,
): string;

export declare function readServerArtifactMetadata(path: string): ServerArtifactMetadata;

export declare function sha256Bytes(bytes: Buffer | string): string;
