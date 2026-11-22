import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const DOCUMENTATION_PATH = /^(?:docs\/|[^/]+\.md$|\.github\/.+\.md$|\.agents\/.+\.md$)/u;
const ANDROID_PATH = /^android\//u;
const IOS_PATH = /^ios\//u;
const KNOWN_PATH =
  /^(?:docs\/|[^/]+\.md$|\.(?:agents|claude|github|husky)\/|\.(?:editorconfig|env\.example|envrc|gitattributes|gitignore|nvmrc|oxfmtrc\.json|oxlintrc(?:\.type-aware)?\.json|vercelignore)$|(?:android|branding|build|chrome-extension|ios|native|packages|packaging|patches|protocol|public|resources|scripts|src|tests|tui|website)\/|(?:LICENSE|bun\.lock|bunfig\.toml|index\.html|lingui\.config\.ts|lint-staged\.config\.js|package\.json|poracode-initial\.png|postcss\.config\.mjs|skills-lock\.json|tsconfig\.json|tsdown\.config\.ts|turbo\.json|vercel\.json|vite\.config\.ts|vitest(?:\.(?:browser|integration|perf))?\.config\.ts)$)/u;

const JS_TOOLCHAIN_PATH =
  /^(?:package\.json|bun\.lock|bunfig\.toml|patches\/|vitest\.config\.ts|\.github\/actions\/setup-bun\/)/u;
const RUST_HELPER_PATH =
  /^(?:native\/(?:computer-use-helper|locked-computer-use)\/|scripts\/(?:prepare-computer-use-helper|prepare-locked-computer-use|locked-computer-use-installer)|\.github\/workflows\/ci\.yml$)/u;
const MCP_RELAY_PATH =
  /^(?:native\/mcp-relay\/|src\/supervisor\/mcp\/|src\/shared\/mcpAppResources\.ts$|scripts\/prepare-mcp-relay|\.github\/workflows\/ci\.yml$)/u;
const GIT_HELPER_PATH =
  /^(?:native\/git-helper\/|src\/supervisor\/git(?:\/|\.)|src\/supervisor\/(?:fileIndex|ProjectSearchIndex|projectTree|projectPaths|projectWatcherFilters)\.|src\/shared\/(?:searchMatching|reviewDiff)\.|scripts\/prepare-git-helper|\.github\/workflows\/ci\.yml$)/u;
const TUI_PATH =
  /^(?:tui\/|src\/shared\/|src\/build\/|src\/renderer\/state\/slices\/runtimeChatItem\.ts$|scripts\/build-tui|\.github\/workflows\/ci\.yml$)/u;
const PERF_PATH =
  /^(?:src\/supervisor\/|src\/renderer\/state\/remote\/|src\/shared\/remote\/|vite\.config\.ts$|vitest\.perf\.config\.ts$|scripts\/(?:dev-|vite-)|\.github\/workflows\/ci\.yml$)/u;
const RENDERER_ONLY_TEST_PATH =
  /^(?:src\/renderer\/|public\/|index\.html$|postcss\.config\.mjs$|lingui\.config\.ts$|vite\.config\.ts$|vitest\.browser\.config\.ts$|branding\/|chrome-extension\/)/u;
const NODE_ONLY_TEST_PATH =
  /^(?:src\/(?:supervisor|host|server|backend|main)\/|packages\/|protocol\/|scripts\/|native\/|resources\/|tests\/|tui\/|tsdown\.config\.ts$)/u;
const NATIVE_CONTRACT_PATH =
  /^(?:protocol\/remote\/v3\/|src\/shared\/|tests\/native-e2e\/(?:harness\/operation-map\.json|operationMap\.test\.ts)$|android\/gradle|scripts\/remote-v3-|\.github\/workflows\/native-ci\.yml$)/u;
const NATIVE_IRRELEVANT_PATH =
  /^(?:branding\/|chrome-extension\/|src\/renderer\/|src\/main\/|src\/supervisor\/agents\/|website\/|tui\/|native\/(?:computer-use-helper|locked-computer-use)\/|public\/|index\.html$|vite\.config\.ts$|postcss\.config\.mjs$|lingui\.config\.ts$|vercel\.json$|\.vercelignore$|vitest\.browser\.config\.ts$)/u;
