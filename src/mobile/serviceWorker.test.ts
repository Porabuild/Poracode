import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildLocalPairingServiceWorkerJs } from "@/main/remote/pairingPage";

describe("PWA service workers", () => {
  it.each([
    ["hosted", readFileSync("public/service-worker.js", "utf8")],
    ["desktop-served", buildLocalPairingServiceWorkerJs("test")],
  ])("%s worker handles push display and notification routing", (_surface, worker) => {
    expect(worker).toContain('self.addEventListener("push"');
    expect(worker).toContain("self.registration.showNotification");
    expect(worker).toContain('self.addEventListener("notificationclick"');
    expect(worker).toContain("self.clients.openWindow(targetUrl)");
    expect(worker).toContain('client.visibilityState === "visible"');
  });
});
