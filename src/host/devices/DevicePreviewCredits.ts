import {
  DEVICE_PREVIEW_MAX_BUFFER_BYTES,
  DEVICE_PREVIEW_MAX_PACKET_BYTES,
  DEVICE_PREVIEW_MAX_QUEUED_PACKETS,
  devicePreviewCreditSchema,
} from "@/shared/devicePreview";
import { DeviceWorkspaceError } from "./deviceProcess";

/** One bounded reader window per media socket, independent of TCP buffering. */
export class DevicePreviewCredits {
  private bytes = 0;
  private packets = 0;
  private wake: (() => void) | undefined;
  constructor(private readonly signal: AbortSignal) {}

  grant(value: unknown): void {
    this.signal.throwIfAborted();
    const packet = devicePreviewCreditSchema.parse(value);
    if (
      this.bytes + packet.bytes > DEVICE_PREVIEW_MAX_BUFFER_BYTES ||
      this.packets + packet.packets > DEVICE_PREVIEW_MAX_QUEUED_PACKETS
    )
      throw new DeviceWorkspaceError(
        "invalid_device_preview_credit",
        "Device-preview credit exceeds its reader budget.",
        400,
      );
    this.bytes += packet.bytes;
    this.packets += packet.packets;
    this.wake?.();
  }

  async take(bytes: number): Promise<void> {
    if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > DEVICE_PREVIEW_MAX_PACKET_BYTES)
      throw new DeviceWorkspaceError(
        "invalid_device_preview_packet",
        "Device-preview packet exceeds its budget.",
        400,
      );
    while (this.bytes < bytes || this.packets < 1) {
      this.signal.throwIfAborted();
      await new Promise<void>((resolve, reject) => {
        const cancel = () => {
          cleanup();
          reject(this.signal.reason);
        };
        const ready = () => {
          cleanup();
          resolve();
        };
        const cleanup = () => {
          this.wake = undefined;
          this.signal.removeEventListener("abort", cancel);
        };
        this.wake = ready;
        this.signal.addEventListener("abort", cancel, { once: true });
        if (this.signal.aborted) cancel();
      });
    }
    this.signal.throwIfAborted();
    this.bytes -= bytes;
    this.packets--;
  }
}
