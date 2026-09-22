import { describe, expect, it } from "vitest";
import { builtClientHtmlFile, isBuiltClientAssetPath, isLegacyClientPath } from "./staticClientApp";

describe("built canonical client", () => {
  it("serves only the canonical root entry", () => {
    expect(builtClientHtmlFile("/")).toBe("index.html");
    expect(builtClientHtmlFile("/index.html")).toBe("index.html");
    expect(builtClientHtmlFile("/desktop")).toBeNull();
    expect(builtClientHtmlFile("/app/threads/example")).toBeNull();
    expect(builtClientHtmlFile("/mobile.html")).toBeNull();
    expect(builtClientHtmlFile("/assets/client.js")).toBeNull();
  });

  it("identifies every retired app entry for migration redirects", () => {
    expect(isLegacyClientPath("/desktop")).toBe(true);
    expect(isLegacyClientPath("/desktop/projects/example")).toBe(true);
    expect(isLegacyClientPath("/app")).toBe(true);
    expect(isLegacyClientPath("/app/threads/example")).toBe(true);
    expect(isLegacyClientPath("/pair")).toBe(true);
    expect(isLegacyClientPath("/mobile.html")).toBe(true);
    expect(isLegacyClientPath("/")).toBe(false);
  });

  it("serves canonical build assets and install icons from the bundled client", () => {
    expect(isBuiltClientAssetPath("/assets/client.js")).toBe(true);
    expect(isBuiltClientAssetPath("/icons/icon-192.png")).toBe(true);
    expect(isBuiltClientAssetPath("/api/icons/icon-192.png")).toBe(false);
  });

  it("serves the PWA root files and the embedded SSH runtime from the bundled client", () => {
    expect(isBuiltClientAssetPath("/manifest.webmanifest")).toBe(true);
    expect(isBuiltClientAssetPath("/service-worker.js")).toBe(true);
    expect(isBuiltClientAssetPath("/app-icon.svg")).toBe(true);
    expect(isBuiltClientAssetPath("/app-icon-nightly.svg")).toBe(true);
    expect(isBuiltClientAssetPath("/notification.mp3")).toBe(true);
    expect(isBuiltClientAssetPath("/robots.txt")).toBe(true);
    expect(isBuiltClientAssetPath("/poracode-ssh-runtime/manifest.json")).toBe(true);
    expect(isBuiltClientAssetPath("/poracode-ssh-runtime/runtime.bin")).toBe(true);
  });

  it("never widens the static surface to arbitrary files", () => {
    expect(isBuiltClientAssetPath("/poracode-ssh-runtime/other.bin")).toBe(false);
    expect(isBuiltClientAssetPath("/poracode-ssh-runtime/")).toBe(false);
    expect(isBuiltClientAssetPath("/assets")).toBe(false);
    expect(isBuiltClientAssetPath("/assets/")).toBe(false);
    expect(isBuiltClientAssetPath("/icons")).toBe(false);
    expect(isBuiltClientAssetPath("/secrets.json")).toBe(false);
    expect(isBuiltClientAssetPath("/.well-known/assetlinks.json")).toBe(false);
    expect(isBuiltClientAssetPath("/assets\\..\\secrets.json")).toBe(false);
  });
});
