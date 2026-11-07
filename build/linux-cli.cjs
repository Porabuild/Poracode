const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const {
  generateAppRunScript,
  validateCriticalPathString,
} = require("app-builder-lib/out/targets/appimage/appImageUtil");

function createLinuxAppRun(executableName) {
  validateCriticalPathString(executableName, "executableName");
  const script = generateAppRunScript({
    ExecutableName: executableName,
    DesktopFileName: `${executableName}.desktop`,
    ProductFilename: executableName,
    ProductName: executableName,
    ResourceName: `appimagekit-${executableName}`,
  });
  const marker = '\nif [ -z "$APPIMAGE_EXIT_AFTER_INSTALL" ] ; then';
  if (script.split(marker).length !== 2)
    throw new Error("The AppImage launcher changed; review CLI entry placement before packaging.");
  // Node mode rejects GUI sandbox flags. Enter it before AppRun adds those flags
  // or installs its GUI exit trap; retain upstream GUI behavior verbatim.
  return script.replace(
    marker,
    '\n# poracode-appimage-node-entry-v1\nif [ "$ELECTRON_RUN_AS_NODE" = 1 ]; then\n  exec "$BIN" "$@"\nfi\n' +
      marker,
  );
}

function writeLinuxAppRun(resourcesDir, appOutDir) {
  const manifest = JSON.parse(
    readFileSync(join(resourcesDir, "desktop-cli", "manifest.json"), "utf8"),
  );
  // Both AppImage builders copy appOutDir over their generated AppRun afterward.
  writeFileSync(join(appOutDir, "AppRun"), createLinuxAppRun(manifest.executableName), {
    mode: 0o755,
  });
}

module.exports = { createLinuxAppRun, writeLinuxAppRun };
