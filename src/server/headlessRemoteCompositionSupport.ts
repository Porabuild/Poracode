import type { HostServiceCapabilities } from "@/shared/hostControlProtocol";
import type { HeadlessRemoteHost } from "./createHeadlessRemoteHost";

/**
 * Describes a host whose service composition has not been constructed (or has
 * already been torn down): nothing is offered except the port-forward gateway
 * the server itself owns. Fail-closed, never "inferred from the host mode".
 */
export const UNCOMPOSED_HOST_CAPABILITIES: HostServiceCapabilities = {
  ssh: false,
  browserPanel: false,
  chromeBridge: false,
  computerUse: false,
  nativeSecrets: false,
  portForward: true,
  autoUpdate: false,
  osNotifications: false,
};

export type HeadlessRemoteComposition = Pick<
  HeadlessRemoteHost,
  "server" | "forwardOriginSecret" | "hostServices" | "start" | "dispose"
>;

/** Partial construction failed and its runtime could not confirm shutdown. */
export class HeadlessCompositionShutdownError extends AggregateError {
  constructor(errors: unknown[]) {
    super(
      errors,
      "Headless startup failed and runtime shutdown is unconfirmed; ownership is retained.",
    );
  }
}
