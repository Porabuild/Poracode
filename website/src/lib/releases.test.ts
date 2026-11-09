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
