import { randomBytes, randomUUID } from "node:crypto";
import {
  DEVICE_WORKSPACE_AGENT_KEY_ENV,
  verifyDeviceThreadProof,
} from "@/shared/deviceWorkspaceAgentProof";
import sharp from "sharp";
import {
  DEVICE_FRAME_MAX_BYTES,
  DEVICE_LEASE_TTL_MS,
  DEVICE_WORKSPACE_VERSION,
  deviceHumanActionSchema,
  deviceAttachSchema,
  type DeviceHumanAction,
  type DeviceControlState,
  type DeviceAttach,
  type DeviceFrame,
  type DeviceInventory,
  type DeviceSession,
  type DeviceInspection,
} from "@/shared/deviceWorkspace";
import { NativeDeviceDriver, type DeviceDriver } from "./NativeDeviceDriver";
import { DeviceWorkspaceError } from "./deviceProcess";
import {
  devicePreviewTicketRequestSchema,
  type DevicePreviewStart,
  type DevicePreviewTicketRequest,
} from "@/shared/devicePreview";
import { DeviceHubRuntime } from "./DeviceHubRuntime";
import { DevicePreviewSessions } from "./DevicePreviewSessions";
import { DevicePreviewTickets } from "./DevicePreviewTickets";

interface FrameGeometry {
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  capturedAt: number;
}
interface Lease {
  session: DeviceSession;
  principal: string;
  authorize: () => void;
  abort: AbortController;
  frames: Map<string, FrameGeometry>;
}

/** Host authority shared by HTTP clients and authenticated agent MCP callers.
 * UI grants are ephemeral, scoped to the issuing principal and thread, and
 * rechecked on every operation. Agents cannot create or elevate a grant. */
export class DeviceWorkspaceService {
  readonly generation = randomUUID();
  private readonly agentKey = randomBytes(32).toString("hex");
  private readonly leases = new Map<string, Lease>();
  private readonly lanes = new Map<string, Promise<unknown>>();
  private readonly pending = new Map<string, number>();
  private readonly lifetime = new AbortController();
  private readonly expiryTimer: ReturnType<typeof setInterval>;
  private inventory: DeviceInventory | null = null;
  private discovery: Promise<DeviceInventory> | null = null;
  private readonly previews: DevicePreviewSessions | null;
  private readonly previewTickets: DevicePreviewTickets;

  constructor(
    private readonly threadExists: (id: string) => boolean,
    private readonly driver: DeviceDriver = new NativeDeviceDriver(),
    private readonly now = Date.now,
    previewRuntime: DeviceHubRuntime | null = null,
  ) {
    this.previewTickets = new DevicePreviewTickets(now);
    this.previews = previewRuntime
      ? new DevicePreviewSessions(
          previewRuntime,
          (threadId, principal, id, control) => {
            const lease = this.lease(threadId, principal, id, control);
            return { session: { ...lease.session }, signal: lease.abort.signal };
          },
          (threadId, principal, id, signal) => {
            const lease = this.lease(threadId, principal, id);
            if (!this.driver.streamTarget)
              throw new DeviceWorkspaceError(
                "device_preview_unavailable",
                "This driver does not support live preview.",
                501,
              );
            return this.lane(
              lease,
              async (activeSignal) => {
                const target = await this.driver.streamTarget!(
                  lease.session.device.id,
                  activeSignal,
                );
                this.lease(threadId, principal, id);
                return target;
              },
              signal,
            );
          },
        )
      : null;
    this.expiryTimer = setInterval(() => {
      void this.prune().catch(() => undefined);
    }, 15_000);
    this.expiryTimer.unref();
  }
  supervisorExtraEnv(): Record<string, string> {
    return { [DEVICE_WORKSPACE_AGENT_KEY_ENV]: this.agentKey };
  }
  preparePreview(): Promise<void> {
    return this.previews?.prepare() ?? Promise.resolve();
  }
  hasLivePreview(): boolean {
    return this.previews?.available() ?? false;
  }
  openPreview(
    threadId: string,
    principal: string,
    id: string,
    request: DevicePreviewStart,
    signal: AbortSignal,
  ) {
    if (!this.previews)
      throw new DeviceWorkspaceError(
        "device_preview_unavailable",
        "This host does not provide live preview.",
        501,
      );
    return this.previews.open(threadId, principal, id, request, signal);
  }
  previewConnection(threadId: string, principal: string, id: string, previewId?: string) {
    if (!this.previews)
      throw new DeviceWorkspaceError(
        "device_preview_unavailable",
        "This host does not provide live preview.",
        501,
      );
    return this.previews.get(threadId, principal, id, previewId);
  }
  async previewTicket(
    threadId: string,
    principal: string,
    id: string,
    request: DevicePreviewTicketRequest,
  ) {
    const input = devicePreviewTicketRequestSchema.parse(request);
    const preview = await this.previewConnection(threadId, principal, id, input.previewId);
    if ((input.channel === "android" ? "android" : "ios") !== preview.descriptor.platform)
      throw new DeviceWorkspaceError(
        "invalid_device_preview_channel",
        "The preview channel does not match this device.",
        400,
      );
    // iOS video uses an authenticated HTTP stream. Its helper socket is an
    // input channel and must never be opened by a viewing grant.
    preview.assert(input.channel === "ios");
    return this.previewTickets.issue(
      {
        threadId,
        principal,
        sessionId: id,
        previewId: input.previewId,
        generation: preview.descriptor.generation,
        channel: input.channel,
      },
      preview.current().expiresAt,
    );
  }
  consumePreviewTicket(ticket: string) {
    return this.previewTickets.consume(ticket);
  }
  async closePreview(
    threadId: string,
    principal: string,
    id: string,
    previewId: string,
  ): Promise<void> {
    const preview = await this.previewConnection(threadId, principal, id, previewId);
    await preview.close();
  }
  authorizeAgent(threadId: string, proof: string | undefined): void {
    if (!verifyDeviceThreadProof(this.agentKey, threadId, proof))
      throw new DeviceWorkspaceError(
        "device_agent_denied",
        "A host-issued device credential for this thread is required.",
        403,
      );
  }

