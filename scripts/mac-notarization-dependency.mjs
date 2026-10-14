import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// 3.1.2 fixes stapling retries without changing signed artifact formats.
// https://github.com/electron/notarize/releases/tag/v3.1.2
export const MAC_NOTARIZE_VERSION = "3.1.2";

export function verifyMacNotarizationDependency(stageRoot) {
  const stageRequire = createRequire(join(stageRoot, "package.json"));
  const builderRequire = createRequire(stageRequire.resolve("electron-builder"));
  const appBuilderRequire = createRequire(builderRequire.resolve("app-builder-lib"));
  const notarizeEntry = appBuilderRequire.resolve("@electron/notarize");
  const notarizePackage = JSON.parse(
    readFileSync(join(dirname(notarizeEntry), "..", "package.json"), "utf8"),
  );
  if (
    notarizePackage.name !== "@electron/notarize" ||
    notarizePackage.version !== MAC_NOTARIZE_VERSION
  ) {
    throw new Error(
      `macOS packaging requires @electron/notarize@${MAC_NOTARIZE_VERSION}; ` +
        `electron-builder resolved ${notarizePackage.name}@${notarizePackage.version}`,
    );
  }
  return notarizePackage.version;
}
