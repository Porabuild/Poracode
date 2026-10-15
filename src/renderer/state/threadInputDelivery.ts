/** Renderer-only metadata on optimistic user-message payloads; never sent to the host. */
export type ThreadInputDelivery = "pending" | "accepted" | "failed" | "uncertain";

export function readThreadInputDelivery(payload: unknown): ThreadInputDelivery | undefined {
  return (payload as { clientInputDelivery?: ThreadInputDelivery } | undefined)
    ?.clientInputDelivery;
}
