import { PortProxy } from "./portProxy";
import { RemotePortForwardGateway } from "../RemotePortForwardGateway";

export interface PortForwardingOptions {
  /** Host the forward listeners bind to (see {@link RemotePortForwardGateway}). */
  readonly bindHost: string;
  /** The remote-access server's own port, rejected as a self-referential
   * forward target (see {@link RemotePortForwardGateway}). */
  readonly remoteAccessPort: number;
}

/**
 * The paired raw-TCP gateway + authenticated HTTP/WS proxy that back port
 * forwarding. They are always built, reused, and torn down together — the proxy
 * holds in-memory enter-token/session state keyed to the gateway's forwards, so
 * one can never outlive or be swapped independently of the other. This bundles
 * that lockstep lifecycle behind a single unit so the Electron main composition
 * root and the headless host keep just one nullable ref instead of two that must
 * be manually kept in sync.
 */
export interface PortForwarding {
  readonly gateway: RemotePortForwardGateway;
  readonly proxy: PortProxy;
  /** Disposes both, gateway first then proxy. Safe to call multiple times. */
  dispose(): void;
}

export function createPortForwarding(options: PortForwardingOptions): PortForwarding {
  const gateway = new RemotePortForwardGateway({
    bindHost: options.bindHost,
    remoteAccessPort: options.remoteAccessPort,
  });
  const proxy = new PortProxy({ gateway });
  return {
    gateway,
    proxy,
    dispose() {
      gateway.dispose();
      proxy.dispose();
    },
  };
}
