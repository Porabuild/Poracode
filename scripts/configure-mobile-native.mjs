import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
// Domain that owns pairing/universal links. The installed app claims
// `applinks:<host>` so https://<host>/pair opens the app instead of the hosted
// PWA. Override with LIGHTCODE_MOBILE_APP_HOST (e.g. a staging domain).
const DEFAULT_MOBILE_APP_HOST = "poracode.com";
const appHost = readAppHost();
const requireAndroidLinks =
  readBoolEnv("LIGHTCODE_MOBILE_REQUIRE_NATIVE_LINKS") ||
  readBoolEnv("LIGHTCODE_MOBILE_REQUIRE_ANDROID_LINKS");
const requireIosLinks =
  readBoolEnv("LIGHTCODE_MOBILE_REQUIRE_NATIVE_LINKS") ||
  readBoolEnv("LIGHTCODE_MOBILE_REQUIRE_IOS_LINKS");

if ((requireAndroidLinks || requireIosLinks) && !appHost) {
  console.error(
    "[configure-mobile-native] missing LIGHTCODE_MOBILE_APP_HOST for native app links.",
  );
  process.exit(1);
}

if (!appHost) {
  console.log("[configure-mobile-native] LIGHTCODE_MOBILE_APP_HOST not set; skipping app links.");
} else {
  configureAndroid(appHost);
  configureIosAppLinks(appHost);
}

// Push notifications & Live Activities are independent of the app-link host, so
// they run whenever the native project is present (no-op otherwise).
configureIosLocalNetworking();
configureIosLiveActivities();
copyWidgetExtensionSources();
configureAndroidPush();

/** google-services Gradle plugin version (matches Firebase's current release). */
const GOOGLE_SERVICES_PLUGIN_VERSION = "4.4.2";

function readEnv(key) {
  return (process.env[key] ?? "").trim();
}

function readBoolEnv(key) {
  return /^(1|true|yes)$/i.test(readEnv(key));
}

function readAppHost() {
  const raw = readEnv("LIGHTCODE_MOBILE_APP_HOST") || DEFAULT_MOBILE_APP_HOST;
  if (!raw) return "";
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).host;
  } catch {
    console.error(`[configure-mobile-native] invalid LIGHTCODE_MOBILE_APP_HOST: ${raw}`);
    process.exit(1);
  }
}

function configureAndroid(host) {
  const manifestPath = resolve(root, "android/app/src/main/AndroidManifest.xml");
  if (!existsSync(manifestPath)) {
    console.log("[configure-mobile-native] android/ not present; skipping Android app links.");
    return;
  }

  const intentFilters = `
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />

                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />

                <data android:scheme="https" android:host="${host}" android:pathPrefix="/pair" />
                <data android:scheme="https" android:host="${host}" android:pathPrefix="/app" />
            </intent-filter>`;

  const manifest = readFileSync(manifestPath, "utf8");
  if (manifest.includes(`android:host="${host}"`)) {
    console.log("[configure-mobile-native] Android app links already configured.");
    return;
  }

  const next = manifest.replace(
    /(<activity\b[^>]*android:name="\.MainActivity"[\s\S]*?)(\s*<\/activity>)/,
    `$1${intentFilters}$2`,
  );
  if (next === manifest) {
    console.error("[configure-mobile-native] unable to locate Android MainActivity.");
    process.exit(1);
  }

  writeFileSync(manifestPath, next, "utf8");
  console.log("[configure-mobile-native] configured Android app links.");
}

function configureIosLocalNetworking() {
  const infoPlistPath = resolve(root, "ios/App/App/Info.plist");
  if (!existsSync(infoPlistPath)) {
    console.log("[configure-mobile-native] ios/ not present; skipping iOS ATS config.");
    return;
  }

  configureIosAts(infoPlistPath);
}

function configureIosAppLinks(host) {
  const infoPlistPath = resolve(root, "ios/App/App/Info.plist");
  if (!existsSync(infoPlistPath)) {
    console.log("[configure-mobile-native] ios/ not present; skipping iOS app links.");
    return;
  }

  configureIosEntitlements(host);
}

function configureIosAts(infoPlistPath) {
  let plist = readFileSync(infoPlistPath, "utf8");
  if (plist.includes("<key>NSAllowsLocalNetworking</key>")) {
    console.log("[configure-mobile-native] iOS ATS local networking already configured.");
    return;
  }

  if (plist.includes("<key>NSAppTransportSecurity</key>")) {
    plist = plist.replace(
      /(<key>NSAppTransportSecurity<\/key>\s*<dict>)/,
      "$1\n\t\t<key>NSAllowsLocalNetworking</key>\n\t\t<true/>",
    );
  } else {
    plist = plist.replace(
      /\n<\/dict>\s*<\/plist>\s*$/,
      "\n\t<key>NSAppTransportSecurity</key>\n\t<dict>\n\t\t<key>NSAllowsLocalNetworking</key>\n\t\t<true/>\n\t</dict>\n</dict>\n</plist>\n",
    );
  }

  writeFileSync(infoPlistPath, plist, "utf8");
  console.log("[configure-mobile-native] configured iOS ATS local networking.");
}

