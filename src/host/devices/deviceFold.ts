import { WebSocket } from "ws";
import { z } from "zod";
import { devicePreviewIosConfigSchema } from "@/shared/devicePreview";
import { readBoundedResponseBody } from "@/shared/http";
import type { DeviceHubHandle, DeviceHubRuntime } from "./DeviceHubRuntime";
import { rawDataBytes } from "./DevicePreviewProtocol";
import { DeviceWorkspaceError } from "./deviceProcess";

// serve-sim hinge wire protocol (verified against the pinned hub helper):
// request is binary tag 0x0f + JSON {"angle":0..180}; the ack is tag 0x8f +
// JSON {"ok":boolean,"angle":number,"error"?:string}. Other helper packets
// (config/media) may arrive on the same socket and are ignored here.
const HINGE_REQUEST_TAG = 0x0f;
const HINGE_ACK_TAG = 0x8f;
const hingeAckSchema = z.object({
  ok: z.boolean(),
  angle: z.number().optional(),
  error: z.string().optional(),
});

export type DeviceFoldHelperConfig = z.infer<typeof devicePreviewIosConfigSchema>;

export interface DeviceFoldHelperHandle {
  readConfig(signal: AbortSignal): Promise<DeviceFoldHelperConfig>;
  setHingeAngle(angle: number, signal: AbortSignal): Promise<void>;
  release(): Promise<void>;
}

export interface DeviceFoldRuntime {
  prepare(): Promise<void>;
  qualified(): boolean;
  acquireHelper(udid: string, bootId: string, signal: AbortSignal): Promise<DeviceFoldHelperHandle>;
}

function foldFailed(message: string): DeviceWorkspaceError {
  return new DeviceWorkspaceError("device_fold_failed", message, 503);
}

async function readHelperConfig(
  hub: DeviceHubHandle,
  udid: string,
  signal: AbortSignal,
): Promise<DeviceFoldHelperConfig> {
  try {
    const response = await fetch(
      `${hub.origin}/vendor/serve-sim/helper/${encodeURIComponent(udid)}/config`,
      {
        headers: { authorization: `Bearer ${hub.token}` },
        signal: AbortSignal.any([hub.signal, signal, AbortSignal.timeout(15_000)]),
        redirect: "error",
      },
    );
    if (!response.ok) throw foldFailed("The foldable preview helper is unavailable.");
    const value: unknown = JSON.parse(
      new TextDecoder().decode(await readBoundedResponseBody(response, 128 * 1024)),
    );
    const config = devicePreviewIosConfigSchema.safeParse(value);
    if (!config.success) throw foldFailed("The foldable preview helper returned no config.");
    // Mid-animation configs can carry fractional angles; fold consumers
    // compare whole degrees.
    return config.data.hingeAngle === undefined
      ? config.data
      : { ...config.data, hingeAngle: Math.round(config.data.hingeAngle) };
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof DeviceWorkspaceError) throw error;
    throw foldFailed("The foldable preview helper is unavailable.");
  }
}

async function sendHingeAngle(
  hub: DeviceHubHandle,
  udid: string,
  angle: number,
  signal: AbortSignal,
): Promise<void> {
  const target = new URL("/vendor/serve-sim/helper/ws", hub.origin);
  target.protocol = "ws:";
  target.searchParams.set("device", udid);
  const socket = new WebSocket(target, {
    headers: { authorization: `Bearer ${hub.token}` },
    maxPayload: 64 * 1024,
    perMessageDeflate: false,
    handshakeTimeout: 15_000,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", aborted);
        hub.signal.removeEventListener("abort", aborted);
        if (error) reject(error);
        else resolve();
      };
      const aborted = () =>
        finish(
          signal.reason instanceof Error ? signal.reason : foldFailed("The fold was cancelled."),
        );
      const timer = setTimeout(
        () => finish(foldFailed("The foldable preview helper did not answer the fold request.")),
        15_000,
      );
      timer.unref();
      signal.addEventListener("abort", aborted, { once: true });
      hub.signal.addEventListener("abort", aborted, { once: true });
      socket.once("error", () => finish(foldFailed("The foldable preview helper is unavailable.")));
      socket.once("close", () =>
        finish(foldFailed("The foldable preview helper closed during the fold request.")),
      );
      socket.on("message", (data, binary) => {
        if (!binary) return;
        const bytes = rawDataBytes(data);
        if (bytes[0] !== HINGE_ACK_TAG) return;
        let ack: z.infer<typeof hingeAckSchema>;
        try {
          ack = hingeAckSchema.parse(JSON.parse(bytes.subarray(1).toString("utf8")));
        } catch {
          finish(foldFailed("The foldable preview helper returned an invalid fold answer."));
          return;
        }
        if (!ack.ok)
          finish(
            foldFailed(
              ack.error
                ? `The device refused the fold: ${ack.error.slice(0, 256)}`
                : "The device refused the fold.",
            ),
          );
        else finish();
      });
      socket.once("open", () => {
        socket.send(
          Buffer.concat([Buffer.from([HINGE_REQUEST_TAG]), Buffer.from(JSON.stringify({ angle }))]),
          (error) => {
            if (error) finish(foldFailed("The fold request could not be sent."));
          },
        );
      });
      if (signal.aborted || hub.signal.aborted) aborted();
    });
  } finally {
    socket.terminate();
  }
}

export function createDeviceFoldRuntime(runtime: DeviceHubRuntime): DeviceFoldRuntime {
  return {
    prepare: () => runtime.prepare(),
    qualified: () => runtime.platforms().includes("ios"),
    acquireHelper: async (udid, bootId, signal) => {
      // The bootId must travel with the acquire: DeviceHubRuntime pools hub
      // generations by device+boot, and live preview acquires with the boot
      // identity. Omitting it spawns a second hub whose serve-sim then
      // fights the preview's helper for the simulator's single device lock.
      const hub = await runtime.acquire(signal, "ios", { clientDeviceId: udid, bootId });
      try {
        await runtime.ensureIosHelper(hub, udid, signal);
      } catch (error) {
        await hub.release();
        throw error;
      }
      return {
        readConfig: (activeSignal) => readHelperConfig(hub, udid, activeSignal),
        setHingeAngle: (angle, activeSignal) => sendHingeAngle(hub, udid, angle, activeSignal),
        release: () => hub.release(),
      };
    },
  };
}
