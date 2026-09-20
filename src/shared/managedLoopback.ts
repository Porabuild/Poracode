import { z } from "zod";

/**
 * Managed loopback bootstrap payload (V5 plan 2.5 completion): the endpoint and
 * single-use pairing credential the managed desktop renderer consumes to attach
 * to the co-located, ALWAYS-ON loopback `RemoteAccessServer`.
 *
 * Versioning: additive desktop-internal IPC surface, not the remote wire. The
 * payload rides the `getManagedLoopbackBootstrap` procedure (main-local
 * transport) and never crosses the remote HTTP/WS protocol, so
 * `PORACODE_REMOTE_PROTOCOL_VERSION` and the generated remote v3 manifest are
 * untouched. The bootstrap answer is process-lifetime state: main mints the
 * credential from the running loopback server at readiness — before the
 * renderer asks — and the renderer treats any failure as "stay on the
 * desktop-IPC relay" (the documented fallback leg).
 */
export const managedLoopbackBootstrapSchema = z.object({
  /** Loopback HTTP origin (trailing slash) of the co-located remote server. */
  endpoint: z.string().url(),
  /**
   * Pairing URL whose fragment carries THIS launch's single-use credential
   * (`#token=...`). Built on the loopback endpoint, never the advertised one.
   */
  pairingUrl: z.string().url(),
});
export type ManagedLoopbackBootstrap = z.infer<typeof managedLoopbackBootstrapSchema>;
