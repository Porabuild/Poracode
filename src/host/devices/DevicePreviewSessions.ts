import { randomUUID } from "node:crypto";
import {
  DEVICE_PREVIEW_VERSION,
  devicePreviewStartSchema,
  type DevicePreview,
  type DevicePreviewStart,
} from "@/shared/devicePreview";
import { readBoundedResponseBody } from "@/shared/http";
import type { DeviceSession } from "@/shared/deviceWorkspace";
import type { DeviceStreamTarget } from "./NativeDeviceDriver";
import type { DeviceHubRuntime, DeviceHubHandle } from "./DeviceHubRuntime";
import { DeviceWorkspaceError } from "./deviceProcess";

interface PreviewAuthority {
  session: DeviceSession;
  signal: AbortSignal;
}
export interface OwnedDevicePreview {
  descriptor: DevicePreview;
  hub: DeviceHubHandle;
  signal: AbortSignal;
  assert(control?: boolean): void;
  current(): DevicePreview;
  verifyIdentity(signal: AbortSignal): Promise<void>;
  ownResource(channel: "video" | "input", stop: () => Promise<void>): () => void;
  close(): Promise<void>;
}
interface PreviewEntry {
  threadId: string;
  principal: string;
  sessionId: string;
  controller: AbortController;
  ready: Promise<OwnedDevicePreview>;
  resources: Map<"video" | "input", () => Promise<void>>;
  retirement?: Promise<void>;
}

