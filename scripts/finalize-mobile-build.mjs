// The mobile-only Vite build (PORACODE_BUILD_TARGET=mobile) emits its entry
// as `mobile.html` (named after the source file). Hosting platforms and the
// Capacitor native shells both default to serving `index.html` from the web
// root, so mirror the entry to `index.html`. Asset URLs use a relative base
// ("./"), so the copy resolves identically at the new filename.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const mobileBasePath = readEnv("PORACODE_MOBILE_BASE_PATH");
const outDir = resolve(
  process.cwd(),
  "dist/mobile",
  mobileBasePath && mobileBasePath !== "./" ? mobileBasePath.replace(/^\/+|\/+$/g, "") : "",
);
const source = join(outDir, "mobile.html");
const target = join(outDir, "index.html");
const serviceWorkerPath = join(outDir, "service-worker.js");
const wellKnownDir = join(outDir, ".well-known");
const sshRuntimeSourceDir = resolve(process.cwd(), "resources/mobile-ssh-runtime");
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
  console.error(`[finalize-mobile-build] missing ${source}; did the mobile build run?`);
  process.exit(1);
}

if (requireAndroidLinks && androidFingerprints.length === 0) {
  console.error(
    "[finalize-mobile-build] missing PORACODE_MOBILE_ANDROID_SHA256_CERT_FINGERPRINT for Android App Links.",
  );
  process.exit(1);
}
if (requireIosLinks && !appleTeamId) {
  console.error("[finalize-mobile-build] missing PORACODE_MOBILE_APPLE_TEAM_ID for iOS links.");
  process.exit(1);
}

copyFileSync(source, target);
const serviceWorker = readFileSync(serviceWorkerPath, "utf8");
const buildVersion = createHash("sha256").update(readFileSync(source)).digest("hex").slice(0, 12);
const versionToken = "__PORACODE_BUILD_VERSION__";
if (!serviceWorker.includes(versionToken)) {
  console.error(`[finalize-mobile-build] missing build-version token in ${serviceWorkerPath}`);
  process.exit(1);
}
writeFileSync(serviceWorkerPath, serviceWorker.replaceAll(versionToken, buildVersion), "utf8");
mkdirSync(sshRuntimeTargetDir, { recursive: true });
copyFileSync(
  join(sshRuntimeSourceDir, "manifest.json"),
  join(sshRuntimeTargetDir, "manifest.json"),
);
copyFileSync(join(sshRuntimeSourceDir, "runtime.bin"), join(sshRuntimeTargetDir, "runtime.bin"));
mkdirSync(wellKnownDir, { recursive: true });
writeJson(join(wellKnownDir, "assetlinks.json"), buildAssetLinks());
writeJson(join(wellKnownDir, "apple-app-site-association"), buildAppleAppSiteAssociation());
console.log(`[finalize-mobile-build] wrote ${target}`);
console.log(`[finalize-mobile-build] versioned the service worker as ${buildVersion}`);
console.log("[finalize-mobile-build] embedded the SSH runtime");
console.log("[finalize-mobile-build] wrote .well-known association files");

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
                { "/": "/pair*", comment: "Pairing deep links open the installed app" },
                { "/": "/app*", comment: "App entry deep links open the installed app" },
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
