export const SSH_RUNTIME_MANIFEST_VERSION = 1 as const;

export const SSH_RUNTIME_ENTRY_CONFIG = {
  server: [],
  supervisor: ["@opencode-ai/sdk", "@sentry/node"],
  claudeSdkProbeWorker: [],
  cursorSdkWorker: [],
} as const satisfies Record<string, readonly string[]>;

export type SshRuntimeEntryName = keyof typeof SSH_RUNTIME_ENTRY_CONFIG;
export const SSH_RUNTIME_ENTRY_NAMES = Object.keys(
  SSH_RUNTIME_ENTRY_CONFIG,
) as SshRuntimeEntryName[];

export interface SshRuntimeBuildManifest {
  readonly version: typeof SSH_RUNTIME_MANIFEST_VERSION;
  readonly files: readonly string[];
  readonly dependencies: readonly string[];
}

export function sshRuntimeManifestFileName(entry: SshRuntimeEntryName): string {
  return `${entry}.ssh-runtime-manifest.json`;
}