  async discover(signal?: AbortSignal): Promise<DeviceInventory> {
    this.lifetime.signal.throwIfAborted();
    this.discovery ??= this.driver
      .discover(this.lifetime.signal)
      .then((inventory) => {
        this.inventory = {
          version: DEVICE_WORKSPACE_VERSION,
          generation: this.generation,
          ...inventory,
        };
        return this.inventory;
      })
      .finally(() => {
        this.discovery = null;
      });
    const result = await this.discovery;
    signal?.throwIfAborted();
    return result;
  }

  async attach(
    threadId: string,
    principal: string,
    request: DeviceAttach,
    authorize: () => void,
  ): Promise<DeviceSession> {
    const input = deviceAttachSchema.parse(request);
    this.assertThread(threadId);
    this.lifetime.signal.throwIfAborted();
    authorize();
    if (input.generation !== this.generation)
      throw new DeviceWorkspaceError(
        "stale_device_generation",
        "The device host restarted. Refresh and attach again.",
      );
    await this.prune();
    const device = this.inventory?.devices.find((entry) => entry.id === input.deviceId);
    if (!device)
      throw new DeviceWorkspaceError(
        "device_unavailable",
        "Refresh the device list before attaching.",
      );
    if (input.agentAccess === "control" && input.access !== "control")
      throw new DeviceWorkspaceError(
        "device_control_denied",
        "Agent control requires a control session.",
        403,
      );
    const previous = [...this.leases.values()].filter(
      (lease) => lease.principal === principal && lease.session.threadId === threadId,
    );
    if (
      input.access === "control" &&
      [...this.leases.values()].some(
        (lease) =>
          lease.session.device.id === device.id &&
          lease.session.access === "control" &&
          !previous.includes(lease),
      )
    )
      throw new DeviceWorkspaceError(
        "device_busy",
        "Another thread or client controls this device. Attach with view access.",
      );
    if (this.leases.size - previous.length >= 32)
      throw new DeviceWorkspaceError(
        "device_session_limit",
        "Too many device preview sessions.",
        429,
      );
    // Reserve the new grant synchronously, before helper retirement yields,
    // so concurrent attachments cannot both acquire the controller slot.
    const retiring = previous.map((lease) => this.detach(threadId, principal, lease.session.id));
    const session: DeviceSession = {
      version: 1,
      generation: this.generation,
      id: randomUUID(),
      threadId,
      device: { ...device },
      access: input.access,
      agentAccess: input.agentAccess,
      expiresAt: this.now() + DEVICE_LEASE_TTL_MS,
    };
    this.leases.set(session.id, {
      session,
      principal,
      authorize,
      abort: new AbortController(),
      frames: new Map(),
    });
    try {
      await Promise.all(retiring);
      this.lease(threadId, principal, session.id);
    } catch (error) {
      await this.detach(threadId, principal, session.id);
      throw error;
    }
    return { ...session };
  }

