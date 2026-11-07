import { z } from "zod";

// Independently staged native helper. Future manifests/protocols must refuse
// before the supervisor admits a provider into its process job.
export const PTY_JOB_OWNER_VERSION = "1.0.0";
export const PTY_JOB_OWNER_PROTOCOL_VERSION = 1;
export const PTY_JOB_OWNER_MANIFEST_VERSION = 1;
export const PTY_JOB_OWNER_MAX_BYTES = 8 * 1024 * 1024;
export const PTY_JOB_OWNER_FILENAME = "pty-job-owner-v1.exe";
export const PTY_JOB_CONTROL_MAX_BYTES = 256;

const digest = z.string().regex(/^[a-f0-9]{64}$/u);
export const ptyJobNonceSchema = z.string().regex(/^[a-f0-9]{48}$/u);
const positiveDecimal = z.string().regex(/^[1-9][0-9]*$/u);
const artifact = (relativePath: string) =>
  z.strictObject({
    relativePath: z.literal(relativePath),
    bytes: z.int().positive().max(PTY_JOB_OWNER_MAX_BYTES),
    sha256: digest,
  });
export const ptyJobOwnerManifestSchema = z.strictObject({
  formatVersion: z.literal(PTY_JOB_OWNER_MANIFEST_VERSION),
  protocolVersion: z.literal(PTY_JOB_OWNER_PROTOCOL_VERSION),
  helperVersion: z.literal(PTY_JOB_OWNER_VERSION),
  sourceSha256: digest,
  targets: z
    .strictObject({
      "win32-x64": artifact(`win32-x64/${PTY_JOB_OWNER_FILENAME}`).optional(),
      "win32-arm64": artifact(`win32-arm64/${PTY_JOB_OWNER_FILENAME}`).optional(),
    })
    .refine((targets) => Object.values(targets).some(Boolean), "A staged target is required."),
});
export type PtyJobOwnerManifest = z.infer<typeof ptyJobOwnerManifestSchema>;
export type PtyJobOwnerTarget = keyof PtyJobOwnerManifest["targets"];

export const ptyJobReplySchema = z.union([
  z.tuple([z.literal("ready-v1"), ptyJobNonceSchema]),
  z.tuple([z.literal("bound-v1"), ptyJobNonceSchema]),
  z.tuple([
    z.literal("prepared-v1"),
    ptyJobNonceSchema,
    positiveDecimal,
    positiveDecimal,
    positiveDecimal,
  ]),
  z.tuple([z.literal("assigned-v1"), ptyJobNonceSchema, positiveDecimal, positiveDecimal]),
  z.tuple([z.literal("cancelled-v1"), ptyJobNonceSchema]),
  z.tuple([z.literal("retired-v1"), ptyJobNonceSchema, z.literal("0")]),
  z.tuple([
    z.literal("error-v1"),
    ptyJobNonceSchema,
    z.enum(["protocol", "unavailable", "unknown", "exited"]),
  ]),
]);
export type PtyJobReply = z.infer<typeof ptyJobReplySchema>;
