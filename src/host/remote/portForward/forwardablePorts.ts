import { DEFAULT_PORT_FORWARD_CANDIDATE_PORTS } from "./portScanner";

/**
 * The ONE forward-ability decision for port forwarding (plan item 4.5, finding
 * S5): both the discovery list (`RemotePortForwardGateway.scanPorts`, surfaced
 * by `GET /api/ports`) and the forward-creation gate
 * (`RemotePortForwardGateway.startForward`, fed by `POST /api/ports/forward`)
 * resolve their port universe through this module, so a client can never
 * forward a port the discovery surface does not advertise.
 *
 * The default allowlist is the curated dev-server port list
 * ({@link DEFAULT_PORT_FORWARD_CANDIDATE_PORTS}) — deliberately narrow: it is
 * a discovery aid for local dev *servers*, not a general port scanner, and a
 * paired-client compromise must not be able to pivot onto arbitrary local
 * listeners (databases, agent sockets, the host's own control surfaces). The
 * server's own remote-access port is refused separately by the gateway.
 */
export const DEFAULT_FORWARDABLE_PORTS: readonly number[] = DEFAULT_PORT_FORWARD_CANDIDATE_PORTS;

export interface ForwardablePortOptions {
  /** Overrides the default allowlist (tests inject their ephemeral upstream
   * ports; a future composition may widen or narrow the curated list). */
  readonly forwardablePorts?: readonly number[];
  /** The remote-access server's own configured port — never forwardable
   * (self-referential loop). `0`/`undefined` (an ephemeral or absent port)
   * skips the check. */
  readonly remoteAccessPort?: number;
}

/** Whether `targetPort` may be forwarded: an in-range port, inside the
 * allowlist, and not the remote-access server's own port. */
export function isForwardableTargetPort(
  targetPort: number,
  options: ForwardablePortOptions = {},
): boolean {
  if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) return false;
  if (options.remoteAccessPort && targetPort === options.remoteAccessPort) return false;
  const allowlist = options.forwardablePorts ?? DEFAULT_FORWARDABLE_PORTS;
  return allowlist.includes(targetPort);
}
