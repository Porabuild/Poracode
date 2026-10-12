// Finalize the canonical index entry for hosted PWA delivery.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const webBasePath = readEnv("PORACODE_WEB_BASE_PATH");
const webChannel = readEnv("PORACODE_WEB_CHANNEL") === "nightly" ? "nightly" : "stable";
const outDir = resolve(
  process.cwd(),
  "dist/web",
  webBasePath && webBasePath !== "./" ? webBasePath.replace(/^\/+|\/+$/g, "") : "",
);
const source = join(outDir, "index.html");
const serviceWorkerPath = join(outDir, "service-worker.js");
const wellKnownDir = join(outDir, ".well-known");
const sshRuntimeSourceDir = resolve(process.cwd(), "resources/web-ssh-runtime");
const sshRuntimeTargetDir = join(outDir, "poracode-ssh-runtime");
const appId = readEnv("PORACODE_MOBILE_APP_ID") || "com.lightcodeapp.mobile";
const androidFingerprints = readFingerprintList();
const appleTeamId = readEnv("PORACODE_MOBILE_APPLE_TEAM_ID");
const requireAndroidLinks =
  readBoolEnv("PORACODE_MOBILE_REQUIRE_NATIVE_LINKS") ||
  readBoolEnv("PORACODE_MOBILE_REQUIRE_ANDROID_LINKS");
const requireIosLinks =
  readBoolEnv("PORACODE_MOBILE_REQUIRE_NATIVE_LINKS") ||
  readBoolEnv("PORACODE_MOBILE_REQUIRE_IOS_LINKS");

if (!existsSync(source)) {
  console.error(`[finalize-web-build] missing ${source}; did the web build run?`);
  process.exit(1);
}

if (requireAndroidLinks && androidFingerprints.length === 0) {
  console.error(
    "[finalize-web-build] missing PORACODE_MOBILE_ANDROID_SHA256_CERT_FINGERPRINT for Android App Links.",
  );
  process.exit(1);
}
if (requireIosLinks && !appleTeamId) {
  console.error("[finalize-web-build] missing PORACODE_MOBILE_APPLE_TEAM_ID for iOS links.");
  process.exit(1);
}

// public/ ships both channels' icon art. Nightly swaps every stable reference
// over to its own set so an installed nightly PWA is distinguishable from
// stable on a home screen or taskbar — the two only differ by origin
// otherwise. Mapped explicitly (rather than by pattern) so a newly added icon
// fails the build instead of silently staying on the stable art.
const NIGHTLY_ICON_SOURCES = {
  "icons/icon-192.png": "icons/icon-nightly-192.png",
  "icons/icon-512.png": "icons/icon-nightly-512.png",
  "icons/icon-maskable-512.png": "icons/icon-nightly-maskable-512.png",
  "icons/apple-touch-icon.png": "icons/apple-touch-icon-nightly.png",
  "app-icon.svg": "app-icon-nightly.svg",
};

for (const [stable, nightly] of Object.entries(NIGHTLY_ICON_SOURCES)) {
  for (const icon of [stable, nightly]) {
    if (!existsSync(join(outDir, icon))) {
      console.error(`[finalize-web-build] missing ${join(outDir, icon)}`);
      process.exit(1);
    }
  }
}

// Rewrites a manifest/HTML icon reference, preserving any "./" or "/" prefix.
function nightlyIconRef(ref) {
  const match = /^(\.?\/)?(.*)$/.exec(ref);
  const mapped = NIGHTLY_ICON_SOURCES[match[2]];
  if (!mapped) {
    console.error(`[finalize-web-build] no nightly icon mapped for ${ref}`);
    process.exit(1);
  }
  return `${match[1] ?? ""}${mapped}`;
}

