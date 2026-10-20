import { lookup } from "node:dns/promises";
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  artworkDeclarations,
  downloadPluginArtwork,
  loadPluginArtwork,
  readArtworkFile,
} from "./pluginArtwork";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn<typeof lookup>() }));

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function setup() {
  const root = mkdtempSync(join(tmpdir(), "plugin-artwork-"));
  roots.push(root);
  return root;
}

describe("plugin artwork", () => {
  it("uses authored logo/composerIcon/icon declarations in priority order", () => {
    expect(
      artworkDeclarations({
        icon: "fallback.png",
        interface: { logo: "logo.png", composerIcon: "glyph.svg" },
      }),
    ).toEqual(["logo.png", "glyph.svg", "fallback.png"]);
    expect(artworkDeclarations({ icon: {}, interface: { logo: "x".repeat(2049) } })).toEqual([]);
  });

  it("rasterizes contained authored artwork to a bounded PNG and skips a missing preferred logo", async () => {
    const root = setup();
    writeFileSync(
      join(root, "icon.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path fill="#55aaff" d="M0 0h32v32H0z"/></svg>',
    );
    const icon = await loadPluginArtwork(root, ["missing.png", "./icon.svg"]);
    expect(icon).toMatch(/^data:image\/png;base64,/u);
    const metadata = await sharp(Buffer.from(icon!.split(",")[1]!, "base64")).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBeLessThanOrEqual(64);
  });

  it("refuses traversal, absolute paths, linked escapes, oversized files and non-image data", async () => {
    const root = setup();
    const outside = setup();
    writeFileSync(join(outside, "secret.png"), "private data");
    symlinkSync(outside, join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
    for (const path of [
      "../secret.png",
      join(outside, "secret.png"),
      "linked/secret.png",
      "file:///secret.png",
    ]) {
      await expect(readArtworkFile(root, path)).rejects.toThrow(/(path|root)/u);
    }
    writeFileSync(join(root, "large.png"), Buffer.alloc(256 * 1024 + 1));
    await expect(readArtworkFile(root, "large.png")).rejects.toThrow("size limit");
    writeFileSync(join(root, "fake.png"), "not an image");
    expect(await loadPluginArtwork(root, ["fake.png"])).toBeUndefined();
  });

  it("does not render SVG external resources or oversized decoded images", async () => {
    const root = setup();
    for (const [index, svg] of [
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.org/pixel"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject>author content</foreignObject></svg>',
      '<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"/>',
      '<svg xmlns="http://www.w3.org/2000/svg" width="10000" height="10000"/>',
    ].entries()) {
      const path = `unsafe-${index}.svg`;
      writeFileSync(join(root, path), svg);
      expect(await loadPluginArtwork(root, [path])).toBeUndefined();
    }
  });

  it("rejects DNS names resolving to private, link-local, carrier NAT and reserved IPv4 before connecting", async () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "198.18.0.1",
      "224.0.0.1",
    ]) {
      vi.mocked(lookup).mockResolvedValue({ address, family: 4 });
      await expect(downloadPluginArtwork("https://images.example/icon.png")).rejects.toThrow(
        "Non-public artwork address",
      );
    }
  });

  it("refuses non-HTTPS, credentials, IP literals and nonstandard ports before opening a socket", () => {
    for (const url of [
      "http://example.org/icon.png",
      "https://user:password@example.org/icon",
      "https://127.0.0.1/icon",
      "https://[::1]/icon",
      "https://example.org:444/icon",
    ]) {
      expect(() => downloadPluginArtwork(url)).toThrow("Unsupported artwork URL");
    }
  });
});
