import { registerPlugin } from "@capacitor/core";

import type { ActivityBridgePlugin } from "./definitions";

/**
 * `@lightcode/activity-bridge` — thin bridge to iOS ActivityKit.
 *
 * On iOS the native `ActivityBridgePlugin` (Swift) handles everything. On the
 * web and on Android there is no native implementation, so Capacitor falls back
 * to the no-op `ActivityBridgeWeb` (every method resolves null / does nothing).
 */
const ActivityBridge = registerPlugin<ActivityBridgePlugin>("ActivityBridge", {
  web: () => import("./web").then((m) => new m.ActivityBridgeWeb()),
});

export * from "./definitions";
export { ActivityBridge };
