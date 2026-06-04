// Mirror of src/shared/channel.ts for use by scripts/build-desktop-artifact.mjs.
// Keep field names identical to the TS module; src/shared/channel.config-parity.test.ts
// asserts they don't drift.

const CHANNELS = ["stable", "nightly"];

// Subdirectories under `dist/` that ship in the installer. A broad `dist/**/*`
// glob would sweep up stale `dist/win-unpacked` trees from prior packaging
// runs and recursively bloat the next installer.
const PACKAGED_DIST_DIRS = ["main", "renderer"];

const PACKAGED_DIST_FILES = PACKAGED_DIST_DIRS.flatMap((dir) => [
  `dist/${dir}/**/*`,
  `!dist/${dir}/**/*.map`,
]);

function normalizeChannel(value) {
  return value === "nightly" ? "nightly" : "stable";
}

function productNameFor(channel) {
  return channel === "nightly" ? "Lightcode Nightly" : "Lightcode";
}

function appIdFor(channel) {
  return channel === "nightly" ? "com.lightcode.app.nightly" : "com.lightcode.app";
}

function userDataDirNameFor(channel) {
  return channel === "nightly" ? ".lightcode-nightly" : ".lightcode";
}

function updaterChannelFor(channel) {
  return channel === "nightly" ? "nightly" : undefined;
}

function artifactPrefixFor(channel) {
  return channel === "nightly" ? "Lightcode-Nightly" : "Lightcode";
}

module.exports = {
  CHANNELS,
  PACKAGED_DIST_DIRS,
  PACKAGED_DIST_FILES,
  normalizeChannel,
  productNameFor,
  appIdFor,
  userDataDirNameFor,
  updaterChannelFor,
  artifactPrefixFor,
};
