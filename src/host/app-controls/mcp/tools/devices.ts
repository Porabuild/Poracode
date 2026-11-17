import { z } from "zod";
import { deviceActionSchema } from "@/shared/deviceWorkspace";
import { callerPluginOverrides } from "./pluginOverrides";
import type { AppControlsToolContext, ToolDomain } from "./types";

function service(ctx: AppControlsToolContext) {
  if (!ctx.deviceWorkspace || !ctx.identity.threadId || !ctx.getThread(ctx.identity.threadId))
    throw new Error("Device workspace is unavailable for this caller.");
  const { deviceWorkspace: devices } = ctx;
  const threadId = ctx.identity.threadId;
  const authorize = () => {
    const override = callerPluginOverrides(ctx)?.devices;
    if ((override ?? ctx.settings.read().installedPlugins?.devices?.enabled) === false)
      throw new Error(
        "The Devices plugin is disabled for this thread. Enable it in Plugins (or in this project's Plugins settings) to use device tools.",
      );
    if (!ctx.getThread(threadId)) throw new Error("The owning thread is unavailable.");
    devices.authorizeAgent(threadId, ctx.identity.deviceProof);
  };
  authorize();
  return { devices, threadId, authorize };
}
const emptySchema = { type: "object", properties: {}, additionalProperties: false };
const openDeviceSchema = z.strictObject({
  deviceId: z.string().min(1).max(256),
  access: z.enum(["view", "control"]).optional(),
});
export const deviceTools: ToolDomain = {
  specs: [
    {
      name: "list_devices",
      description:
        "Discover this thread host's iOS Simulators and Android Emulators and prerequisites. iOS requires macOS/Xcode; simulator input and accessibility also require Meta idb and idb_companion. Android requires Android SDK Emulator/platform-tools and an AVD. Devices flagged foldable are iPhone Duo simulators; the iOS platform entry reports foldableRuntimeAvailable/foldableDeviceExists plus a diagnostic when no Duo-capable runtime is installed. Does not attach or grant access; use open_device to attach. Physical phones and desktop OS automation are not this device workspace.",
      inputSchema: emptySchema,
    },
    {
      name: "open_device",
      description:
        "Attach a device from list_devices to this thread in Poracode's device workspace, starting it first when it is stopped and access is control (the default). Call list_devices first and pass one of its device ids. The attached device opens in the Poracode panel; screenshot_device, inspect_device, and control_device then act on it. iPhone Duo requires Xcode 27.1+ and its own iOS runtime; if no Duo exists, the user can create one from the device panel when a Duo-capable runtime is installed. Never launch the standalone Simulator app or a separate emulator window.",
      inputSchema: { ...z.toJSONSchema(openDeviceSchema), type: "object" },
    },
    {
      name: "screenshot_device",
      description:
        "Capture the device attached to this thread in Poracode's device workspace. The Devices plugin must be enabled; no separate agent-consent prompt is needed. Returns a bounded screenshot and frameId. Coordinates in control_device use normalized 0..1 image coordinates and this frameId. Access expires and is host/thread scoped.",
      inputSchema: emptySchema,
    },
    {
      name: "inspect_device",
      description:
        "Inspect the accessibility hierarchy of the device attached to this thread while the Devices plugin is enabled. Returns Android UIAutomator XML or iOS idb JSON; app accessibility exposure determines completeness.",
      inputSchema: emptySchema,
    },
    {
      name: "control_device",
      description:
        "Start or send tap/swipe/text/hardware-key input to this thread's attached control-mode device while the Devices plugin is enabled. No separate agent-consent prompt, host-desktop input, shell commands, device shutdown, arbitrary targets, or permission elevation. For coordinates capture a fresh screenshot first; on a stale-frame error capture again. ADB text accepts printable ASCII; iOS has no Back key. On a foldable iPhone Duo, kind \"fold\" sets the hinge angle: 0 is closed (outer display), 90 is half-open, 180 is open (inner display). A fold takes seconds to settle and returns controls.hingeAngle/controls.activeDisplay; afterwards call screenshot_device again because earlier frameIds are stale. iOS accessibility frames may keep the outer display's coordinate space while unfolded, so prefer fresh screenshots after folding.",
      inputSchema: { ...z.toJSONSchema(deviceActionSchema), type: "object" },
    },
  ],
  handlers: {
    list_devices: (_args, ctx) => service(ctx).devices.discover(),
    open_device: async (args, ctx) => {
      const input = openDeviceSchema.parse(args);
      const { devices, threadId, authorize } = service(ctx);
      return devices.attachForAgent(threadId, input.deviceId, input.access ?? "control", authorize);
    },
    screenshot_device: async (_args, ctx) => {
      const { devices, threadId, authorize } = service(ctx);
      const { principal, session } = devices.agentSession(threadId);
      return devices.frame(threadId, principal, session.id, undefined, authorize);
    },
    inspect_device: (_args, ctx) => {
      const { devices, threadId, authorize } = service(ctx);
      const { principal, session } = devices.agentSession(threadId);
      return devices.inspect(threadId, principal, session.id, undefined, authorize);
    },
    control_device: async (args, ctx) => {
      const action = deviceActionSchema.parse(args);
      const { devices, threadId, authorize } = service(ctx);
      const { principal, session } = devices.agentSession(threadId, true);
      const controls = await devices.action(
        threadId,
        principal,
        session.id,
        action,
        undefined,
        authorize,
      );
      return { version: 1, delivered: true, ...(controls ? { controls } : {}) };
    },
  },
};