async function waitForPreview<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  const cancelled = Promise.withResolvers<never>();
  const abort = () => cancelled.reject(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  try {
    return await Promise.race([promise, cancelled.promise]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

export class DevicePreviewSessions {
  private readonly entries = new Map<string, PreviewEntry>();
  private readonly retirements = new Set<PreviewEntry>();
  private readonly retiringSessions = new Map<string, PreviewEntry>();

  constructor(
    private readonly runtime: DeviceHubRuntime,
    private readonly authorize: (
      threadId: string,
      principal: string,
      sessionId: string,
      control: boolean,
    ) => PreviewAuthority,
    private readonly resolveTarget: (
      threadId: string,
      principal: string,
      sessionId: string,
      signal: AbortSignal,
    ) => Promise<DeviceStreamTarget>,
  ) {}

  prepare(): Promise<void> {
    return this.runtime.prepare();
  }
  available(): boolean {
    return this.runtime.platforms().length > 0;
  }

  async open(
    threadId: string,
    principal: string,
    sessionId: string,
    request: DevicePreviewStart,
    signal: AbortSignal,
  ): Promise<OwnedDevicePreview> {
    const input = devicePreviewStartSchema.parse(request);
    const authority = this.authorize(threadId, principal, sessionId, false);
    if (input.generation !== authority.session.generation)
      throw new DeviceWorkspaceError(
        "stale_device_generation",
        "The device host restarted. Attach again.",
      );
    signal.throwIfAborted();
    const retirement = this.retiringSessions.get(sessionId);
    if (retirement) await waitForPreview(this.retire(retirement), signal);
    this.authorize(threadId, principal, sessionId, false);
    let entry = this.entries.get(sessionId);
    if (!entry) {
      const controller = new AbortController();
      const ready = Promise.withResolvers<OwnedDevicePreview>();
      const created: PreviewEntry = {
        threadId,
        principal,
        sessionId,
        controller,
        ready: ready.promise,
        resources: new Map(),
      };
      entry = created;
      this.entries.set(sessionId, created);
      void this.create(created, AbortSignal.any([authority.signal, controller.signal])).then(
        ready.resolve,
        ready.reject,
      );
      // Only setup owns this HTTP cancellation. A completed setup response
      // closing must not revoke its persistent, lease-owned media connection.
      const cancel = () => {
        controller.abort(signal.reason);
        void this.retire(created).catch(() => undefined);
      };
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) cancel();
      void created.ready.then(
        () => signal.removeEventListener("abort", cancel),
        () => {
          signal.removeEventListener("abort", cancel);
          void this.retire(created).catch(() => undefined);
        },
      );
    }
    if (entry.threadId !== threadId || entry.principal !== principal) throw this.expired();
    const preview = await waitForPreview(entry.ready, signal);
    signal.throwIfAborted();
    preview.assert();
    return preview;
  }

  async get(
    threadId: string,
    principal: string,
    sessionId: string,
    previewId?: string,
  ): Promise<OwnedDevicePreview> {
    this.authorize(threadId, principal, sessionId, false);
    const entry = this.entries.get(sessionId);
    if (!entry || entry.threadId !== threadId || entry.principal !== principal)
      throw this.expired();
    const preview = await entry.ready;
    if (previewId !== undefined && preview.descriptor.id !== previewId) throw this.expired();
    preview.assert();
    return preview;
  }

  private async create(entry: PreviewEntry, signal: AbortSignal): Promise<OwnedDevicePreview> {
    const { threadId, principal, sessionId } = entry;
    const authority = this.authorize(threadId, principal, sessionId, false);
    await this.runtime.prepare();
    signal.throwIfAborted();
    if (!this.runtime.platforms().includes(authority.session.device.platform))
      throw new DeviceWorkspaceError(
        "device_preview_unavailable",
        "Live preview is not qualified on this host/platform.",
        501,
      );
    const target = await this.resolveTarget(threadId, principal, sessionId, signal);
    this.authorize(threadId, principal, sessionId, false);
    const hub = await this.runtime.acquire(signal, authority.session.device.platform, target);
    const combined = AbortSignal.any([signal, hub.signal]);
    const check = (control = false) => {
      combined.throwIfAborted();
      if (this.entries.get(sessionId) !== entry) throw this.expired();
      this.authorize(threadId, principal, sessionId, control);
    };
    try {
      check();
      if (authority.session.device.platform === "ios") {
        // Internal helper setup only: NativeDeviceDriver verified this exact
        // UDID is already booted. The public facade exposes no grid/boot API.
        const response = await fetch(`${hub.origin}/vendor/serve-sim/grid/api/start`, {
          method: "POST",
          headers: { authorization: `Bearer ${hub.token}`, "content-type": "application/json" },
          body: JSON.stringify({ udid: target.clientDeviceId }),
          signal: AbortSignal.any([combined, AbortSignal.timeout(30_000)]),
          redirect: "error",
        });
        await readBoundedResponseBody(response, 128 * 1024);
        if (!response.ok)
          throw new DeviceWorkspaceError(
            "device_preview_unavailable",
            "The simulator preview helper could not start.",
            503,
          );
      }
      check();
      const current = await this.resolveTarget(threadId, principal, sessionId, combined);
      check();
      if (current.clientDeviceId !== target.clientDeviceId || current.bootId !== target.bootId)
        throw this.expired();
      const preview: OwnedDevicePreview = {
        descriptor: {
          version: DEVICE_PREVIEW_VERSION,
          id: randomUUID(),
          generation: authority.session.generation,
          sessionId,
          platform: authority.session.device.platform,
          clientDeviceId: target.clientDeviceId,
          access: authority.session.access,
          mode: "h264",
          expiresAt: authority.session.expiresAt,
        },
        hub,
        signal: combined,
        assert: check,
        current: () => {
          check();
          return {
            ...preview.descriptor,
            expiresAt: this.authorize(threadId, principal, sessionId, false).session.expiresAt,
          };
        },
        verifyIdentity: async (operationSignal) => {
          check();
          const value = await this.resolveTarget(
            threadId,
            principal,
            sessionId,
            AbortSignal.any([combined, operationSignal]),
          );
          check();
          if (value.clientDeviceId !== target.clientDeviceId || value.bootId !== target.bootId) {
            // This check can run inside a registered stream. Start retirement
            // without awaiting that same stream's own cleanup from its pump.
            void preview.close().catch(() => undefined);
            throw this.expired();
          }
        },
        close: () => this.retire(entry),
        ownResource: (channel, stop) => {
          check();
          if (entry.resources.has(channel))
            throw new DeviceWorkspaceError(
              "device_preview_busy",
              "A device-preview channel is still active. Retry shortly.",
              429,
            );
          entry.resources.set(channel, stop);
          return () => {
            if (entry.resources.get(channel) === stop) entry.resources.delete(channel);
          };
        },
      };
      const cancel = () => {
        void this.retire(entry).catch(() => undefined);
      };
      combined.addEventListener("abort", cancel, { once: true });
      check();
      return preview;
    } catch (error) {
      await hub.release();
      throw error;
    }
  }

  release(sessionId: string): Promise<void> {
    const entry = this.entries.get(sessionId) ?? this.retiringSessions.get(sessionId);
    return entry ? this.retire(entry) : Promise.resolve();
  }
  private retire(entry: PreviewEntry): Promise<void> {
    if (entry.retirement) return entry.retirement;
    if (this.entries.get(entry.sessionId) === entry) this.entries.delete(entry.sessionId);
    entry.retirement = entry.ready.then(
      async (preview) => {
        // Detach does not return while an old HTTP/WS transport can retain
        // input or media. Only then may the shared helper reference be dropped.
        const stopped = await Promise.allSettled(
          [...entry.resources.values()].map(async (stop) => stop()),
        );
        const failed = stopped.find((result) => result.status === "rejected");
        if (failed) throw failed.reason;
        await preview.hub.release();
      },
      () => undefined,
    );
    this.retirements.add(entry);
    this.retiringSessions.set(entry.sessionId, entry);
    void entry.retirement.then(
      () => {
        this.retirements.delete(entry);
        if (this.retiringSessions.get(entry.sessionId) === entry)
          this.retiringSessions.delete(entry.sessionId);
      },
      () => {
        delete entry.retirement;
      },
    );
    entry.controller.abort();
    return entry.retirement;
  }
  async dispose(): Promise<void> {
    await Promise.all([...this.entries.values()].map((entry) => this.retire(entry)));
    await Promise.all([...this.retirements].map((entry) => this.retire(entry)));
    await this.runtime.dispose();
  }
  private expired(): DeviceWorkspaceError {
    return new DeviceWorkspaceError(
      "device_preview_expired",
      "Device-preview access expired. Open a fresh preview.",
      410,
    );
  }
}