  private assertThread(threadId: string): void {
    if (!this.threadExists(threadId))
      throw new DeviceWorkspaceError(
        "device_thread_unavailable",
        "The owning thread is unavailable.",
        404,
      );
  }
  private lease(threadId: string, principal: string, id: string, control = false): Lease {
    const lease = this.leases.get(id);
    if (
      !lease ||
      lease.session.threadId !== threadId ||
      lease.principal !== principal ||
      lease.session.expiresAt <= this.now() ||
      lease.abort.signal.aborted
    )
      throw new DeviceWorkspaceError(
        "device_session_expired",
        "Device access expired. Attach again.",
        410,
      );
    this.lifetime.signal.throwIfAborted();
    this.assertThread(threadId);
    lease.authorize();
    if (control && lease.session.access !== "control")
      throw new DeviceWorkspaceError(
        "device_control_denied",
        "This session has view access only.",
        403,
      );
    return lease;
  }
  renew(threadId: string, principal: string, id: string): void {
    this.lease(threadId, principal, id).session.expiresAt = this.now() + DEVICE_LEASE_TTL_MS;
  }
  private async lane<T>(
    lease: Lease,
    operation: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
    authorize?: () => void,
  ): Promise<T> {
    const id = lease.session.device.id;
    const pending = this.pending.get(id) ?? 0;
    if (pending >= 4)
      throw new DeviceWorkspaceError(
        "device_busy",
        "The device has pending requests. Retry shortly.",
        429,
      );
    this.pending.set(id, pending + 1);
    const previous = this.lanes.get(id) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(() => {
        this.lease(lease.session.threadId, lease.principal, lease.session.id);
        const combined = AbortSignal.any([
          this.lifetime.signal,
          lease.abort.signal,
          ...(signal ? [signal] : []),
        ]);
        combined.throwIfAborted();
        authorize?.();
        return operation(combined);
      });
    this.lanes.set(id, run);
    try {
      const result = await run;
      authorize?.();
      return result;
    } finally {
      this.pending.set(id, this.pending.get(id)! - 1);
      if (this.lanes.get(id) === run) this.lanes.delete(id);
    }
  }

  async frame(
    threadId: string,
    principal: string,
    id: string,
    signal?: AbortSignal,
    authorize?: () => void,
  ): Promise<DeviceFrame> {
    const lease = this.lease(threadId, principal, id);
    return this.lane(
      lease,
      async (activeSignal) => {
        const capture = await this.driver.capture(lease.session.device.id, activeSignal);
        const image = sharp(capture.png, { limitInputPixels: 32_000_000 });
        const meta = await image.metadata();
        if (!meta.width || !meta.height)
          throw new DeviceWorkspaceError(
            "device_capture_failed",
            "The device returned no image dimensions.",
          );
        const { data, info } = await image
          .resize({ width: 720, height: 1280, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 65 })
          .toBuffer({ resolveWithObject: true });
        activeSignal.throwIfAborted();
        this.lease(threadId, principal, id);
        if (data.length > DEVICE_FRAME_MAX_BYTES)
          throw new DeviceWorkspaceError(
            "device_frame_too_large",
            "Device frame exceeds the preview limit.",
          );
        let width = capture.inputWidth ?? meta.width;
        let height = capture.inputHeight ?? meta.height;
        if (meta.width > meta.height !== width > height) [width, height] = [height, width];
        const frame: DeviceFrame = {
          version: 1,
          id: randomUUID(),
          capturedAt: this.now(),
          mimeType: "image/jpeg",
          base64: data.toString("base64"),
          width: info.width,
          height: info.height,
        };
        lease.frames.set(frame.id, {
          width,
          height,
          sourceWidth: meta.width,
          sourceHeight: meta.height,
          capturedAt: frame.capturedAt,
        });
        if (lease.frames.size > 4) lease.frames.delete(lease.frames.keys().next().value!);
        return frame;
      },
      signal,
      authorize,
    );
  }

  async inspect(
    threadId: string,
    principal: string,
    id: string,
    signal?: AbortSignal,
    authorize?: () => void,
  ): Promise<DeviceInspection> {
    const lease = this.lease(threadId, principal, id);
    return this.lane(
      lease,
      async (activeSignal) => {
        const result = await this.driver.inspect(lease.session.device.id, activeSignal);
        this.lease(threadId, principal, id);
        return result;
      },
      signal,
      authorize,
    );
  }