function configureIosEntitlements(host) {
  const entitlementsPath = resolve(root, "ios/App/App/App.entitlements");
  const domainValues = [`applinks:${host}`, `webcredentials:${host}`];
  let entitlements = existsSync(entitlementsPath)
    ? readFileSync(entitlementsPath, "utf8")
    : buildEntitlements(domainValues);

  if (!entitlements.includes("<key>com.apple.developer.associated-domains</key>")) {
    entitlements = entitlements.replace(
      /\n<\/dict>\s*<\/plist>\s*$/,
      `\n\t<key>com.apple.developer.associated-domains</key>\n\t<array>\n${domainValues
        .map((value) => `\t\t<string>${value}</string>`)
        .join("\n")}\n\t</array>\n</dict>\n</plist>\n`,
    );
  } else {
    for (const value of domainValues) {
      if (entitlements.includes(`<string>${value}</string>`)) continue;
      entitlements = entitlements.replace(
        /(<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>)/,
        `$1\n\t\t<string>${value}</string>`,
      );
    }
  }

  writeFileSync(entitlementsPath, entitlements, "utf8");
  configureIosProjectEntitlements();
  console.log("[configure-mobile-native] configured iOS associated domains.");
}

function buildEntitlements(domainValues) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>com.apple.developer.associated-domains</key>
\t<array>
${domainValues.map((value) => `\t\t<string>${value}</string>`).join("\n")}
\t</array>
</dict>
</plist>
`;
}

function configureIosProjectEntitlements() {
  const projectPath = resolve(root, "ios/App/App.xcodeproj/project.pbxproj");
  if (!existsSync(projectPath)) return;
  let project = readFileSync(projectPath, "utf8");
  if (project.includes("CODE_SIGN_ENTITLEMENTS = App/App.entitlements;")) return;
  project = project.replace(
    /(PRODUCT_BUNDLE_IDENTIFIER = [^;]+;)/g,
    "$1\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;",
  );
  writeFileSync(projectPath, project, "utf8");
}

// Live Activities + push notifications (iOS). Independent of app links.
function configureIosLiveActivities() {
  const infoPlistPath = resolve(root, "ios/App/App/Info.plist");
  if (!existsSync(infoPlistPath)) {
    console.log("[configure-mobile-native] ios/ not present; skipping Live Activities config.");
    return;
  }

  addPlistBoolean(infoPlistPath, "NSSupportsLiveActivities");
  addPlistBoolean(infoPlistPath, "NSSupportsLiveActivitiesFrequentUpdates");
  configureIosApsEnvironment();
}

function addPlistBoolean(plistPath, key) {
  let plist = readFileSync(plistPath, "utf8");
  if (plist.includes(`<key>${key}</key>`)) {
    console.log(`[configure-mobile-native] iOS ${key} already set.`);
    return;
  }
  plist = plist.replace(
    /\n<\/dict>\s*<\/plist>\s*$/,
    `\n\t<key>${key}</key>\n\t<true/>\n</dict>\n</plist>\n`,
  );
  writeFileSync(plistPath, plist, "utf8");
  console.log(`[configure-mobile-native] set iOS ${key}=true.`);
}

function configureIosApsEnvironment() {
  const entitlementsPath = resolve(root, "ios/App/App/App.entitlements");
  const apsEnvironment = readEnv("LIGHTCODE_IOS_APS_ENVIRONMENT") || "production";

  let entitlements = existsSync(entitlementsPath)
    ? readFileSync(entitlementsPath, "utf8")
    : buildEmptyEntitlements();

  if (entitlements.includes("<key>aps-environment</key>")) {
    console.log("[configure-mobile-native] iOS aps-environment already configured.");
  } else {
    entitlements = entitlements.replace(
      /\n<\/dict>\s*<\/plist>\s*$/,
      `\n\t<key>aps-environment</key>\n\t<string>${apsEnvironment}</string>\n</dict>\n</plist>\n`,
    );
    writeFileSync(entitlementsPath, entitlements, "utf8");
    console.log(`[configure-mobile-native] configured iOS aps-environment=${apsEnvironment}.`);
  }

  configureIosProjectEntitlements();
}

function buildEmptyEntitlements() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
</dict>
</plist>
`;
}

