import {
  DIRECT_HANDLER_MAX_GLOBAL,
  LARGE_REPLY_MAX_BYTES_GLOBAL,
  LARGE_REPLY_MAX_GLOBAL,
} from "@/shared/rendererStreamChunks";

/**
 * Global admission for direct-stream requests and large-reply delivery
 * (Phase 3 item 6). Per-client delivery counts live on the owning ClientState
 * map; this module owns the cross-client globals so disconnect/reconnect
 * cannot discard accounting for still-running orphan work.
 *
 * Execution (handler slots) and delivery (retained serialized bytes) are
 * separate accounts with separate exactly-once release paths, including
 * shutdown cleanup. All methods are synchronous and idempotent on release.
 */
export class RendererStreamRequestAdmission {
  private readonly globalHandlers = new Set<string>();
  private readonly globalLarge = new Map<string, number>();

  /** Reserve one global handler slot. False when the 128-work bound holds. */
  tryReserveExecution(key: string): boolean {
    if (this.globalHandlers.has(key)) return true;
    if (this.globalHandlers.size >= DIRECT_HANDLER_MAX_GLOBAL) return false;
    this.globalHandlers.add(key);
    return true;
  }

  releaseExecution(key: string): void {
    this.globalHandlers.delete(key);
  }

  globalExecutionCount(): number {
    return this.globalHandlers.size;
  }

  /**
   * Reserve one global large-delivery slot. Callers must already have checked
   * the per-client 2-transfer / 64MiB bounds on their ClientState map; this
   * enforces the 4-transfer / 128MiB globals. False reserves nothing.
   */
  tryReserveDelivery(key: string, bytes: number): boolean {
    if (this.globalLarge.has(key)) return true;
    if (this.globalLarge.size >= LARGE_REPLY_MAX_GLOBAL) return false;
    let total = bytes;
    for (const held of this.globalLarge.values()) total += held;
    if (total > LARGE_REPLY_MAX_BYTES_GLOBAL) return false;
    this.globalLarge.set(key, bytes);
    return true;
  }

  releaseDelivery(key: string): void {
    this.globalLarge.delete(key);
  }

  globalDeliveryCount(): number {
    return this.globalLarge.size;
  }

  globalDeliveryBytes(): number {
    let total = 0;
    for (const held of this.globalLarge.values()) total += held;
    return total;
  }
}
