import { describe, expect, it } from "vitest";
import { legacyBrowserRouteUrl, mobileRouterBasePath } from "./routing";

describe("mobileRouterBasePath", () => {
  it("resolves hosted, desktop-served, and development bases", () => {
    expect(mobileRouterBasePath("/pwa/settings/appearance", "/pwa/")).toBe("/pwa");
    expect(mobileRouterBasePath("/app/settings/appearance", "/")).toBe("/app");
    expect(mobileRouterBasePath("/settings/appearance", "/")).toBe("/");
  });
});

describe("legacyBrowserRouteUrl", () => {
  it("keeps the internal Connections landing at the hosted PWA root", () => {
    expect(legacyBrowserRouteUrl("https://poracode.com/pwa#/desktops", "/pwa/")).toBe(
      "https://poracode.com/pwa",
    );
  });

  it("converts real screens to clean browser paths", () => {
    expect(
      legacyBrowserRouteUrl("https://poracode.com/pwa#/more/settings/appearance", "/pwa/"),
    ).toBe("https://poracode.com/pwa/settings/appearance");
    expect(legacyBrowserRouteUrl("https://poracode.com/pwa#/more", "/pwa/")).toBe(
      "https://poracode.com/pwa/settings",
    );
    expect(legacyBrowserRouteUrl("https://poracode.com/pwa#/more/usage", "/pwa/")).toBe(
      "https://poracode.com/pwa/usage",
    );
    expect(legacyBrowserRouteUrl("https://poracode.com/pwa#/more/projects", "/pwa/")).toBe(
      "https://poracode.com/pwa/projects",
    );
    expect(legacyBrowserRouteUrl("https://poracode.com/pwa#/more/browser", "/pwa/")).toBe(
      "https://poracode.com/pwa/browser",
    );
    expect(legacyBrowserRouteUrl("https://poracode.com/pwa#/more/ports", "/pwa/")).toBe(
      "https://poracode.com/pwa/ports",
    );
    expect(legacyBrowserRouteUrl("https://poracode.com/pwa#/more/settings", "/pwa/")).toBe(
      "https://poracode.com/pwa/settings/desktop",
    );
  });

  it("migrates the previous state-backed route at the development root", () => {
    expect(legacyBrowserRouteUrl("http://localhost:3100/", "/", "/settings/appearance")).toBe(
      "http://localhost:3100/settings/appearance",
    );
  });
});
