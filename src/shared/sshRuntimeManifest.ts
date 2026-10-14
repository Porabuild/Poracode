import { z } from "zod";
import {
  RUNTIME_CAPTURE_PROTOCOL_VERSION,
  runtimeCodeFilesSchema,
  runtimeDigestSchema,
} from "./runtimeCodeManifest.ts";

// v4 declares source, captured code and resource identities. Owner-control v3
// and settings v4 are incompatible parents; their combined artifact uses v5.
export const SSH_RUNTIME_MANIFEST_VERSION = 4 as const;

/** The production supervisor has not activated the settings reverse service yet. */
export const SUPERVISOR_SETTINGS_SERVICE_VERSION = 0 as const;

export const SSH_RUNTIME_ENTRY_CONFIG = {
  server: [],
  supervisor: ["@opencode-ai/sdk", "@opencode/client", "@sentry/node"],
  claudeSdkProbeWorker: [],
  cursorSdkWorker: [],
} as const satisfies Record<string, readonly string[]>;

export type SshRuntimeEntryName = keyof typeof SSH_RUNTIME_ENTRY_CONFIG;
export const SSH_RUNTIME_ENTRY_NAMES = Object.keys(
  SSH_RUNTIME_ENTRY_CONFIG,
) as SshRuntimeEntryName[];

export const runtimeResourceIdentitySchema = z.strictObject({
  kind: z.enum(["agent-plugins", "bundled-plugins"]),
  sha256: runtimeDigestSchema,
});
export type RuntimeResourceIdentity = z.infer<typeof runtimeResourceIdentitySchema>;

export const sshRuntimeBuildManifestSchema = z
  .strictObject({
    version: z.literal(SSH_RUNTIME_MANIFEST_VERSION),
    entry: z.enum(SSH_RUNTIME_ENTRY_NAMES as [SshRuntimeEntryName, ...SshRuntimeEntryName[]]),
    sourceHash: runtimeDigestSchema,
    captureProtocolVersion: z.literal(RUNTIME_CAPTURE_PROTOCOL_VERSION),
    settingsServiceVersion: z.union([z.literal(0), z.literal(1)]),
    files: runtimeCodeFilesSchema,
    dependencies: z.array(z.string().min(1)).max(256),
    resources: z.array(runtimeResourceIdentitySchema).max(2),
  })
  .superRefine((manifest, context) => {
    const entryExtension = manifest.entry.endsWith("Worker") ? "mjs" : "cjs";
    if (!manifest.files.some((file) => file.path === `${manifest.entry}.${entryExtension}`))
      context.addIssue({
        code: "custom",
        message: "Runtime entry is absent from its code closure.",
      });
    if (
      new Set(manifest.resources.map((resource) => resource.kind)).size !==
      manifest.resources.length
    )
      context.addIssue({ code: "custom", message: "Duplicate runtime resource declaration." });
  });

export type SshRuntimeBuildManifest = z.infer<typeof sshRuntimeBuildManifestSchema>;

export function sshRuntimeManifestFileName(entry: SshRuntimeEntryName): string {
  return `${entry}.ssh-runtime-manifest.json`;
}
