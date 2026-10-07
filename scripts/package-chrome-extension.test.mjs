import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  externalizeBootstrapScripts,
  manifestExtensionId,
  verifyStoreIdentity,
  verifyPackagedExtension,
  packageStoreExtension,
} from "./package-chrome-extension.mjs";

void test("MV3 packaging keeps canonical boot order without inline or remote executable code", () => {
  const source =
    '<script>window.theme = "dark";</script><script type="module" src="./assets/app.js"></script><script type="module">await boot();</script>';
  const output = externalizeBootstrapScripts(source);
  assert.deepEqual(output.scripts, [
    { filename: "bootstrap-0.js", source: 'window.theme = "dark";' },
    { filename: "bootstrap-1.js", source: "await boot();" },
  ]);
  assert.equal(
    output.html,
    '<script src="./bootstrap-0.js"></script><script type="module" src="./assets/app.js"></script><script type="module" src="./bootstrap-1.js"></script>',
  );
});

void test("the independently shipped worker mirrors the host protocol and pinned identity", async () => {
  const [worker, protocol, sourceManifest] = await Promise.all([
    readFile(new URL("../chrome-extension/background.js", import.meta.url), "utf8"),
    readFile(new URL("../src/shared/chromeSidebarProtocol.ts", import.meta.url), "utf8"),
    readFile(new URL("../chrome-extension/manifest.json", import.meta.url), "utf8"),
  ]);
  const workerVersion = /const SIDEBAR_PROTOCOL_VERSION = (\d+)/u.exec(worker)?.[1];
  const hostVersion = /const CHROME_SIDEBAR_PROTOCOL_VERSION = (\d+)/u.exec(protocol)?.[1];
  assert.ok(workerVersion);
  assert.equal(workerVersion, hostVersion);
  const manifest = JSON.parse(sourceManifest);
  assert.ok(manifest.key, "unpacked builds need a stable native-host identity");
  const id = manifestExtensionId(manifest);
  const allowedIds = /CHROME_SIDEBAR_EXTENSION_IDS[^=]*=\s*\[([^\]]*)\]/u.exec(protocol)?.[1];
  assert.ok(
    allowedIds?.includes(`"${id}"`),
    "native-host allowlist must include the manifest identity",
  );
  verifyStoreIdentity(manifest, id);
  assert.throws(() => verifyStoreIdentity(manifest, undefined));
  assert.throws(() => verifyStoreIdentity(manifest, "a".repeat(32)));
});

void test("MV3 validates packaged local scripts and WASM while rejecting unsafe artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "poracode-extension-package-"));
  try {
    const manifest = JSON.parse(
      await readFile(new URL("../chrome-extension/manifest.json", import.meta.url), "utf8"),
    );
    await mkdir(join(root, "client"));
    const page = join(root, manifest.side_panel.default_path);
    await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
    await writeFile(join(root, "client/app.js"), "void 0;");
    await writeFile(page, '<script type="module" src="./app.js"></script>');
    await verifyPackagedExtension(root);
    for (const html of [
      "<script>boot();</script>",
      '<script src="https://example.com/app.js"></script>',
      '<script src="../../outside.js"></script>',
    ]) {
      await writeFile(page, html);
      await assert.rejects(verifyPackagedExtension(root));
    }
    await writeFile(page, '<script type="module" src="./app.js"></script>');
    for (const policy of [
      "script-src 'self';",
      "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval';",
    ]) {
      manifest.content_security_policy.extension_pages = policy;
      await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
      await assert.rejects(verifyPackagedExtension(root));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test("the release copy strips the public key while leaving the unpacked identity intact", async () => {
  const root = await mkdtemp(join(tmpdir(), "poracode-extension-store-"));
  try {
    const source = join(root, "dist/chrome-extension");
    const manifest = JSON.parse(
      await readFile(new URL("../chrome-extension/manifest.json", import.meta.url), "utf8"),
    );
    await mkdir(join(source, "client"), { recursive: true });
    const original = `${JSON.stringify(manifest, null, 2)}\n`;
    await writeFile(join(source, "manifest.json"), original);
    await writeFile(join(source, "client/index.html"), '<script src="./app.js"></script>');
    await writeFile(join(source, "client/app.js"), "void 0;");
    const output = await packageStoreExtension(root);
    const releaseManifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8"));
    const { key: _key, ...expected } = manifest;
    assert.deepEqual(releaseManifest, expected);
    assert.equal(await readFile(join(source, "manifest.json"), "utf8"), original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
