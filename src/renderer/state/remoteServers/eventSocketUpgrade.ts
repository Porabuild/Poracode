import { withEventEpochDeclaration } from "@/shared/remote/protocol/eventEpoch";
import { withBoundedCatalogChangesDeclaration } from "@/renderer/state/remote/boundedCatalogChangesCapability";
import { withRuntimeHistoryNoticesDeclaration } from "@/renderer/state/remote/historyNoticeCapability";

/**
 * The capabilities a client declares on the event-stream upgrade, for every
 * host's connection. They are asserted at socket open, before any read:
 *
 * - `notices=v1`, because the durable-notice banner and its acknowledgement
 *   are installed, so a capable connection keeps live post-gap content
 *   flowing instead of being emptied by the host's notice gate;
 * - `catalogChanges=bounded-v1`, only when the connection's descriptor
 *   advertised it AND the bounded controller is installed for it;
 * - the event epoch, for a connection that resumes from a cursor (the epoch
 *   binds that cursor to the instance that issued it; older hosts ignore it).
 *   `resume` is absent for a live-only join, which has no cursor to bind.
 */
export function declareEventSocketCapabilities(
  wsUrl: string,
  options: {
    readonly boundedCatalogChanges: boolean;
    readonly resume?: { readonly lastSeenEpoch: string | undefined };
  },
): string {
  const declared = withBoundedCatalogChangesDeclaration(
    withRuntimeHistoryNoticesDeclaration(wsUrl),
    options.boundedCatalogChanges,
  );
  return options.resume
    ? withEventEpochDeclaration(declared, options.resume.lastSeenEpoch)
    : declared;
}