const isNightly = webChannel === "nightly";
let html = readFileSync(source, "utf8");
if (isNightly) {
  // Vite has already resolved %BASE_URL%, so match the bare relative path and
  // let whatever prefix precedes it ("./" or "/") stand.
  for (const [stable, nightly] of Object.entries(NIGHTLY_ICON_SOURCES)) {
    html = html.replaceAll(stable, nightly);
  }
  const missed = Object.keys(NIGHTLY_ICON_SOURCES).filter((stable) => html.includes(stable));
  if (missed.length > 0) {
    console.error(`[finalize-web-build] stable icon refs survived: ${missed.join(", ")}`);
    process.exit(1);
  }
  html = html
    .replaceAll("<title>Poracode</title>", "<title>Poracode Nightly</title>")
    .replaceAll('web-app-title" content="Poracode"', 'web-app-title" content="Poracode Nightly"');
  writeFileSync(source, html, "utf8");
}
writeFileSync(source, html, "utf8");

// Hosted stable and nightly builds live on separate subdomains and both own
// their origin root. The origin itself separates their PWA identities.
const manifestPath = join(outDir, "manifest.webmanifest");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.id = "/";
manifest.scope = "/";
manifest.start_url = "/";
if (isNightly) {
  manifest.name = `${manifest.name} Nightly`;
  manifest.short_name = `${manifest.short_name} Nightly`;
  manifest.icons = manifest.icons.map((icon) => ({ ...icon, src: nightlyIconRef(icon.src) }));
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`[finalize-web-build] prepared the ${webChannel} root-scoped manifest`);

const serviceWorker = readFileSync(serviceWorkerPath, "utf8");
const buildVersion = createHash("sha256")
  .update(readFileSync(source))
  .update("\0")
  .update(serviceWorker)
  .digest("hex")
  .slice(0, 12);
const notificationIcon = isNightly
  ? NIGHTLY_ICON_SOURCES["icons/icon-192.png"]
  : "icons/icon-192.png";
const tokens = {
  __PORACODE_BUILD_VERSION__: buildVersion,
  __PORACODE_NOTIFICATION_ICON__: notificationIcon,
};
let resolvedWorker = serviceWorker;
for (const [token, value] of Object.entries(tokens)) {
  if (!resolvedWorker.includes(token)) {
    console.error(`[finalize-web-build] missing ${token} in ${serviceWorkerPath}`);
    process.exit(1);
  }
  resolvedWorker = resolvedWorker.replaceAll(token, value);
}
writeFileSync(serviceWorkerPath, resolvedWorker, "utf8");
mkdirSync(sshRuntimeTargetDir, { recursive: true });
copyFileSync(
  join(sshRuntimeSourceDir, "manifest.json"),
  join(sshRuntimeTargetDir, "manifest.json"),
);
copyFileSync(join(sshRuntimeSourceDir, "runtime.bin"), join(sshRuntimeTargetDir, "runtime.bin"));
mkdirSync(wellKnownDir, { recursive: true });
writeJson(join(wellKnownDir, "assetlinks.json"), buildAssetLinks());
writeJson(join(wellKnownDir, "apple-app-site-association"), buildAppleAppSiteAssociation());
console.log(`[finalize-web-build] finalized ${source}`);
console.log(`[finalize-web-build] versioned the service worker as ${buildVersion}`);
console.log("[finalize-web-build] embedded the SSH runtime");
console.log("[finalize-web-build] wrote .well-known association files");

function readEnv(key) {
  return (process.env[key] ?? "").trim();
}

function readBoolEnv(key) {
  return /^(1|true|yes)$/i.test(readEnv(key));
}

function readFingerprintList() {
  const raw =
    readEnv("PORACODE_MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS") ||
    readEnv("PORACODE_MOBILE_ANDROID_SHA256_CERT_FINGERPRINT");
  return raw
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildAssetLinks() {
  if (androidFingerprints.length === 0) return [];
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: appId,
        sha256_cert_fingerprints: androidFingerprints,
      },
    },
  ];
}

function buildAppleAppSiteAssociation() {
  const appleAppId = appleTeamId ? `${appleTeamId}.${appId}` : null;
  return {
    applinks: {
      details: appleAppId
        ? [
            {
              appIDs: [appleAppId],
              components: [
                { "/": "/", comment: "Canonical app and pairing links open the installed app" },
                { "/": "/pair*", comment: "Legacy pairing links migrate into the app" },
                { "/": "/app*", comment: "Legacy app links migrate into the app" },
              ],
            },
          ]
        : [],
    },
    webcredentials: {
      apps: appleAppId ? [appleAppId] : [],
    },
  };
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}
