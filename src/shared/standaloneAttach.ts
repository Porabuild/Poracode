// Standalone attach info: process-lifetime bootstrap shape for Electron as a
// client of an already-running compatible headless owner at the same profile
// namespace.
//
// Compatibility audit (see .agents/docs/versioning.md):
// - This shape crosses main -> renderer inside one Electron build only. Both
//   ends ship together, so no cross-version pairing exists. Old preloads lack
//   `getStandaloneAttachInfo` (renderer treats absence as managed-local) and
//   old renderers never call it. Nothing is persisted to disk, SQLite, or
//   localStorage; the pairing URL lives in main memory and is fetched via IPC.
//   No persisted/bootstrap/IPC version bump is required for this additive,
//   same-build, process-lifetime boundary.
// - `capabilities` (V5 plan 1.2) carries the host-declared service
//   capabilities from the authenticated describe that minted this payload.
//   Same-build additive optional field: main always provides it for a
//   version-2 owner, and the renderer fails closed to "not offered" when it
//   is absent (an owner still advertising control version 1 is refused at the
//   main-side compat gate long before this payload exists).
// - Reuses control 2 / discovery 1 / remote 12 / bridge 2 / facade-runtime 13 /
//   host 13. Stream 5 is untouched here (root batch owns 5->6; integration
//   expects stream6). Reserved facade9/host8-12/stream4 are never consumed.
// - `remoteProtocolVersion` is pinned to PORACODE_REMOTE_PROTOCOL_VERSION (12)
//   at build time: an older owner fails the main-side compat gate before any
//   pairing is minted, and the renderer re-checks the literal before exchange.

import { z } from "zod";
import { hostServiceCapabilitiesSchema } from "./hostControlProtocol";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "./remote/protocol";

const rootSchema = z.string().min(1).max(4_096);

const endpointSchema = z
  .string()
  .max(8_192)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === "http:" || url.protocol === "https:") &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  });

export const standaloneAttachInfoSchema = z.strictObject({
  profileNamespace: rootSchema,
  dataRoot: rootSchema,
  endpoint: endpointSchema,
  ownerGeneration: z.uuid(),
  remoteProtocolVersion: z.literal(PORACODE_REMOTE_PROTOCOL_VERSION),
  pairingUrl: z.url().max(8_192),
  /** Host-declared service capabilities from the minting describe; see above. */
  capabilities: hostServiceCapabilitiesSchema.optional(),
});

export type StandaloneAttachInfo = z.infer<typeof standaloneAttachInfoSchema>;
