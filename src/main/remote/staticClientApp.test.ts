import { describe, expect, it } from "vitest";
import { isReservedForwardProxyPath } from "./server/portForwardProxy";
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

  it("never forwards canonical or migration routes to a proxied development server", () => {
    expect(isReservedForwardProxyPath("/desktop")).toBe(true);
    expect(isReservedForwardProxyPath("/desktop/projects/example")).toBe(true);
    expect(isReservedForwardProxyPath("/app")).toBe(true);
    expect(isReservedForwardProxyPath("/app/threads/example")).toBe(true);
    expect(isReservedForwardProxyPath("/")).toBe(true);
  });
});
