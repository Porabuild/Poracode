import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildLocalPairingIconSvg,
  buildLocalPairingManifestJson,
  buildLocalPairingServiceWorkerJs,
} from "@/main/remote/pairingPage";
import { PORACODE_CHANNELS, productNameFor } from "@/shared/channel";

// Stable and nightly PWAs are installed side by side (separate origins for the
// hosted build, separate desktops for the paired one). Nothing but the icon and
// the name distinguishes them on a home screen, so both must be channel-aware.

// Every icon the hosted build references, and the nightly art it swaps in.
// scripts/finalize-mobile-build.mjs performs the swap; this list is the
// contract, so a new icon added to the manifest or mobile.html without a
// nightly counterpart fails here.
const HOSTED_ICON_PAIRS: Readonly<Record<string, string>> = {
  "icons/icon-192.png": "icons/icon-nightly-192.png",
  "icons/icon-512.png": "icons/icon-nightly-512.png",
  "icons/icon-maskable-512.png": "icons/icon-nightly-maskable-512.png",
  "icons/apple-touch-icon.png": "icons/apple-touch-icon-nightly.png",
  "app-icon.svg": "app-icon-nightly.svg",
};

function hostedIconRefs(): Set<string> {
  const sources = [
    readFileSync("public/manifest.webmanifest", "utf8"),
    readFileSync("mobile.html", "utf8"),
  ].join("\n");
  return new Set(sources.match(/icons\/[\w.-]+\.png|app-icon\.svg/g) ?? []);
}

describe("PWA channel icons", () => {
  it("pairs every hosted icon reference with committed nightly art", () => {
    expect([...hostedIconRefs()].sort()).toEqual(Object.keys(HOSTED_ICON_PAIRS).sort());
    for (const [stable, nightly] of Object.entries(HOSTED_ICON_PAIRS)) {
      expect(existsSync(`public/${stable}`), `missing public/${stable}`).toBe(true);
      expect(existsSync(`public/${nightly}`), `missing public/${nightly}`).toBe(true);
    }
  });

  it.each(PORACODE_CHANNELS)("names the %s paired PWA after its channel", (channel) => {
    const manifest = JSON.parse(buildLocalPairingManifestJson(channel));
    expect(manifest.name).toBe(productNameFor(channel));
    expect(manifest.short_name).toBe(productNameFor(channel));
  });

  it.each(PORACODE_CHANNELS)("serves committed PNG art to the %s paired PWA", (channel) => {
    const manifest = JSON.parse(buildLocalPairingManifestJson(channel));
    const pngs = (manifest.icons as { src: string }[])
      .map((icon) => icon.src)
      .filter((src) => src.endsWith(".png"));
    expect(pngs).toHaveLength(3);
    for (const src of pngs) {
      expect(existsSync(`public${src}`), `missing public${src}`).toBe(true);
    }
  });

  it("gives the two paired channels disjoint PNG art", () => {
    const srcs = (channel: (typeof PORACODE_CHANNELS)[number]) =>
      (JSON.parse(buildLocalPairingManifestJson(channel)).icons as { src: string }[])
        .map((icon) => icon.src)
        .filter((src) => src.endsWith(".png"));
    const nightly = new Set(srcs("nightly"));
    expect(srcs("stable").filter((src) => nightly.has(src))).toEqual([]);
  });

  it.each(PORACODE_CHANNELS)("brands the %s inline pairing icon", (channel) => {
    const svg = buildLocalPairingIconSvg(channel);
    expect(svg).toContain(`aria-label="${productNameFor(channel)}"`);
    expect(svg).toContain("<rect");
  });

  it("draws the nightly pairing icon on the teal tile", () => {
    expect(buildLocalPairingIconSvg("nightly")).toContain("#3BE0DA");
    expect(buildLocalPairingIconSvg("stable")).not.toContain("#3BE0DA");
  });

  it.each(PORACODE_CHANNELS)("resolves the %s worker's notification icon", (channel) => {
    const worker = buildLocalPairingServiceWorkerJs("1.2.3", channel);
    expect(worker).not.toContain("__PORACODE_LOCAL_NOTIFICATION_ICON__");
    const expected = channel === "nightly" ? "icon-nightly-192.png" : "icon-192.png";
    expect(worker).toContain(`icon: "/icons/${expected}"`);
  });

  it("leaves the hosted worker's notification icon for the build to substitute", () => {
    // scripts/finalize-mobile-build.mjs hard-fails if this token disappears.
    expect(readFileSync("public/service-worker.js", "utf8")).toContain(
      "__PORACODE_NOTIFICATION_ICON__",
    );
  });
});
