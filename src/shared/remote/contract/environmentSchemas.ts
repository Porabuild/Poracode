import { z } from "zod";
import {
  ENVIRONMENT_STORE_MAX_ENVIRONMENTS,
  environmentDesiredSchema,
  environmentHostKeyFingerprintSchema,
  environmentIdSchema,
  environmentLabelSchema,
  environmentLegacyConnectionIdSchema,
  environmentPortSchema,
  environmentPublicProjectionSchema,
  environmentTargetSchema,
} from "@/shared/environments";

/**
 * C1 management wire schemas (ADR §5 route matrix).
 *
 * Kept in their own module while the host runtime/store slice is active: the
 * durable projection already lives in `@/shared/environments`, so this file
 * only composes it into request bodies and response envelopes. Nothing here
 * changes `environmentStoreFileSchema` or any runtime projection.
 *
 * Portable-codegen constraints (native bindings are generated from these):
 * - only registered validators/transforms from `@/shared/environments` are
 *   reused; a wire credential reference re-states the shared reference grammar
 *   as ONE regex because the shared schema's `.refine` would emit the
 *   unsupported `zod.custom-refine` semantic id;
 * - every response schema is JSON-codable with the supported schema keywords
 *   (no `allOf`, no custom refine).
 */

/**
 * Host-local credential reference accepted from a client. The grammar is the
 * shared `environmentCredentialRefSchema` grammar re-expressed as a single
 * portable pattern: a leading alphanumeric, then letters/digits/dot/underscore/
 * colon/dash, never `..`. A device-local identity-file path can never parse.
 */
export const remoteEnvironmentCredentialRefSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(
    /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._:-]*$/,
    "Enter a host credential reference (letters, digits, dot, underscore, colon, dash).",
  );

export const remoteEnvironmentCreateBodySchema = z.strictObject({
  label: environmentLabelSchema,
  target: environmentTargetSchema,
  port: environmentPortSchema.optional(),
  credentialRef: remoteEnvironmentCredentialRefSchema.optional(),
  desired: environmentDesiredSchema.optional(),
  legacyConnectionId: environmentLegacyConnectionIdSchema.optional(),
});
export type RemoteEnvironmentCreateBody = z.infer<typeof remoteEnvironmentCreateBodySchema>;

/**
 * CAS update patch. `port` and `credentialRef` accept explicit `null` to clear
 * the durable field; omitted means unchanged (matching the host store patch).
 */
export const remoteEnvironmentUpdatePatchSchema = z.strictObject({
  label: environmentLabelSchema.optional(),
  target: environmentTargetSchema.optional(),
  port: environmentPortSchema.nullable().optional(),
  credentialRef: remoteEnvironmentCredentialRefSchema.nullable().optional(),
  desired: environmentDesiredSchema.optional(),
});
export type RemoteEnvironmentUpdatePatch = z.infer<typeof remoteEnvironmentUpdatePatchSchema>;

export const remoteEnvironmentUpdateBodySchema = z.strictObject({
  expectedRevision: z.number().int().min(1),
  patch: remoteEnvironmentUpdatePatchSchema,
});
export type RemoteEnvironmentUpdateBody = z.infer<typeof remoteEnvironmentUpdateBodySchema>;

/** Destructive/config/trust/migration bodies always carry the CAS revision. */
export const remoteEnvironmentExpectedRevisionBodySchema = z.strictObject({
  expectedRevision: z.number().int().min(1),
});
export type RemoteEnvironmentExpectedRevisionBody = z.infer<
  typeof remoteEnvironmentExpectedRevisionBodySchema
>;

export const remoteEnvironmentTrustAcceptBodySchema = z.strictObject({
  expectedRevision: z.number().int().min(1),
  fingerprint: environmentHostKeyFingerprintSchema,
});
export type RemoteEnvironmentTrustAcceptBody = z.infer<
  typeof remoteEnvironmentTrustAcceptBodySchema
>;

export const remoteEnvironmentAdoptLegacyBodySchema = z.strictObject({
  expectedRevision: z.number().int().min(1),
  legacyConnectionId: environmentLegacyConnectionIdSchema,
});
export type RemoteEnvironmentAdoptLegacyBody = z.infer<
  typeof remoteEnvironmentAdoptLegacyBodySchema
>;

/** One redacted runtime projection, exactly the runtime service's public shape. */
export const remoteEnvironmentResultSchema = z.object({
  environment: environmentPublicProjectionSchema,
});
export type RemoteEnvironmentResult = z.infer<typeof remoteEnvironmentResultSchema>;

export const remoteEnvironmentListResultSchema = z.object({
  environments: z.array(environmentPublicProjectionSchema).max(ENVIRONMENT_STORE_MAX_ENVIRONMENTS),
});
export type RemoteEnvironmentListResult = z.infer<typeof remoteEnvironmentListResultSchema>;

/**
 * Probe outcome an operator may explicitly accept. Only the fingerprint and
 * key type cross the wire: the resolved host/port/lookup name stay host-local
 * (the projection already carries the configured target and port).
 */
export const remoteEnvironmentTrustProbeResultSchema = z.object({
  fingerprint: environmentHostKeyFingerprintSchema,
  keyType: z.string().min(1).max(64),
});
export type RemoteEnvironmentTrustProbeResult = z.infer<
  typeof remoteEnvironmentTrustProbeResultSchema
>;

/**
 * One-time child pairing credential returned for the parent proxy prefix. The
 * endpoint is the parent proxy path (never a loopback URL or port); the
 * credential is minted by the child connection and is never persisted by the
 * host or widened by parent scopes.
 */
export const remoteEnvironmentPairingResultSchema = z.object({
  pairing: z.object({
    environmentId: environmentIdSchema,
    endpoint: z.string().min(1).max(512),
    pairingCredential: z.string().min(1).max(512),
    childDesktopId: z.string().min(1).max(256),
  }),
});
export type RemoteEnvironmentPairingResult = z.infer<typeof remoteEnvironmentPairingResultSchema>;
