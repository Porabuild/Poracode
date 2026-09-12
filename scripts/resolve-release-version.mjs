import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const plainVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function compare(a, b) {
  const left = a.split(".").map(BigInt);
  const right = b.split(".").map(BigInt);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}

// Stable tags are published only after assets upload. They remain authoritative
// even when master still contains the version of an earlier release.
export function resolveReleaseVersion(packageVersion, tags) {
  if (!plainVersion.test(packageVersion)) {
    throw new Error(`package.json version must be plain X.Y.Z (got '${packageVersion}')`);
  }
  let latest;
  for (const tag of tags) {
    if (!tag.startsWith("v") || !plainVersion.test(tag.slice(1))) continue;
    const version = tag.slice(1);
    if (!latest || compare(version, latest) > 0) latest = version;
  }
  if (!latest || compare(packageVersion, latest) > 0) return packageVersion;
  const [major, minor, patch] = latest.split(".");
  return `${major}.${minor}.${BigInt(patch) + 1n}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const tags = execFileSync("git", ["tag", "--list", "v*"], { encoding: "utf8" });
  console.log(resolveReleaseVersion(pkg.version, tags.trim().split("\n")));
}
