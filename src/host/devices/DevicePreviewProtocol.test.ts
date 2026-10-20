import { describe, expect, it } from "vitest";
import { DEVICE_PREVIEW_MAX_INPUT_BYTES } from "@/shared/devicePreview";
import { DevicePreviewInputState, filterDevicePreviewInput } from "./DevicePreviewProtocol";

const json = (value: unknown) => Buffer.from(JSON.stringify(value));
const ios = (tag: number, value: unknown) => Buffer.concat([Buffer.from([tag]), json(value)]);

describe("device preview wire-input authorization", () => {
  it("permits only bounded video recovery on an Android view socket", () => {
    const result = filterDevicePreviewInput("android", json({ type: "reset-video" }), false, false);
    expect(result).toEqual({ data: '{"type":"reset-video","ack":false}', control: false });
    for (const input of [
      { type: "touch", action: "down", x: 0.2, y: 0.3 },
      { type: "text", text: "visible consent required" },
      { type: "key", keycode: 29, action: "down" },
    ])
      expect(() => filterDevicePreviewInput("android", json(input), false, false)).toThrow(
        expect.objectContaining({ status: 403 }),
      );
  });

  it("normalizes admitted control packets and disables upstream recording", () => {
    const input = { type: "touch", action: "down", x: 0.2, y: 0.3, pointerId: 1, ack: true };
    const result = filterDevicePreviewInput("android", json(input), false, true);
    expect(JSON.parse(result.data as string)).toEqual({ ...input, ack: false, record: false });
    expect(result.control).toBe(true);
  });

  it.each([
    { type: "exec", command: "echo arbitrary" },
    { type: "touch", action: "down", x: 1.1, y: 0.3 },
    { type: "touch", action: "down", x: 0, y: 0, pointerId: 2 },
    { type: "text", text: "x".repeat(2001) },
    { type: "key", keycode: 1, action: "hold" },
    { type: "reset-video", device: "another-emulator" },
    { type: "home", record: true },
    { type: "install", path: "/unrelated.apk" },
  ])("rejects unsupported Android packet fields before forwarding: %j", (input) => {
    expect(() => filterDevicePreviewInput("android", json(input), false, true)).toThrow(
      expect.objectContaining({ status: 400 }),
    );
  });

  it("denies iOS keyboard setup and HID packets to a view lease", () => {
    expect(() =>
      filterDevicePreviewInput("ios", ios(0x0e, { enabled: false }), true, false),
    ).toThrow(expect.objectContaining({ status: 403 }));
    expect(() =>
      filterDevicePreviewInput("ios", ios(0x06, { type: "down", usage: 4 }), true, false),
    ).toThrow(expect.objectContaining({ status: 403 }));
    const result = filterDevicePreviewInput(
      "ios",
      ios(0x03, { type: "begin", x: 0.4, y: 0.5 }),
      true,
      true,
    );
    expect(result.data).toEqual(ios(0x03, { type: "begin", x: 0.4, y: 0.5 }));
  });

  it("refuses arbitrary iOS tags, trailing fields and malformed/oversized frames", () => {
    for (const [platform, data, binary] of [
      ["ios", ios(0x07, { orientation: "landscape_left" }), true],
      ["ios", ios(0x06, { type: "down", usage: 4, command: "exec" }), true],
      ["ios", ios(0x03, { type: "begin", x: null, y: 0 }), true],
      ["android", json({ type: "home" }), true],
      ["android", Buffer.from("{"), false],
      ["android", Buffer.alloc(DEVICE_PREVIEW_MAX_INPUT_BYTES + 1), false],
    ] as const)
      expect(() => filterDevicePreviewInput(platform, data, binary, true)).toThrow(
        expect.objectContaining({ status: 400 }),
      );
  });

  it("releases only presses admitted on the retired socket and does not retain them for reconnect", () => {
    const state = new DevicePreviewInputState("android");
    const admit = (value: unknown) =>
      state.accept(filterDevicePreviewInput("android", json(value), false, true).data);
    admit({ type: "touch", action: "down", x: 0.2, y: 0.3, pointerId: 0 });
    admit({ type: "touch", action: "move", x: 0.4, y: 0.5, pointerId: 0 });
    admit({ type: "key", action: "down", keycode: 29 });
    admit({ type: "key", action: "down", keycode: 30 });
    admit({ type: "key", action: "up", keycode: 30 });
    expect(state.release().map((packet) => JSON.parse(String(packet)))).toEqual([
      { type: "touch", action: "up", pointerId: 0, x: 0.4, y: 0.5, ack: false, record: false },
      { type: "key", action: "up", keycode: 29, ack: false, record: false },
    ]);
    expect(state.release()).toEqual([]);
    expect(new DevicePreviewInputState("android").release()).toEqual([]);
    expect(() => admit({ type: "touch", action: "move", x: 0.2, y: 0.3 })).toThrow(
      expect.objectContaining({ code: "invalid_device_preview_input" }),
    );
  });

  it("bounds retained keys and releases iOS touches/HID only on their owning stream", () => {
    const state = new DevicePreviewInputState("ios");
    state.accept(ios(0x03, { type: "begin", x: 0.2, y: 0.3 }));
    for (let usage = 1; usage <= 32; usage++) state.accept(ios(0x06, { type: "down", usage }));
    expect(() => state.accept(ios(0x06, { type: "down", usage: 33 }))).toThrow(
      expect.objectContaining({ code: "invalid_device_preview_input" }),
    );
    const released = state.release();
    expect(released).toHaveLength(33);
    expect(released[0]).toEqual(ios(0x03, { type: "end", x: 0.2, y: 0.3 }));
    expect(released[1]).toEqual(ios(0x06, { type: "up", usage: 1 }));
    expect(state.release()).toEqual([]);
  });
});
