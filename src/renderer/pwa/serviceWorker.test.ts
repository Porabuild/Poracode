import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const finalizeWebBuild = resolve(import.meta.dirname, "../../../scripts/finalize-web-build.mjs");
const hostedIconPairs = {
  "icons/icon-192.png": "icons/icon-nightly-192.png",
  "icons/icon-512.png": "icons/icon-nightly-512.png",
  "icons/icon-maskable-512.png": "icons/icon-nightly-maskable-512.png",
  "icons/apple-touch-icon.png": "icons/apple-touch-icon-nightly.png",
  "app-icon.svg": "app-icon-nightly.svg",
} as const;

function writeBuildFixture(root: string, workerBody: string): void {
  const output = resolve(root, "dist/web");
  const runtime = resolve(root, "resources/web-ssh-runtime");
  mkdirSync(output, { recursive: true });
  mkdirSync(runtime, { recursive: true });
  writeFileSync(
    resolve(output, "index.html"),
    '<!doctype html><link rel="icon" href="app-icon.svg"><link rel="apple-touch-icon" href="icons/apple-touch-icon.png"><title>Poracode</title>',
  );
  writeFileSync(
    resolve(output, "manifest.webmanifest"),
    JSON.stringify({
      name: "Poracode",
      short_name: "Poracode",
      icons: [
        { src: "icons/icon-192.png" },
        { src: "icons/icon-512.png" },
        { src: "icons/icon-maskable-512.png" },
      ],
    }),
  );
  writeFileSync(
    resolve(output, "service-worker.js"),
    `const CACHE_NAME = "poracode-__PORACODE_BUILD_VERSION__";\nconst ICON = "__PORACODE_NOTIFICATION_ICON__";\n${workerBody}\n`,
  );
  writeFileSync(resolve(runtime, "manifest.json"), "{}");
  writeFileSync(resolve(runtime, "runtime.bin"), "runtime");
  for (const icon of [...Object.keys(hostedIconPairs), ...Object.values(hostedIconPairs)]) {
    mkdirSync(resolve(output, icon, ".."), { recursive: true });
    writeFileSync(resolve(output, icon), icon);
  }
}

function finalizedCacheName(root: string, workerBody: string): string {
  writeBuildFixture(root, workerBody);
  const result = spawnSync(process.execPath, [finalizeWebBuild], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr);
  const match = /const CACHE_NAME = "([^"]+)"/.exec(
    readFileSync(resolve(root, "dist/web/service-worker.js"), "utf8"),
  );
  const cacheName = match?.[1];
  if (!cacheName) throw new Error("Finalized service worker has no cache name");
  return cacheName;
}

describe("canonical service worker", () => {
  it("matches immutable modules across Origin Vary variants for offline startup", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../../../public/service-worker.js"),
      "utf8",
    );

    expect(source).toContain("caches.match(request, { ignoreVary: true })");
  });

  it("invalidates the cache identity when service-worker behavior changes", () => {
    const root = mkdtempSync(resolve(tmpdir(), "poracode-web-build-"));

    try {
      const first = finalizedCacheName(root, "self.first = true;");
      const second = finalizedCacheName(root, "self.second = true;");

      expect(second).not.toBe(first);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("finalizes nightly branding with only existing channel-specific icon assets", () => {
    const root = mkdtempSync(resolve(tmpdir(), "poracode-nightly-web-build-"));
    try {
      writeBuildFixture(root, "self.nightly = true;");
      const result = spawnSync(process.execPath, [finalizeWebBuild], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, PORACODE_WEB_CHANNEL: "nightly" },
      });
      if (result.status !== 0) throw new Error(result.stderr);
      expect(result.status).toBe(0);

      const output = resolve(root, "dist/web");
      const manifest = JSON.parse(
        readFileSync(resolve(output, "manifest.webmanifest"), "utf8"),
      ) as { icons: Array<{ src: string }> };
      const html = readFileSync(resolve(output, "index.html"), "utf8");
      const referenced = [
        ...manifest.icons.map((icon) => icon.src),
        ...Object.values(hostedIconPairs).filter((icon) => html.includes(icon)),
      ];
      for (const icon of referenced) expect(existsSync(resolve(output, icon))).toBe(true);
      expect(html).not.toContain("app-icon.svg");
      expect(html).not.toContain("icons/apple-touch-icon.png");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("canonical web delivery", () => {
  const root = resolve(import.meta.dirname, "../../..");

  it("has no second mobile application entry or build", () => {
    expect(existsSync(resolve(root, "mobile.html"))).toBe(false);
    const mobileSource = resolve(root, "src/mobile");
    const mobileSourceFiles = existsSync(mobileSource)
      ? readdirSync(mobileSource, { recursive: true, withFileTypes: true }).filter((entry) =>
          entry.isFile(),
        )
      : [];
    expect(mobileSourceFiles).toEqual([]);
    expect(existsSync(resolve(root, "scripts/finalize-mobile-build.mjs"))).toBe(false);
    expect(existsSync(resolve(root, "scripts/vercel-build-mobile.mjs"))).toBe(false);

    const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts["build:web"]).toBeDefined();
    expect(packageJson.scripts["build:mobile"]).toBeUndefined();
  });

  it("keeps browser runtime services out of unrelated startup graphs", () => {
    const appSource = readFileSync(resolve(root, "src/renderer/app.tsx"), "utf8");

    expect(appSource).not.toMatch(/^import .*BrowserRuntimeServices/m);
    expect(appSource).toContain('import("@/renderer/pwa/BrowserRuntimeServices")');
  });

  it("serves one root-scoped build through Vercel", () => {
    const vercel = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8")) as {
      buildCommand: string;
      outputDirectory: string;
      redirects: Array<{ source: string; destination: string; permanent: boolean }>;
    };

    expect(vercel.buildCommand).toBe("node scripts/vercel-build-web.mjs");
    expect(vercel.outputDirectory).toBe("dist/web");
    for (const source of [
      "/mobile.html",
      "/pair",
      "/app",
      "/app/:path*",
      "/desktop",
      "/desktop/:path*",
    ]) {
      expect(vercel.redirects).toContainEqual({ source, destination: "/", permanent: true });
    }
  });
});
