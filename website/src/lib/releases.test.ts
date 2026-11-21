import { afterEach, describe, expect, it, vi } from "vitest";
import { getLatestRelease, getNpmLauncherVersion } from "./releases";

afterEach(() => {
  vi.unstubAllGlobals();
});

function githubRelease(assets: readonly { name: string }[]): Response {
  return new Response(
    JSON.stringify({
      tag_name: "v2.1.0",
      html_url: "https://github.com/Porabuild/Poracode/releases/tag/v2.1.0",
      assets: assets.map((asset) => ({
        ...asset,
        browser_download_url: `https://example.test/${asset.name}`,
      })),
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("getLatestRelease", () => {
  it("marks cliInstaller only when the release carries SHA256SUMS", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => githubRelease([{ name: "SHA256SUMS" }])),
    );
    expect((await getLatestRelease()).cliInstaller).toBe(true);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => githubRelease([{ name: "Poracode-2.1.0-x64.dmg" }])),
    );
    expect((await getLatestRelease()).cliInstaller).toBe(false);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("oops", { status: 500 })),
    );
    const fallback = await getLatestRelease();
    expect(fallback.version).toBeNull();
    expect(fallback.cliInstaller).toBe(false);
  });

  it("matches Linux x64 and ARM64 AppImage and Arch/Omarchy pacman assets for stable and nightly builds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        githubRelease([
          { name: "Poracode-Linux-x86_64.AppImage" },
          { name: "Poracode-Linux-arm64.AppImage" },
          { name: "Poracode-2.1.0-arm64.deb" },
          { name: "Poracode-2.1.0-x64.pacman" },
          { name: "Poracode-2.1.0-aarch64.pacman" },
        ]),
      ),
    );
    const stable = await getLatestRelease();
    expect(stable.downloads["linux-x64"]).toBe(
      "https://example.test/Poracode-Linux-x86_64.AppImage",
    );
    expect(stable.downloads["linux-arm64"]).toBe(
      "https://example.test/Poracode-Linux-arm64.AppImage",
    );
    expect(stable.downloads["linux-pacman-x64"]).toBe(
      "https://example.test/Poracode-2.1.0-x64.pacman",
    );
    expect(stable.downloads["linux-pacman-arm64"]).toBe(
      "https://example.test/Poracode-2.1.0-aarch64.pacman",
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        githubRelease([
          { name: "Poracode-Nightly-Linux-x86_64.AppImage" },
          { name: "Poracode-Nightly-Linux-arm64.AppImage" },
          { name: "Poracode-Nightly-2.1.0-nightly.202611210000-x64.pacman" },
          { name: "Poracode-Nightly-2.1.0-nightly.202611210000-aarch64.pacman" },
        ]),
      ),
    );
    const nightly = await getLatestRelease();
    expect(nightly.downloads["linux-x64"]).toBe(
      "https://example.test/Poracode-Nightly-Linux-x86_64.AppImage",
    );
    expect(nightly.downloads["linux-arm64"]).toBe(
      "https://example.test/Poracode-Nightly-Linux-arm64.AppImage",
    );
    expect(nightly.downloads["linux-pacman-x64"]).toBe(
      "https://example.test/Poracode-Nightly-2.1.0-nightly.202611210000-x64.pacman",
    );
    expect(nightly.downloads["linux-pacman-arm64"]).toBe(
      "https://example.test/Poracode-Nightly-2.1.0-nightly.202611210000-aarch64.pacman",
    );
  });
});

describe("getNpmLauncherVersion", () => {
  it("returns the published launcher version", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ version: "1.2.3" })),
    );
    expect(await getNpmLauncherVersion()).toBe("1.2.3");
  });

  it("hides the placeholder, a missing package and every failure", async () => {
    for (const body of [{ version: "0.0.0" }, { version: "nightly" }, {}]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json(body)),
      );
      expect(await getNpmLauncherVersion()).toBeNull();
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404 })),
    );
    expect(await getNpmLauncherVersion()).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("offline"))),
    );
    expect(await getNpmLauncherVersion()).toBeNull();
  });
});