// Android push (FCM). Android gets no native code and no Live Activities: the
// desktop sends FCM *notification* messages that the OS auto-renders. All the
// app needs is the Firebase config (`google-services.json`) plus the
// google-services Gradle plugin so `@capacitor/push-notifications` yields an FCM
// registration token. Graceful no-op when android/ is absent (web/iOS-only CI).
function configureAndroidPush() {
  const androidDir = resolve(root, "android");
  if (!existsSync(androidDir)) {
    console.log("[configure-mobile-native] android/ not present; skipping Android push config.");
    return;
  }
  copyAndroidGoogleServices();
  patchAndroidRootGradle();
  patchAndroidAppGradle();
}

// Copy the Firebase config into android/app/. Warn (don't fail) when the env var
// is unset — an app-links-only build still needs to succeed.
function copyAndroidGoogleServices() {
  const src = readEnv("LIGHTCODE_ANDROID_GOOGLE_SERVICES_JSON");
  if (!src) {
    console.warn(
      "[configure-mobile-native] LIGHTCODE_ANDROID_GOOGLE_SERVICES_JSON not set; " +
        "Android push disabled until android/app/google-services.json is provided.",
    );
    return;
  }
  const srcPath = resolve(root, src);
  if (!existsSync(srcPath)) {
    console.warn(
      `[configure-mobile-native] google-services.json not found at ${srcPath}; skipping.`,
    );
    return;
  }
  cpSync(srcPath, resolve(root, "android/app/google-services.json"));
  console.log("[configure-mobile-native] copied google-services.json into android/app/.");
}

// Add the google-services classpath to the root build.gradle (idempotent). The
// Capacitor 8 template ships this commented/absent; the app-level apply below
// needs it on the buildscript classpath.
function patchAndroidRootGradle() {
  const gradlePath = resolve(root, "android/build.gradle");
  if (!existsSync(gradlePath)) {
    console.warn(
      "[configure-mobile-native] android/build.gradle missing; skipping google-services classpath.",
    );
    return;
  }
  const gradle = readFileSync(gradlePath, "utf8");
  if (/^\s*classpath\s+['"]com\.google\.gms:google-services/m.test(gradle)) {
    console.log("[configure-mobile-native] Android google-services classpath already present.");
    return;
  }
  const next = gradle.replace(
    /(\n[ \t]*)(classpath\s+['"]com\.android\.tools\.build:gradle[^\n]*)/,
    `$1$2$1classpath 'com.google.gms:google-services:${GOOGLE_SERVICES_PLUGIN_VERSION}'`,
  );
  if (next === gradle) {
    console.warn(
      "[configure-mobile-native] could not locate the Android Gradle classpath; skipping google-services.",
    );
    return;
  }
  writeFileSync(gradlePath, next, "utf8");
  console.log("[configure-mobile-native] added google-services classpath to android/build.gradle.");
}

// Apply the google-services plugin in the app module (idempotent). Capacitor's
// default app/build.gradle already includes a `try { … apply plugin }` guard, so
// this is usually a no-op; we append a plain apply only if none is present.
function patchAndroidAppGradle() {
  const gradlePath = resolve(root, "android/app/build.gradle");
  if (!existsSync(gradlePath)) {
    console.warn(
      "[configure-mobile-native] android/app/build.gradle missing; skipping google-services plugin.",
    );
    return;
  }
  const gradle = readFileSync(gradlePath, "utf8");
  if (gradle.includes("com.google.gms.google-services")) {
    console.log("[configure-mobile-native] Android google-services plugin already applied.");
    return;
  }
  const next = `${gradle.replace(/\s*$/, "")}\n\napply plugin: 'com.google.gms.google-services'\n`;
  writeFileSync(gradlePath, next, "utf8");
  console.log(
    "[configure-mobile-native] applied google-services plugin in android/app/build.gradle.",
  );
}

// Copy the SwiftUI widget-extension sources into the generated iOS project so
// the one-time manual Xcode step is just "add existing folder as a target".
// Idempotent: overwrites in place on every sync.
function copyWidgetExtensionSources() {
  const iosAppDir = resolve(root, "ios/App");
  if (!existsSync(iosAppDir)) {
    console.log("[configure-mobile-native] ios/ not present; skipping widget extension sources.");
    return;
  }

  const sourceDir = resolve(root, "native/ios/LightcodeActivities");
  if (!existsSync(sourceDir)) {
    console.log(
      "[configure-mobile-native] native/ios/LightcodeActivities missing; skipping widget sources.",
    );
    return;
  }

  const destDir = resolve(iosAppDir, "LightcodeActivities");
  cpSync(sourceDir, destDir, { recursive: true });
  console.log("[configure-mobile-native] synced LightcodeActivities widget-extension sources.");
}