  async action(
    threadId: string,
    principal: string,
    id: string,
    request: DeviceHumanAction,
    signal?: AbortSignal,
    authorize?: () => void,
  ): Promise<DeviceControlState | undefined> {
    const action = deviceHumanActionSchema.parse(request);
    const lease = this.lease(threadId, principal, id, true);
    const result = await this.lane(
      lease,
      async (activeSignal) => {
        this.lease(threadId, principal, id, true);
        if (action.kind === "control") {
          const capability = lease.session.device.controls;
          if (!capability?.actions.includes(action.control.type) || !this.driver.control)
            throw new DeviceWorkspaceError(
              "device_control_unavailable",
              "Refresh and attach to a host that supports this control.",
              501,
            );
          return this.driver.control(
            lease.session.device.id,
            action.control,
            capability.bootId,
            activeSignal,
            () => {
              authorize?.();
              this.lease(threadId, principal, id, true);
            },
          );
        }
        if (action.kind === "start") {
          await this.driver.start(lease.session.device.id, activeSignal);
          return undefined;
        }
        if (!lease.session.device.input)
          throw new DeviceWorkspaceError(
            "device_control_unavailable",
            "This host does not provide input for the selected device.",
          );
        let geometry: FrameGeometry | null = null;
        if (action.kind === "tap" || action.kind === "swipe") {
          geometry = lease.frames.get(action.frameId) ?? null;
          if (!geometry || this.now() - geometry.capturedAt > 10_000)
            throw new DeviceWorkspaceError(
              "stale_frame",
              "Capture a fresh frame before sending coordinates.",
            );
          const current = await this.driver.capture(lease.session.device.id, activeSignal);
          const meta = await sharp(current.png).metadata();
          if (meta.width !== geometry.sourceWidth || meta.height !== geometry.sourceHeight)
            throw new DeviceWorkspaceError(
              "stale_frame",
              "The device rotated. Capture a fresh frame.",
            );
        }
        this.lease(threadId, principal, id, true);
        authorize?.();
        await this.driver.input(lease.session.device.id, action, geometry, activeSignal);
        return undefined;
      },
      signal,
      authorize,
    );
    if (action.kind === "control" && action.control.type === "powerOff") {
      for (const current of [...this.leases.values()])
        if (current.session.device.id === lease.session.device.id)
          await this.detach(current.session.threadId, current.principal, current.session.id);
    }
    return result;
  }

  agentSession(threadId: string, control = false): { principal: string; session: DeviceSession } {
    const leases = [...this.leases.values()].filter(
      (lease) =>
        lease.session.threadId === threadId &&
        lease.session.agentAccess !== "none" &&
        lease.session.expiresAt > this.now(),
    );
    if (leases.length !== 1)
      throw new DeviceWorkspaceError(
        "device_agent_denied",
        "Attach a device to this thread with the desired access mode.",
        403,
      );
    const lease = leases[0]!;
    this.lease(threadId, lease.principal, lease.session.id, control);
    if (control && lease.session.agentAccess !== "control")
      throw new DeviceWorkspaceError(
        "device_agent_denied",
        "The user granted agent viewing only.",
        403,
      );
    return { principal: lease.principal, session: { ...lease.session } };
  }

  async detach(threadId: string, principal: string, id: string): Promise<void> {
    const lease = this.leases.get(id);
    if (!lease) return;
    if (lease.session.threadId !== threadId || lease.principal !== principal)
      throw new DeviceWorkspaceError(
        "device_session_denied",
        "This device session belongs to another client or thread.",
        403,
      );
    this.leases.delete(id);
    lease.abort.abort();
    const previewRetirement = this.previews?.release(id);
    const deviceId = lease.session.device.id;
    const retirement = (this.lanes.get(deviceId) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        await previewRetirement;
        if (![...this.leases.values()].some((other) => other.session.device.id === deviceId))
          await this.driver.release(deviceId);
      });
    this.lanes.set(deviceId, retirement);
    try {
      await retirement;
    } finally {
      if (this.lanes.get(deviceId) === retirement) this.lanes.delete(deviceId);
    }
  }
  private async prune(): Promise<void> {
    for (const lease of [...this.leases.values()]) {
      let invalid =
        lease.session.expiresAt <= this.now() || !this.threadExists(lease.session.threadId);
      try {
        lease.authorize();
      } catch {
        invalid = true;
      }
      if (invalid) await this.detach(lease.session.threadId, lease.principal, lease.session.id);
    }
  }
  async dispose(): Promise<void> {
    clearInterval(this.expiryTimer);
    this.lifetime.abort();
    this.previewTickets.clear();
    for (const lease of this.leases.values()) lease.abort.abort();
    this.leases.clear();
    await Promise.allSettled([...this.lanes.values(), ...(this.discovery ? [this.discovery] : [])]);
    await this.previews?.dispose();
    await this.driver.dispose();
  }
}
