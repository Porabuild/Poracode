import { z } from "zod";
import { deviceActionSchema } from "@/shared/deviceWorkspace";
import type { AppControlsToolContext, ToolDomain } from "./types";

function service(ctx: AppControlsToolContext) {
  if (!ctx.deviceWorkspace || !ctx.identity.threadId || !ctx.getThread(ctx.identity.threadId))
    throw new Error("Device workspace is unavailable for this caller.");
  const { deviceWorkspace: devices } = ctx;
  const threadId = ctx.identity.threadId;
  const authorize = () => {
    if (ctx.settings.read().installedPlugins?.devices?.enabled === false)
      throw new Error("The Devices plugin is disabled. Enable it in Plugins to use device tools.");
    if (!ctx.getThread(threadId)) throw new Error("The owning thread is unavailable.");
    devices.authorizeAgent(threadId, ctx.identity.deviceProof);
  };
  authorize();
  return { devices, threadId, authorize };
}
const emptySchema = { type: "object", properties: {}, additionalProperties: false };
export const deviceTools: ToolDomain = {
  specs: [
    {
      name: "list_devices",
      description:
        "Discover this thread host's iOS Simulators and Android Emulators and prerequisites. iOS requires macOS/Xcode; simulator input and accessibility also require Meta idb and idb_companion. Android requires Android SDK Emulator/platform-tools and an AVD. Does not attach or grant access. Physical phones and desktop OS automation are not this device workspace.",
      inputSchema: emptySchema,
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
        "Start or send tap/swipe/text/hardware-key input to this thread's attached control-mode device while the Devices plugin is enabled. No separate agent-consent prompt, host-desktop input, shell commands, device shutdown, arbitrary targets, or permission elevation. For coordinates capture a fresh screenshot first; on a stale-frame error capture again. ADB text accepts printable ASCII; iOS has no Back key.",
      inputSchema: { ...z.toJSONSchema(deviceActionSchema), type: "object" },
    },
  ],
  handlers: {
    list_devices: (_args, ctx) => service(ctx).devices.discover(),
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
      await devices.action(threadId, principal, session.id, action, undefined, authorize);
      return { version: 1, delivered: true };
    },
  },
};
