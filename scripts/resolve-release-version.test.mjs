import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveReleaseVersion } from "./resolve-release-version.mjs";

await test("advances past production even when the post-release bump never landed", () => {
  assert.equal(resolveReleaseVersion("1.8.0", ["v1.8.0"]), "1.8.1");
  assert.equal(resolveReleaseVersion("1.8.1", ["v1.8.0", "v1.8.1"]), "1.8.2");
});

await test("preserves an unreleased package version and ignores other release channels", () => {
  assert.equal(
    resolveReleaseVersion("1.9.0", ["v1.8.0", "v2.0.0-nightly.20260910", "release-draft-1"]),
    "1.9.0",
  );
  assert.equal(resolveReleaseVersion("1.8.1", []), "1.8.1");
});

await test("orders stable tags numerically and handles a stale package version", () => {
  assert.equal(resolveReleaseVersion("1.8.0", ["v1.10.9", "v1.9.20", "v1.10.10"]), "1.10.11");
});

await test("rejects a prerelease or malformed package version", () => {
  for (const version of ["1.8.0-nightly.1", "1.8", "01.8.0"]) {
    assert.throws(() => resolveReleaseVersion(version, []), /plain X.Y.Z/);
  }
});
