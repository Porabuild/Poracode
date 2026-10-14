import type { ManagedLoopbackBootstrap } from "@/shared/managedLoopback";

type BootstrapRequest = () => Promise<ManagedLoopbackBootstrap | null>;
const MAX_PREWARM_AGE_MS = 30_000;
const prewarmed = new WeakMap<
  object,
  { result: ReturnType<BootstrapRequest>; expiresAt: number }
>();

/** Prepare one window's credential before navigation, without blocking page loading. */
export function prewarmManagedLoopbackBootstrap(owner: object, request: BootstrapRequest): void {
  prewarmed.set(owner, {
    result: request().catch(() => null),
    expiresAt: Date.now() + MAX_PREWARM_AGE_MS,
  });
}

/** Consume once: reloads/reconnects must never reuse a spent pairing credential. */
export async function consumeManagedLoopbackBootstrap(
  owner: object,
  request: BootstrapRequest,
): ReturnType<BootstrapRequest> {
  const prepared = prewarmed.get(owner);
  prewarmed.delete(owner);
  if (prepared && Date.now() < prepared.expiresAt) {
    const bootstrap = await prepared.result;
    if (bootstrap && Date.now() < prepared.expiresAt) return bootstrap;
  }
  // A failed or delayed prewarm follows the normal live bootstrap path.
  return request();
}