const NATIVE_ANDROID_SHARED_PATH =
  /^(?:protocol\/remote\/v3\/|package\.json$|scripts\/(?:generate-android-themes|generate-native-custom-themes|ci-android-)|\.github\/workflows\/native-ci\.yml$)/u;
const NATIVE_IOS_SHARED_PATH =
  /^(?:protocol\/remote\/v3\/|scripts\/generate-native-custom-themes|\.github\/workflows\/native-ci\.yml$)/u;

function isDocumentation(path) {
  return DOCUMENTATION_PATH.test(path);
}

function classifyTestProjects(corePaths) {
  if (corePaths.length === 0) return "all";
  if (corePaths.every((path) => RENDERER_ONLY_TEST_PATH.test(path))) return "renderer";
  if (corePaths.every((path) => NODE_ONLY_TEST_PATH.test(path))) return "node";
  return "all";
}

export function classifyChanges(paths) {
  const changed = [...new Set(paths.map((path) => path.trim()).filter(Boolean))];
  if (
    changed.length === 0 ||
    changed.some((path) => path === "scripts/ci-change-scope.mjs" || !KNOWN_PATH.test(path))
  ) {
    return fullScope();
  }

  const corePaths = changed.filter(
    (path) => !isDocumentation(path) && !ANDROID_PATH.test(path) && !IOS_PATH.test(path),
  );
  const core = corePaths.length > 0;
  const tui = changed.some((path) => TUI_PATH.test(path) || JS_TOOLCHAIN_PATH.test(path));
  const testPerf = changed.some((path) => PERF_PATH.test(path) || JS_TOOLCHAIN_PATH.test(path));
  const testProjects = classifyTestProjects(corePaths);
  const rustHelper = changed.some((path) => RUST_HELPER_PATH.test(path));
  const mcpRelay = changed.some(
    (path) => MCP_RELAY_PATH.test(path) || JS_TOOLCHAIN_PATH.test(path),
  );
  const gitHelper = changed.some(
    (path) => GIT_HELPER_PATH.test(path) || JS_TOOLCHAIN_PATH.test(path),
  );
  const nativeContract = changed.some(
    (path) => NATIVE_CONTRACT_PATH.test(path) || JS_TOOLCHAIN_PATH.test(path),
  );
  const nativeShared = changed.some(
    (path) =>
      !isDocumentation(path) &&
      !ANDROID_PATH.test(path) &&
      !IOS_PATH.test(path) &&
      !NATIVE_IRRELEVANT_PATH.test(path),
  );
  const nativeAndroid = changed.some(
    (path) => ANDROID_PATH.test(path) || NATIVE_ANDROID_SHARED_PATH.test(path),
  );
  const nativeIos = changed.some(
    (path) => IOS_PATH.test(path) || NATIVE_IOS_SHARED_PATH.test(path),
  );

  return {
    core,
    tui,
    testPerf,
    testProjects,
    rustHelper,
    mcpRelay,
    gitHelper,
    nativeContract,
    nativeAndroid,
    nativeIos,
    nativeShared,
  };
}

export function fullScope() {
  return {
    core: true,
    tui: true,
    testPerf: true,
    testProjects: "all",
    rustHelper: true,
    mcpRelay: true,
    gitHelper: true,
    nativeContract: true,
    nativeAndroid: true,
    nativeIos: true,
    nativeShared: true,
  };
}

function writeOutputs(scope) {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) throw new Error("GITHUB_OUTPUT is required");
  appendFileSync(
    output,
    [
      `core=${scope.core}`,
      `tui=${scope.tui}`,
      `test_perf=${scope.testPerf}`,
      `test_projects=${scope.testProjects}`,
      `rust_helper=${scope.rustHelper}`,
      `mcp_relay=${scope.mcpRelay}`,
      `git_helper=${scope.gitHelper}`,
      `native_contract=${scope.nativeContract}`,
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

  // The checkout is shallow: fetch just the two commits' trees. Renames are
  // listed as a delete plus an add, so the diff never needs file contents.
  spawnSync(
    "git",
    ["fetch", "--no-tags", "--depth=1", "--filter=blob:none", "origin", base, head],
    { encoding: "utf8", stdio: ["ignore", "ignore", "inherit"] },
  );
  const diff = spawnSync(
    "git",
    ["diff", "--name-only", "--no-renames", "--diff-filter=ACDMRTUXB", "-z", base, head, "--"],
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
