import { z } from "zod";
import { DEVICE_PREVIEW_MAX_INPUT_BYTES } from "@/shared/devicePreview";
import type { DeviceTarget } from "@/shared/deviceWorkspace";
import { DeviceWorkspaceError } from "./deviceProcess";

const unit = z.number().finite().min(0).max(1);
const phase = z.enum(["begin", "move", "end"]);
const androidEnvelope = { ack: z.boolean().optional(), record: z.literal(false).optional() };
const androidInput = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("reset-video"), ack: z.boolean().optional() }),
  z.strictObject({
    type: z.literal("touch"),
    action: z.enum(["down", "move", "up"]),
    x: unit,
    y: unit,
    pointerId: z.int().min(0).max(1).optional(),
    ...androidEnvelope,
  }),
  z.strictObject({
    type: z.literal("key"),
    keycode: z.int().min(0).max(1024),
    action: z.enum(["down", "up"]).optional(),
    metaState: z.int().min(0).max(0x7fffffff).optional(),
    ...androidEnvelope,
  }),
  z.strictObject({
    type: z.literal("text"),
    text: z.string().min(1).max(2000),
    ...androidEnvelope,
  }),
  z.strictObject({ type: z.literal("home"), ...androidEnvelope }),
  z.strictObject({ type: z.literal("back"), ...androidEnvelope }),
]);

// Pinned Expo hub-client1.5.0 / Hub0.15.3 input tags. These are JSON bodies
// prefixed by one byte, not an unrestricted HID/socket or shell proxy.
const iosInput = new Map<number, z.ZodType>([
  [
    0x03,
    z.strictObject({ type: phase, x: unit, y: unit, edge: z.int().min(0).max(15).optional() }),
  ],
  [0x04, z.strictObject({ button: z.literal("home") })],
  [0x05, z.strictObject({ type: phase, x1: unit, y1: unit, x2: unit, y2: unit })],
  [0x06, z.strictObject({ type: z.enum(["down", "up"]), usage: z.int().min(0).max(255) })],
  [
    0x0b,
    z.strictObject({
      x: unit,
      y: unit,
      dx: z.number().finite().min(-50_000).max(50_000),
      dy: z.number().finite().min(-50_000).max(50_000),
    }),
  ],
  [0x0e, z.strictObject({ enabled: z.literal(false) })],
]);

function invalid(): DeviceWorkspaceError {
  return new DeviceWorkspaceError(
    "invalid_device_preview_input",
    "Unsupported device-preview input.",
    400,
  );
}
function controlRequired(): never {
  throw new DeviceWorkspaceError(
    "device_control_denied",
    "This session has view access only.",
    403,
  );
}

export function filterDevicePreviewInput(
  platform: DeviceTarget["platform"],
  bytes: Buffer,
  binary: boolean,
  control: boolean,
): { data: Buffer | string; control: boolean } {
  if (bytes.length === 0 || bytes.length > DEVICE_PREVIEW_MAX_INPUT_BYTES) throw invalid();
  if (platform === "android") {
    if (binary) throw invalid();
    let message: z.infer<typeof androidInput>;
    try {
      message = androidInput.parse(JSON.parse(bytes.toString("utf8")));
    } catch {
      throw invalid();
    }
    if (message.type === "reset-video")
      return { data: JSON.stringify({ type: "reset-video", ack: false }), control: false };
    if (!control) controlRequired();
    return { data: JSON.stringify({ ...message, ack: false, record: false }), control: true };
  }
  if (!control) controlRequired();
  if (!binary || bytes.length < 3) throw invalid();
  const tag = bytes[0]!;
  const schema = iosInput.get(tag);
  if (!schema) throw invalid();
  try {
    const message = schema.parse(JSON.parse(bytes.subarray(1).toString("utf8")));
    return {
      data: Buffer.concat([Buffer.from([tag]), Buffer.from(JSON.stringify(message))]),
      control: true,
    };
  } catch {
    throw invalid();
  }
}

/** Tracks only presses admitted on this socket. Retirement releases these
 * presses before its joined transport can relinquish the controlling lease. */
export class DevicePreviewInputState {
  private readonly touches = new Map<number, { x: number; y: number }>();
  private readonly keys = new Set<number>();
  private multi: { x1: number; y1: number; x2: number; y2: number } | null = null;

  constructor(private readonly platform: DeviceTarget["platform"]) {}

  accept(data: Buffer | string): void {
    const bytes = typeof data === "string" ? Buffer.from(data) : data;
    const tag = this.platform === "ios" ? bytes[0] : undefined;
    const input = JSON.parse(bytes.subarray(tag === undefined ? 0 : 1).toString("utf8")) as {
      type?: string;
      action?: string;
      pointerId?: number;
      keycode?: number;
      usage?: number;
      x?: number;
      y?: number;
      x1?: number;
      y1?: number;
      x2?: number;
      y2?: number;
    };
    if ((this.platform === "android" && input.type === "touch") || tag === 0x03) {
      const id = input.pointerId ?? 0;
      const actionPhase = input.action ?? input.type;
      const down = actionPhase === "down" || actionPhase === "begin";
      const up = actionPhase === "up" || actionPhase === "end";
      if (!down && !this.touches.has(id)) throw invalid();
      if (down && this.touches.has(id)) throw invalid();
      if (up) this.touches.delete(id);
      else this.touches.set(id, { x: input.x!, y: input.y! });
    } else if (tag === 0x05) {
      if (input.type !== "begin" && !this.multi) throw invalid();
      if (input.type === "begin" && this.multi) throw invalid();
      this.multi =
        input.type === "end"
          ? null
          : { x1: input.x1!, y1: input.y1!, x2: input.x2!, y2: input.y2! };
    } else if ((this.platform === "android" && input.type === "key") || tag === 0x06) {
      const code = input.keycode ?? input.usage!;
      const actionPhase = input.action ?? (this.platform === "ios" ? input.type : undefined);
      if (actionPhase === "up") this.keys.delete(code);
      else if (actionPhase === "down") {
        if (this.keys.size >= 32 && !this.keys.has(code)) throw invalid();
        this.keys.add(code);
      }
    }
  }

  release(): (Buffer | string)[] {
    const packets: (Buffer | string)[] = [];
    const ios = (tag: number, value: unknown) =>
      Buffer.concat([Buffer.from([tag]), Buffer.from(JSON.stringify(value))]);
    for (const [pointerId, point] of this.touches)
      packets.push(
        this.platform === "android"
          ? JSON.stringify({
              type: "touch",
              action: "up",
              pointerId,
              ...point,
              ack: false,
              record: false,
            })
          : ios(0x03, { type: "end", ...point }),
      );
    if (this.multi) packets.push(ios(0x05, { type: "end", ...this.multi }));
    for (const code of this.keys)
      packets.push(
        this.platform === "android"
          ? JSON.stringify({ type: "key", action: "up", keycode: code, ack: false, record: false })
          : ios(0x06, { type: "up", usage: code }),
      );
    this.touches.clear();
    this.keys.clear();
    this.multi = null;
    return packets;
  }
}
