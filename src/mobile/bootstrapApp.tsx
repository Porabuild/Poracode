// The mobile app tree, behind a dynamic import so its module-evaluation side
// effects — the `window.poracode` bridge shim, and the router module's
// `capturePairingLaunch()` which parses window.location at import time — run
// *after* main.tsx has installed the global error handlers. A throw here is
// then caught and shown as a readable crash screen instead of a black screen
// (the failure mode this indirection exists to prevent on iOS standalone).
import "./installBridge";
import "@/renderer/components/providers/bootstrap";
import { RouterProvider } from "@tanstack/react-router";
import { AppProvider } from "@/renderer/components/ui/provider";
import { router } from "./router";

export { registerServiceWorker } from "./registerServiceWorker";

export function MobileApp() {
  return (
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  );
}
