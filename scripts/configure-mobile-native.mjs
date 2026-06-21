import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
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
  configureIos(appHost);
}

function readEnv(key) {
  return (process.env[key] ?? "").trim();
}

function readBoolEnv(key) {
  return /^(1|true|yes)$/i.test(readEnv(key));
}

function readAppHost() {
  const raw = readEnv("LIGHTCODE_MOBILE_APP_HOST");
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

function configureIos(host) {
  const infoPlistPath = resolve(root, "ios/App/App/Info.plist");
  if (!existsSync(infoPlistPath)) {
    console.log("[configure-mobile-native] ios/ not present; skipping iOS native config.");
    return;
  }

  configureIosAts(infoPlistPath);
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
