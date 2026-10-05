/** A cache-private handle. Owners are ready coordinates, never subscribers. */
export interface EnvironmentImageBlobResource {
  readonly blob: Blob;
  readonly url: string;
  readonly effectiveMime: string;
  readonly size: number;
  owners: number;
  readPins: number;
  revoked: boolean;
  charged: boolean;
}

const COMPARISON_SLICE_BYTES = 64 * 1024;
const COMPARISON_TASK_BYTES = 256 * 1024;
const COMPARISON_TASK_MS = 2;

interface AdmissionWaiter {
  grant: () => void;
  cancel: () => void;
}

/**
 * Volatile, instance-local storage reached only after a coordinate's complete
 * authenticated, capped response fits the cache budget. MIME/size only select
 * candidates; exact encoded bytes establish reuse. No raw-byte copy is kept.
 */
export class ClientEnvironmentImageBlobPool {
  private readonly buckets = new Map<string, Set<EnvironmentImageBlobResource>>();
  private admissionActive = false;
  private readonly admissionWaiters = new Set<AdmissionWaiter>();
  private chargedBytes = 0;
  private disposed = false;

  constructor(
    private readonly createObjectUrl: (blob: Blob) => string,
    private readonly revokeObjectUrl: (url: string) => void,
  ) {}

  /** Includes last-owner resources while an outstanding comparison pins them. */
  get totalBytes(): number {
    return this.chargedBytes;
  }

  /**
   * Admission stays inside the fetch job's slot, including waits for earlier
   * admissions. Publication is synchronous with acquiring a live owner so no
   * pending coordinate can become a reuse candidate.
   */
  async admit(
    bytes: Uint8Array,
    contentType: string,
    signal: AbortSignal,
    isCurrent: () => boolean,
    publish: (resource: EnvironmentImageBlobResource) => void,
  ): Promise<void> {
    const finish = await this.admissionTurn(signal);
    if (!finish) return;
    const current = () => !this.disposed && !signal.aborted && isCurrent();
    try {
      if (!current()) return;
      // Blob's normalization preserves the entire effective type, including
      // parameters, without allocating the response body just to bucket it.
      const effectiveMime = new Blob([], { type: contentType }).type;
      const key = bucketKey(effectiveMime, bytes.byteLength);
      const candidates = this.buckets.get(key);
      // Iterate the live set rather than retaining an array of retired Blobs.
      // Serialized admission means no new resource joins it during this scan.
      if (candidates) {
        const quantum = { bytes: 0, startedAt: performance.now() };
        for (const resource of candidates) {
          if (!current()) return;
          if (!this.isLive(resource)) continue;
          resource.readPins += 1;
          let equal = false;
          try {
            equal = await equalBlobBytes(
              bytes,
              resource.blob,
              signal,
              () => current() && this.isLive(resource),
              quantum,
            );
          } catch {
            // A candidate read failure is not a failure of the independently
            // fetched response. Keep looking, or allocate its own resource.
          } finally {
            resource.readPins -= 1;
            this.unchargeIfUnused(resource);
          }
          if (!current()) return;
          if (!equal || !this.isLive(resource)) continue;
          resource.owners += 1;
          publish(resource);
          return;
        }
      }
      if (!current()) return;
      // A nonzero-offset view supplies only its actual bytes. Normal fetches
      // need no intermediate copy; SharedArrayBuffer-backed injected views
      // retain the previous safe copy-to-ArrayBuffer behavior.
      const body =
        bytes.buffer instanceof ArrayBuffer
          ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
          : bytes.slice();
      const blob = new Blob([body], { type: effectiveMime });
      const url = this.createObjectUrl(blob);
      if (!current()) {
        this.revoke(url);
        return;
      }
      const resource: EnvironmentImageBlobResource = {
        blob,
        url,
        effectiveMime,
        size: bytes.byteLength,
        owners: 1,
        readPins: 0,
        revoked: false,
        charged: true,
      };
      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = new Set();
        this.buckets.set(key, bucket);
      }
      bucket.add(resource);
      this.chargedBytes += resource.size;
      publish(resource);
    } finally {
      finish();
    }
  }

  release(resource: EnvironmentImageBlobResource): void {
    const key = bucketKey(resource.effectiveMime, resource.size);
    const bucket = this.buckets.get(key);
    if (resource.owners === 0 || !bucket?.has(resource)) return;
    resource.owners -= 1;
    if (resource.owners > 0) return;
    bucket.delete(resource);
    if (bucket.size === 0) this.buckets.delete(key);
    // Retire before calling the injected URL hook: reentrant disposal/release
    // cannot find this URL or revoke/subtract it a second time.
    resource.revoked = true;
    this.unchargeIfUnused(resource);
    this.revoke(resource.url);
  }

  dispose(): void {
    this.disposed = true;
    for (const waiter of this.admissionWaiters) waiter.cancel();
    // The cache releases each coordinate's handle; pinned reads remain charged
    // until settlement, but cannot be indexed or admitted again.
  }

  private admissionTurn(signal: AbortSignal): Promise<(() => void) | undefined> {
    if (this.disposed || signal.aborted) return Promise.resolve(undefined);
    if (!this.admissionActive) {
      this.admissionActive = true;
      return Promise.resolve(() => this.finishAdmission());
    }
    return new Promise((resolve) => {
      const waiter: AdmissionWaiter = {
        grant: () => {
          signal.removeEventListener("abort", waiter.cancel);
          resolve(() => this.finishAdmission());
        },
        cancel: () => {
          this.admissionWaiters.delete(waiter);
          signal.removeEventListener("abort", waiter.cancel);
          resolve(undefined);
        },
      };
      this.admissionWaiters.add(waiter);
      signal.addEventListener("abort", waiter.cancel, { once: true });
    });
  }

  private finishAdmission(): void {
    const next = this.admissionWaiters.values().next().value;
    if (next) {
      this.admissionWaiters.delete(next);
      next.grant();
    } else {
      this.admissionActive = false;
    }
  }

  private isLive(resource: EnvironmentImageBlobResource): boolean {
    return (
      !this.disposed &&
      resource.owners > 0 &&
      !resource.revoked &&
      this.buckets.get(bucketKey(resource.effectiveMime, resource.size))?.has(resource) === true
    );
  }

  private unchargeIfUnused(resource: EnvironmentImageBlobResource): void {
    if (resource.owners > 0 || resource.readPins > 0 || !resource.charged) return;
    resource.charged = false;
    this.chargedBytes -= resource.size;
  }

  private revoke(url: string): void {
    try {
      this.revokeObjectUrl(url);
    } catch {
      // A URL hook cannot leave ownership/accounting half-retired.
    }
  }
}

