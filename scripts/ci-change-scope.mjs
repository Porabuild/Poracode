import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const DOCUMENTATION_PATH = /^(?:docs\/|.*\.md$)/u;
const ANDROID_PATH = /^android\//u;
const IOS_PATH = /^ios\//u;
const NATIVE_IRRELEVANT_PATH = /^(?:branding\/|chrome-extension\/|src\/renderer\/|website\/)/u;

function isDocumentation(path) {
  return DOCUMENTATION_PATH.test(path);
}

export function classifyChanges(paths) {
  const changed = [...new Set(paths.map((path) => path.trim()).filter(Boolean))];
  if (changed.length === 0) return fullScope();

  const shared = changed.some(
    (path) => !isDocumentation(path) && !ANDROID_PATH.test(path) && !IOS_PATH.test(path),
  );
  const nativeShared = changed.some(
    (path) =>
      !isDocumentation(path) &&
      !ANDROID_PATH.test(path) &&
      !IOS_PATH.test(path) &&
      !NATIVE_IRRELEVANT_PATH.test(path),
  );
  const nativeAndroid = nativeShared || changed.some((path) => ANDROID_PATH.test(path));
  const nativeIos = nativeShared || changed.some((path) => IOS_PATH.test(path));

  return { core: shared, nativeAndroid, nativeIos, nativeShared };
}

export function fullScope() {
  return { core: true, nativeAndroid: true, nativeIos: true, nativeShared: true };
}

function writeOutputs(scope) {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) throw new Error("GITHUB_OUTPUT is required");
  appendFileSync(
    output,
    [
      `core=${scope.core}`,
      `native_android=${scope.nativeAndroid}`,
      `native_ios=${scope.nativeIos}`,
      `native_shared=${scope.nativeShared}`,
      "",
    ].join("\n"),
  );
}

function main() {
  if (process.env.GITHUB_EVENT_NAME !== "pull_request") {
    writeOutputs(fullScope());
    return;
  }

  const base = process.env.CI_BASE_SHA;
  const head = process.env.CI_HEAD_SHA;
  if (!base || !head) {
    console.warn("::warning::PR diff bounds are unavailable; running the full CI graph.");
    writeOutputs(fullScope());
    return;
  }

  const diff = spawnSync(
    "git",
    ["diff", "--name-only", "--diff-filter=ACDMRTUXB", "-z", base, head, "--"],
    { encoding: "utf8" },
  );
  if (diff.status !== 0) {
    console.warn("::warning::PR diff classification failed; running the full CI graph.");
    if (diff.stderr) process.stderr.write(diff.stderr);
    writeOutputs(fullScope());
    return;
  }

  writeOutputs(classifyChanges(diff.stdout.split("\0")));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
