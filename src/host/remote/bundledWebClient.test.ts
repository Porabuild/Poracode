import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import {
  bundledWebClientAssetPath,
  bundledWebClientCacheControl,
  bundledWebClientContentType,
  bundledWebClientDocumentPath,
  isLegacyClientPath,
  isSpaNavigationRequest,
} from "./bundledWebClient";

function navigationRequest(method: string, accept?: string): IncomingMessage {
  return { method, headers: accept === undefined ? {} : { accept } } as IncomingMessage;
}

describe("bundled web client asset registry", () => {
  it("maps the canonical entry to the bundled document", () => {
    expect(bundledWebClientDocumentPath("/")).toBe("index.html");
    expect(bundledWebClientDocumentPath("/index.html")).toBe("index.html");
    expect(bundledWebClientDocumentPath("/thread/abc")).toBeNull();
  });

  it("allowlists the built root files, hashed assets and embedded SSH runtime", () => {
    expect(bundledWebClientAssetPath("/manifest.webmanifest")).toBe("manifest.webmanifest");
    expect(bundledWebClientAssetPath("/service-worker.js")).toBe("service-worker.js");
    expect(bundledWebClientAssetPath("/app-icon.svg")).toBe("app-icon.svg");
    expect(bundledWebClientAssetPath("/app-icon-nightly.svg")).toBe("app-icon-nightly.svg");
    expect(bundledWebClientAssetPath("/notification.mp3")).toBe("notification.mp3");
    expect(bundledWebClientAssetPath("/robots.txt")).toBe("robots.txt");
    expect(bundledWebClientAssetPath("/assets/index-abc123.js")).toBe("assets/index-abc123.js");
    expect(bundledWebClientAssetPath("/icons/icon-512.png")).toBe("icons/icon-512.png");
    expect(bundledWebClientAssetPath("/poracode-ssh-runtime/manifest.json")).toBe(
      "poracode-ssh-runtime/manifest.json",
    );
    expect(bundledWebClientAssetPath("/poracode-ssh-runtime/runtime.bin")).toBe(
      "poracode-ssh-runtime/runtime.bin",
    );
  });

  it("refuses every path outside the explicit allowlist", () => {
    expect(bundledWebClientAssetPath("/")).toBeNull();
    expect(bundledWebClientAssetPath("/index.html")).toBeNull();
    expect(bundledWebClientAssetPath("/assets")).toBeNull();
    expect(bundledWebClientAssetPath("/assets/")).toBeNull();
    expect(bundledWebClientAssetPath("/icons/")).toBeNull();
    expect(bundledWebClientAssetPath("/poracode-ssh-runtime/")).toBeNull();
    expect(bundledWebClientAssetPath("/poracode-ssh-runtime/other.bin")).toBeNull();
    expect(bundledWebClientAssetPath("/poracode-ssh-runtime/../secrets.json")).toBeNull();
    expect(bundledWebClientAssetPath("/package.json")).toBeNull();
    expect(bundledWebClientAssetPath("/.well-known/assetlinks.json")).toBeNull();
    expect(bundledWebClientAssetPath("/api/icons/icon-192.png")).toBeNull();
    expect(bundledWebClientAssetPath("/assets\\secrets.json")).toBeNull();
    expect(bundledWebClientAssetPath("/assets/secret\0.js")).toBeNull();
  });

  it("uses the canonical MIME types for the shipped extensions", () => {
    expect(bundledWebClientContentType("assets/index.js")).toBe(
      "application/javascript; charset=utf-8",
    );
    expect(bundledWebClientContentType("manifest.webmanifest")).toBe(
      "application/manifest+json; charset=utf-8",
    );
    expect(bundledWebClientContentType("notification.mp3")).toBe("audio/mpeg");
    expect(bundledWebClientContentType("robots.txt")).toBe("text/plain; charset=utf-8");
    expect(bundledWebClientContentType("poracode-ssh-runtime/runtime.bin")).toBe(
      "application/octet-stream",
    );
    expect(bundledWebClientContentType("poracode-ssh-runtime/manifest.json")).toBe(
      "application/json; charset=utf-8",
    );
    expect(bundledWebClientContentType("icons/icon-512.png")).toBe("image/png");
    expect(bundledWebClientContentType("unknown.weird")).toBe("application/octet-stream");
  });

  it("mirrors the hosted PWA cache policy", () => {
    expect(bundledWebClientCacheControl("assets/index.js")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(bundledWebClientCacheControl("icons/icon-512.png")).toBe("public, max-age=604800");
    expect(bundledWebClientCacheControl("service-worker.js")).toBe(
      "no-cache, no-store, must-revalidate",
    );
    expect(bundledWebClientCacheControl("index.html")).toBe("no-cache");
    expect(bundledWebClientCacheControl("manifest.webmanifest")).toBe("no-cache");
    expect(bundledWebClientCacheControl("poracode-ssh-runtime/runtime.bin")).toBe("no-cache");
  });

  it("identifies retired app entries", () => {
    expect(isLegacyClientPath("/desktop/projects/example")).toBe(true);
    expect(isLegacyClientPath("/app/threads/example")).toBe(true);
    expect(isLegacyClientPath("/pair")).toBe(true);
    expect(isLegacyClientPath("/mobile.html")).toBe(true);
    expect(isLegacyClientPath("/")).toBe(false);
  });
});

describe("SPA deep-link refresh classification", () => {
  it("accepts only HTML navigations outside the reserved and static namespaces", () => {
    expect(
      isSpaNavigationRequest(navigationRequest("GET", "text/html,*/*;q=0.8"), "/thread/abc"),
    ).toBe(true);
    expect(isSpaNavigationRequest(navigationRequest("GET", "text/html"), "/thread/")).toBe(true);
    expect(isSpaNavigationRequest(navigationRequest("HEAD", "text/html"), "/thread/abc")).toBe(
      true,
    );
  });

  it("never answers API/auth traffic, static paths, files or non-navigations", () => {
    expect(isSpaNavigationRequest(navigationRequest("GET", "text/html"), "/api")).toBe(false);
    expect(isSpaNavigationRequest(navigationRequest("GET", "text/html"), "/api/snapshot")).toBe(
      false,
    );
    expect(isSpaNavigationRequest(navigationRequest("GET", "text/html"), "/oauth/token")).toBe(
      false,
    );
    expect(
      isSpaNavigationRequest(
        navigationRequest("GET", "text/html"),
        "/.well-known/poracode/environment",
      ),
    ).toBe(false);
    expect(isSpaNavigationRequest(navigationRequest("GET", "text/html"), "/forward/abc")).toBe(
      false,
    );
    expect(isSpaNavigationRequest(navigationRequest("GET", "text/html"), "/ws")).toBe(false);
    expect(
      isSpaNavigationRequest(navigationRequest("GET", "text/html"), "/assets/missing.js"),
    ).toBe(false);
    expect(
      isSpaNavigationRequest(navigationRequest("GET", "text/html"), "/manifest.webmanifest"),
    ).toBe(false);
    expect(isSpaNavigationRequest(navigationRequest("GET", "text/html"), "/desktop")).toBe(false);
    expect(isSpaNavigationRequest(navigationRequest("GET", "text/html"), "/thread/a.b")).toBe(
      false,
    );
    expect(isSpaNavigationRequest(navigationRequest("GET", "text/html"), "/secrets.json")).toBe(
      false,
    );
    expect(
      isSpaNavigationRequest(navigationRequest("GET", "application/json"), "/thread/abc"),
    ).toBe(false);
    expect(isSpaNavigationRequest(navigationRequest("GET"), "/thread/abc")).toBe(false);
    expect(isSpaNavigationRequest(navigationRequest("POST", "text/html"), "/thread/abc")).toBe(
      false,
    );
    expect(isSpaNavigationRequest(navigationRequest("OPTIONS", "text/html"), "/thread/abc")).toBe(
      false,
    );
  });
});
