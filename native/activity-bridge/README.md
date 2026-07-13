# @poracode/activity-bridge

Local Capacitor 8 plugin bridging the Poracode mobile web layer to iOS
**ActivityKit** (Live Activities / Dynamic Island). No-op on Android and web.

Linked from the repo root as a `file:` dependency:

```jsonc
// package.json
"@poracode/activity-bridge": "file:native/activity-bridge"
```

## JS usage

```ts
import { ActivityBridge } from "@poracode/activity-bridge";

const { liveActivities, pushToStart } = await ActivityBridge.isSupported();
const { token } = await ActivityBridge.getPushToStartToken(); // iOS 17.2+, else null
const { activityId } = await ActivityBridge.startActivity({
  attributes: { desktopId, desktopName },
  contentState: { runningCount, threads },
});
await ActivityBridge.endActivity({ activityId });

const handle = await ActivityBridge.addListener("activityTokenUpdate", ({ activityId, token }) => {
  // register `token` for `activityId` with the desktop's push endpoint
});
```

## TypeScript build

This package ships **plain `.ts` sources** — `main`/`module`/`types` all point
at `src/index.ts` (same pattern as `packages/agents-usage`). Vite compiles it
into the mobile bundle and `tsc` typechecks it because
`native/activity-bridge/src` is listed in the root `tsconfig.json#include`.
There is no `dist/` build step to run.

## iOS integration

Capacitor discovers the plugin via the `capacitor.ios` key in `package.json`.
Both integration paths are provided and compile the same sources under
`ios/Sources/ActivityBridgePlugin`:

- **CocoaPods** (default for `cap add ios`) — `PoracodeActivityBridge.podspec`.
- **Swift Package Manager** (`cap add ios --packagemanager SPM`) — `Package.swift`.

### Shared ActivityAttributes

`ios/Sources/ActivityBridgePlugin/DesktopSessionAttributes.swift` defines the
`DesktopSessionAttributes` type. ActivityKit requires the **exact same** type
in both the app plugin target and the `PoracodeActivities` widget-extension
target, so add this file as a **shared file reference** to the extension target
(do not duplicate it). See `docs/RELEASE_MOBILE.md`.

### Availability

All ActivityKit calls are guarded with `#available`: Live Activities require
iOS 16.2+, push-to-start requires iOS 17.2+. The plugin loads fine on the
Capacitor 8 default deployment target (iOS 14) and simply reports
`isSupported()` as `false` below the floor.
