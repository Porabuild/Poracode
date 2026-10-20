import { DEVICE_PREVIEW_MAX_PACKET_BYTES } from "./devicePreview";

/** Validates only the upstream byte envelope, without decoding, buffering or
 * reframing H264. A declared oversized frame must not grow a client's demuxer. */
export class DevicePreviewAvccGuard {
  private header = 0;
  private headerBytes = 0;
  private remaining = 0;
  private needsTag = false;

  push(bytes: Uint8Array): void {
    let offset = 0;
    while (offset < bytes.length) {
      if (this.remaining > 0) {
        if (this.needsTag) {
          const tag = bytes[offset]!;
          if (tag < 1 || tag > 4) throw new Error("Unsupported device-preview envelope.");
          this.needsTag = false;
        }
        const available = Math.min(this.remaining, bytes.length - offset);
        offset += available;
        this.remaining -= available;
      } else {
        this.header = this.header * 256 + bytes[offset++]!;
        if (++this.headerBytes === 4) {
          if (this.header < 1 || this.header > DEVICE_PREVIEW_MAX_PACKET_BYTES)
            throw new Error("Device-preview envelope exceeds its budget.");
          this.remaining = this.header;
          this.needsTag = true;
          this.header = 0;
          this.headerBytes = 0;
        }
      }
    }
  }

  finish(): void {
    if (this.headerBytes !== 0 || this.remaining !== 0)
      throw new Error("Incomplete device-preview envelope.");
  }
}
