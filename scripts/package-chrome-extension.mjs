import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export function manifestExtensionId(manifest) {
  if (typeof manifest.key !== "string" || !manifest.key)
    throw new Error("The extension needs a public key for its pinned identity.");
  return createHash("sha256")
    .update(Buffer.from(manifest.key, "base64"))
    .digest("hex")
    .slice(0, 32)
    .replace(/[0-9a-f]/gu, (digit) => String.fromCharCode(97 + Number.parseInt(digit, 16)));
}

/** Store updates must retain the browser-enforced identity used by native messaging. */
export function verifyStoreIdentity(manifest, storeId) {
  if (!storeId || manifestExtensionId(manifest) !== storeId)
    throw new Error(
      "Set the manifest public key to the Chrome Web Store item's public key before releasing.",
    );
}

/** MV3 disallows inline scripts. Keep the canonical boot order using local files. */
export function externalizeBootstrapScripts(html) {
  const scripts = [];
  const result = html.replace(
    /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gu,
    (tag, attributes = "", body) => {
      if (/\bsrc\s*=/u.test(attributes) || !body.trim()) return tag;
      const filename = `bootstrap-${scripts.length}.js`;
      scripts.push({ filename, source: body });
      return `<script${attributes} src="./${filename}"></script>`;
    },
  );
  return { html: result, scripts };
}

/** Fail packaging before a broken or over-permissive MV3 client is released. */
export async function verifyPackagedExtension(output) {
  const manifest = JSON.parse(await readFile(resolve(output, "manifest.json"), "utf8"));
  const policy = manifest.content_security_policy?.extension_pages ?? "";
  const scriptPolicy = policy.split(";").find((directive) => /^\s*script-src\s/u.test(directive));
  if (!scriptPolicy?.includes("'wasm-unsafe-eval'") || /'unsafe-(?:eval|inline)'/u.test(policy))
    throw new Error("The sidebar requires local WebAssembly without inline or dynamic scripts.");
  const page = resolve(output, manifest.side_panel.default_path);
  const html = await readFile(page, "utf8");
  for (const script of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gu)) {
    const src = /\bsrc\s*=\s*["']([^"']+)["']/u.exec(script[1] ?? "")?.[1];
    if (!src || script[2].trim()) throw new Error("The sidebar contains an inline script.");
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(src))
      throw new Error("The sidebar contains a remote executable script.");
    const path = resolve(dirname(page), src);
    if (!path.startsWith(`${resolve(output)}${sep}`))
      throw new Error("The sidebar script escapes the packaged extension.");
    await readFile(path);
  }
}

export async function packageChromeExtension(root = process.cwd()) {
  const output = resolve(root, "dist/chrome-extension");
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await Promise.all(
    ["manifest.json", "background.js", "icons"].map((name) =>
      cp(resolve(root, "chrome-extension", name), resolve(output, name), { recursive: true }),
    ),
  );
  const client = resolve(output, "client");
  await cp(resolve(root, "dist/extension-client"), client, { recursive: true });
  const boot = externalizeBootstrapScripts(await readFile(resolve(client, "index.html"), "utf8"));
  await writeFile(resolve(client, "index.html"), boot.html);
  await Promise.all(
    boot.scripts.map(({ filename, source }) => writeFile(resolve(client, filename), source)),
  );
  await verifyPackagedExtension(output);
  console.log(`Chrome sidebar extension: ${output}`);
}

/** The upload copy omits the development identity key; the unpacked build keeps it. */
export async function packageStoreExtension(root = process.cwd()) {
  const output = resolve(root, "dist/chrome-extension-store");
  await rm(output, { recursive: true, force: true });
  await cp(resolve(root, "dist/chrome-extension"), output, { recursive: true });
  const manifestPath = resolve(output, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  delete manifest.key;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await verifyPackagedExtension(output);
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--verify-store-identity")) {
    const manifest = JSON.parse(await readFile(resolve("chrome-extension/manifest.json"), "utf8"));
    verifyStoreIdentity(manifest, process.env.CHROME_EXTENSION_ID);
  } else if (process.argv.includes("--store-package")) await packageStoreExtension();
  else await packageChromeExtension();
}
