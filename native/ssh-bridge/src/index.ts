import { registerPlugin } from "@capacitor/core";
import type { SshBridgePlugin } from "./definitions";

const SshBridge = registerPlugin<SshBridgePlugin>("SshBridge", {
  web: () => import("./web").then((module) => new module.SshBridgeWeb()),
});

export * from "./definitions";
export { SshBridge };