function bucketKey(effectiveMime: string, size: number): string {
  return `${size}:${effectiveMime}`;
}

async function equalBlobBytes(
  bytes: Uint8Array,
  blob: Blob,
  signal: AbortSignal,
  current: () => boolean,
  quantum: { bytes: number; startedAt: number },
): Promise<boolean> {
  for (let offset = 0; offset < bytes.byteLength; offset += COMPARISON_SLICE_BYTES) {
    if (!current()) return false;
    const end = Math.min(offset + COMPARISON_SLICE_BYTES, bytes.byteLength);
    const chunk = new Uint8Array(await blob.slice(offset, end).arrayBuffer());
    if (!current()) return false;
    if (chunk.byteLength !== end - offset) return false;
    let compared = 0;
    let equal = true;
    for (; compared < chunk.byteLength; compared += 1) {
      if (chunk[compared] !== bytes[offset + compared]) {
        compared += 1;
        equal = false;
        break;
      }
    }
    quantum.bytes += compared;
    if (
      quantum.bytes >= COMPARISON_TASK_BYTES ||
      performance.now() - quantum.startedAt >= COMPARISON_TASK_MS
    ) {
      await comparisonHostTask(signal);
      if (!current()) return false;
      quantum.bytes = 0;
      quantum.startedAt = performance.now();
    }
    if (!equal) return false;
  }
  return current();
}

/** MessageChannel avoids nested-timer clamping; each task cleans up on abort. */
function comparisonHostTask(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    const finish = () => {
      channel.port1.onmessage = null;
      channel.port1.close();
      channel.port2.close();
      signal.removeEventListener("abort", finish);
      resolve();
    };
    signal.addEventListener("abort", finish, { once: true });
    channel.port1.onmessage = finish;
    channel.port2.postMessage(null);
  });
}
