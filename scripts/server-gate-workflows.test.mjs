import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  assertOutOfCheckoutCapabilities,
  terminalTurnInput,
} from "./server-install-qualification.mjs";

const workflowUrl = (name) => new URL(`../.github/workflows/${name}`, import.meta.url);

void test("native qualification pins all release manifests only for a supplied version", async (t) => {
  const workflow = await readWorkflow("_server-artifact.yml");
  const steps = workflow.jobs.native_qualification.steps;
  const versionIndex = steps.findIndex((step) => step.name === "Set the release version");
  const qualifyIndex = steps.findIndex(
    (step) => step.name === "Install and qualify the native target from the qualified tarball",
  );
  assert.ok(versionIndex > steps.findIndex((step) => step.name === "Setup Node.js"));
  assert.ok(versionIndex < qualifyIndex);
  const versionStep = steps[versionIndex];
  assert.deepEqual(
    versionStep,
    workflow.jobs.build.steps.find((step) => step.name === "Set the release version"),
  );
  assert.equal(versionStep.if, "${{ inputs.version != '' }}");
  assert.equal(versionStep.env.RELEASE_VERSION, "${{ inputs.version }}");
  assert.equal(versionStep.run, 'node scripts/set-release-version.mjs "$RELEASE_VERSION"');
  assert.equal(steps[qualifyIndex].env.RELEASE_VERSION, "${{ inputs.version }}");
  const manifests = [
    "package.json",
    "packages/poracode-cli/package.json",
    "packages/poracode-cli/runtime-manifest.json",
  ];
  for (const version of ["2.0.0-nightly.202610120050", ""]) {
    const root = await mkdtemp(join(tmpdir(), "native-release-version-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, "scripts"));
    await mkdir(join(root, "packages/poracode-cli"), { recursive: true });
    await cp(
      new URL("./set-release-version.mjs", import.meta.url),
      join(root, "scripts/set-release-version.mjs"),
    );
    const original = `${JSON.stringify({ version: "2.0.0", targets: { previous: {} } })}\n`;
    for (const path of manifests) await writeFile(join(root, path), original);
    // The checked workflow condition controls whether the real release helper runs.
    if (version !== "") {
      execFileSync(process.execPath, ["scripts/set-release-version.mjs", version], { cwd: root });
    }
    for (const path of manifests) {
      const contents = await readFile(join(root, path), "utf8");
      if (version === "") assert.equal(contents, original);
      else assert.equal(JSON.parse(contents).version, version);
    }
    if (version !== "") {
      assert.deepEqual(JSON.parse(await readFile(join(root, manifests[2]), "utf8")).targets, {});
    }
  }
});

void test("stable publication requires exact-candidate published N-1 proof before creating a tag", async () => {
  const workflow = await readWorkflow("release.yml");
  const steps = workflow.jobs.release.steps;
  const index = (name) => steps.findIndex((step) => step.name === name);
  const gateIndex = index("Require the published N-1 persisted upgrade");
  assert.ok(gateIndex > index("Verify every qualified server artifact"));
  assert.ok(gateIndex < index("Create release commit and staging tag"));
  const gate = steps[gateIndex];
  assert.equal(gate["continue-on-error"], undefined);
  assert.equal(gate.if, undefined);
  assert.match(gate.run, /set -euo pipefail/u);
  assert.match(gate.run, /server-artifact-linux-x64\.json/u);
  assert.match(gate.run, /server-n1-qualification\.mjs/u);
  for (const flag of [
    "--candidate-tarball",
    "--candidate-version",
    "--repo",
    "--target linux-x64",
    "--out-dir",
  ]) {
    assert.ok(gate.run.includes(flag));
  }
  assert.doesNotMatch(gate.run, /\|\| true|assemble-server|build:server/u);
  assert.equal(gate.env.RELEASE_VERSION, "${{ needs.prepare.outputs.version }}");
  assert.equal(gate.env.ASSETS, "${{ runner.temp }}/release-assets");
  const evidence = steps[index("Upload stable N-1 qualification evidence")];
  assert.equal(evidence.if, "${{ !cancelled() }}");
  assert.equal(evidence.with.path, gate.env.N1_EVIDENCE_DIR);
  assert.ok(workflow.jobs.publish_npm.needs.includes("release"));
});

async function readWorkflow(name) {
  return parse(await readFile(workflowUrl(name), "utf8"));
}

void test("release preparation does not install an unused Bun toolchain", async () => {
  for (const releaseName of ["release.yml", "release-nightly.yml"]) {
    const workflow = await readWorkflow(releaseName);
    assert.equal(
      workflow.jobs.prepare.steps.some((step) => step.uses === "./.github/actions/setup-bun"),
      false,
      `${releaseName} resolves versions with Node and must not restore Bun`,
    );
  }
});

void test("Windows setup excludes the actual npm cache and canonical temp before cache restores", async () => {
  const action = parse(
    await readFile(new URL("../.github/actions/setup-bun/action.yml", import.meta.url), "utf8"),
  );
  const steps = action.runs.steps;
  const defenderIndex = steps.findIndex(
    (step) => step.name === "Exclude build folders from Defender scanning (Windows)",
  );
  const setupNodeIndex = steps.findIndex((step) => step.uses?.startsWith("actions/setup-node@"));
  const cacheIndexes = steps.flatMap((step, index) =>
    step.uses?.startsWith("actions/cache@") ? [index] : [],
  );
  assert.ok(defenderIndex > setupNodeIndex, "npm must be available before locating its cache");
  for (const cacheIndex of cacheIndexes)
    assert.ok(defenderIndex < cacheIndex, "exclusions must precede every cache restore");
  const defender = steps[defenderIndex];
  assert.match(defender.run, /\$npmCache = \(& npm config get cache\)\.Trim\(\)/u);
  assert.match(defender.run, /Join-Path \$env:LOCALAPPDATA 'Temp'/u);
  assert.match(defender.run, /\$npmCache,/u);
});

void test("release Windows jobs restore Bun without the npm registry archive", async () => {
  const action = parse(
    await readFile(new URL("../.github/actions/setup-bun/action.yml", import.meta.url), "utf8"),
  );
  assert.equal(action.inputs["registry-cache"].default, "all");
  const steps = action.runs.steps;
  const combined = steps.find((step) =>
    String(step.with?.key).startsWith("registry-${{ runner.os }}"),
  );
  assert.equal(combined.if, "inputs.registry-cache == 'all'");
  const bunOnly = steps.find((step) =>
    String(step.with?.key).startsWith("registry-bun-${{ runner.os }}"),
  );
  assert.equal(bunOnly.if, "inputs.registry-cache == 'bun'");
  assert.equal(bunOnly.with.path, "${{ steps.registry-cache.outputs.bun }}");

  for (const workflowName of ["_build.yml", "_server-artifact.yml"]) {
    const workflow = await readWorkflow(workflowName);
    const setup = workflow.jobs.build.steps.find((step) => step.name === "Setup Bun");
    assert.equal(setup.with["registry-cache"], "${{ runner.os == 'Windows' && 'bun' || 'all' }}");
  }
  const tui = await readWorkflow("_tui-binaries.yml");
  const setup = tui.jobs.binaries.steps.find((step) => step.name === "Setup Bun");
  assert.equal(setup.with["registry-cache"], "bun");
});

void test("desktop packaging caches exact verified computer-use helper artifacts", async () => {
  const workflow = await readWorkflow("_build.yml");
  const steps = workflow.jobs.build.steps;
  const cacheIndex = steps.findIndex((step) => step.name === "Cache computer-use helper artifact");
  const prepareIndex = steps.findIndex((step) => step.name === "Prepare computer-use helper");
  assert.ok(cacheIndex >= 0 && cacheIndex < prepareIndex);
  const cache = steps[cacheIndex];
  const directoryIndex = steps.findIndex((step) => step.name === "Prepare helper cache directory");
  assert.ok(directoryIndex >= 0 && directoryIndex < cacheIndex);
  assert.match(steps[directoryIndex].run, /mkdirSync\('resources\/computer-use-helper'/u);
  assert.equal(cache.id, "helper-artifact");
  assert.equal(cache.with.path, "resources/computer-use-helper");
  assert.match(cache.with.key, /matrix\.rust-version/u);
  assert.match(cache.with.key, /matrix\.helper-targets/u);
  for (const input of [
    "native/computer-use-helper/src/**",
    "native/computer-use-helper/Cargo.toml",
    "native/computer-use-helper/Cargo.lock",
    "native/computer-use-helper/.cargo/config.toml",
    "native/computer-use-helper/rust-toolchain.toml",
    "scripts/prepare-computer-use-helper.mjs",
    "scripts/lib/native-helper-prepare.mjs",
    "src/shared/contracts/computerUse.ts",
  ]) {
    assert.ok(cache.with.key.includes(input), `helper cache key must include ${input}`);
  }
  assert.equal(cache.with["restore-keys"], undefined);
  const touch = steps.find((step) => step.name === "Mark restored helper current");
  assert.equal(touch.if, "steps.helper-artifact.outputs.cache-hit == 'true'");
  assert.match(touch.run, /touch resources\/computer-use-helper\/\*\/poracode-computer-use\*/u);
  const setupRust = steps.find((step) => step.name === "Setup Rust");
  assert.equal(setupRust.with.toolchain, "${{ matrix.rust-version }}");
  for (const entry of workflow.jobs.build.strategy.matrix.include) {
    assert.equal(entry["rust-version"], "1.98.1");
    assert.ok(entry["helper-targets"]);
  }
});

void test("qualification and release share one server-artifact workflow (plan D3)", async () => {
  const nativeCi = await readWorkflow("native-ci.yml");
  const qualification = nativeCi.jobs.server_install_qualification;
  assert.equal(
    qualification.uses,
    "./.github/workflows/_server-artifact.yml",
    "native-ci must call the one reusable server artifact workflow",
  );
  assert.ok(nativeCi.jobs.native_gate.needs.includes("server_install_qualification"));

  for (const releaseName of ["release.yml", "release-nightly.yml"]) {
    const release = await readWorkflow(releaseName);
    const serverArtifact = release.jobs.server_artifact;
    assert.equal(
      serverArtifact.uses,
      "./.github/workflows/_server-artifact.yml",
      `${releaseName} must qualify the server artifact with the shared workflow`,
    );
    assert.ok(release.jobs.release.needs.includes("server_artifact"));
  }
});

void test("the reusable workflow builds once, qualifies the exact artifact, and covers the platform matrix", async () => {
  const workflow = await readWorkflow("_server-artifact.yml");
  const build = workflow.jobs.build;
  const steps = build.steps;
  const names = steps.map((step) => step.name);
  for (const required of [
    "Build and assemble the server artifact",
    "Require every advertised prebuild and the web client in the tarball",
    "Build the standalone container",
    "Install outside the checkout without a toolchain",
    "Qualify doctor, start, pair, thread turn, SIGTERM",
    "Qualify the publishable launcher against the real tarball",
    "Upload the qualified server artifact",
  ]) {
    assert.ok(names.includes(required), `${required} is required in _server-artifact.yml`);
  }
  const rustCache = steps.find((step) => step.name === "Cache computer-use helper build");
  assert.ok(rustCache.uses.startsWith("Swatinem/rust-cache@"));
  assert.equal(rustCache.with.workspaces, "native/computer-use-helper");

  // The matrix must build and qualify macOS arm64+x64 and native Linux arm64,
  // not silently drop to one Linux tarball.
  const matrixEntries = build.strategy.matrix.include;
  const linuxLeg = matrixEntries.find((entry) => entry.name === "linux");
  const darwinLeg = matrixEntries.find((entry) => entry.name === "darwin");
  assert.ok(linuxLeg && linuxLeg.os === "ubuntu-latest");
  assert.match(String(linuxLeg.require_targets), /inputs\.require_targets/u);
  const trigger = workflow.on ?? workflow[true];
  const defaultLinuxTargets = String(trigger.workflow_call.inputs.require_targets.default);
  assert.match(defaultLinuxTargets, /linux-x64/u);
  assert.match(defaultLinuxTargets, /linux-arm64/u);
  assert.ok(darwinLeg && darwinLeg.os === "macos-15");
  assert.match(String(darwinLeg.require_targets), /darwin-arm64/u);
  assert.match(String(darwinLeg.require_targets), /darwin-x64/u);

  // Windows x64 is built and qualified natively (no cross build, no rebuild),
  // with bash as the one run shell and the same pinned Bun as the other legs.
  const windowsLeg = matrixEntries.find((entry) => entry.name === "windows");
  assert.ok(windowsLeg && windowsLeg.os === "windows-latest");
  assert.equal(windowsLeg.require_targets, "win32-x64");
  assert.equal(windowsLeg.cross_build, false);
  assert.equal(build.defaults.run.shell, "bash");
  const setupBun = steps.find((step) => step.name === "Setup Bun");
  assert.equal(setupBun.uses, "./.github/actions/setup-bun");
  assert.equal(setupBun.if, undefined);
  const nativeRebuild = steps.find(
    (step) => step.name === "Build native dependencies for the tarball",
  );
  assert.equal(nativeRebuild.if, "runner.os != 'Windows'");
  for (const crossStep of steps.filter((step) => /arm64/u.test(step.name ?? ""))) {
    assert.equal(crossStep.if, "matrix.cross_build");
  }

  const nativeEntries = workflow.jobs.native_qualification.strategy.matrix.include;
  assert.ok(
    nativeEntries.some(
      (entry) =>
        entry.target === "linux-arm64" &&
        entry.os === "ubuntu-24.04-arm" &&
        entry.computer_use === false,
    ),
    "the native Linux arm64 qualification leg is required",
  );
  assert.ok(
    nativeEntries.some(
      (entry) =>
        entry.target === "darwin-x64" &&
        entry.os === "macos-15-intel" &&
        entry.computer_use === true,
    ),
    "the native macOS x64 qualification leg is required",
  );
  const nativeInstall = workflow.jobs.native_qualification.steps.find(
    (step) => step.name === "Install and qualify the native target from the qualified tarball",
  );
  assert.match(String(nativeInstall.env.PORACODE_EXPECT_COMPUTER_USE), /matrix\.computer_use/u);

  const assemble = steps.find((step) => step.name === "Build and assemble the server artifact");
  // One web build feeds the bundled client (plan D2); the same recipe runs for
  // qualification and release.
  assert.match(assemble.run, /bun run build:web/u);
  assert.match(assemble.run, /--require-target/u);
  assert.match(assemble.run, /--target/u);
  assert.match(assemble.run, /assemble-server-tarball/u);
  assert.match(assemble.run, /prepare-server-native/u);
  assert.match(
    assemble.run,
    /if \[ "\$\{RUNNER_OS\}" = "Windows" \]; then\s+bun run prepare:service-launcher/u,
  );
  assert.match(assemble.run, /node --test scripts\/prepare-service-launcher\.test\.mjs/u);
  assert.ok(
    assemble.run.indexOf("prepare:service-launcher") <
      assemble.run.indexOf("assemble-server-tarball.mjs"),
  );

  // One node script installs without a toolchain on every OS; the POSIX-only
  // bash symlink recipe is gone.
  const install = steps.find(
    (step) => step.name === "Install outside the checkout without a toolchain",
  );
  assert.match(install.run, /scripts\/ci-install-no-toolchain\.mjs/u);
  assert.doesNotMatch(install.run, /ln -s|command -v/u);
  const noToolchain = await readFile(
    new URL("./ci-install-no-toolchain.mjs", import.meta.url),
    "utf8",
  );
  assert.match(noToolchain, /leaked into install PATH/u);
  assert.match(noToolchain, /install-server-prefix/u);

  const qualify = steps.find(
    (step) => step.name === "Qualify doctor, start, pair, thread turn, SIGTERM",
  );
  assert.match(qualify.run, /server-install-qualification\.mjs/u);
  assert.match(qualify.run, /--artifact/u);

  const launcher = steps.find(
    (step) => step.name === "Qualify the publishable launcher against the real tarball",
  );
  assert.match(launcher.run, /poracode-cli-qualification\.mjs/u);
  assert.match(launcher.run, /--runtime-tarball/u);

  // The real-artifact upgrade gate must run in required mode: a missing or
  // non-D4-capable tarball has to fail the leg, never skip to green.
  const upgrade = steps.find(
    (step) => step.name === "Upgrade a running install from the real tarball (vitest)",
  );
  assert.equal(
    upgrade.env?.PORACODE_REQUIRE_SERVER_IT,
    "1",
    "the upgrade integration test must run with PORACODE_REQUIRE_SERVER_IT=1",
  );
  // Concurrent upgrade tests starved the Windows runner: npm installs took
  // 8-9 min each and icacls and daemon-stop timeouts fired. Keep them serial.
  assert.match(upgrade.run, /^bun run vitest run .*serverUpgrade\.integration\.test\.ts$/u);

  // The tarball-content gate follows the overlay manifests for BOTH modules
  // (the host sqlite binding intentionally has a different path from cross
  // bindings), and no step may pick an arbitrary tarball out of a list.
  const prebuilds = steps.find(
    (step) => step.name === "Require every advertised prebuild and the web client in the tarball",
  );
  assert.match(prebuilds.run, /verify-server-tarball-contents\.mjs/u);
  assert.match(prebuilds.run, /--overlay-root dist\/server-native/u);
  assert.match(prebuilds.run, /VERIFY_ARGS\+=\(--target "\$target"\)/u);
  for (const step of steps) {
    assert.doesNotMatch(step.run ?? "", /\|\s*head\s+-n\s*1/u, "no arbitrary tarball selection");
  }

  const upload = steps.find((step) => step.name === "Upload the qualified server artifact");
  assert.ok(upload.with.path.includes("dist/server-artifact.json"));
  assert.equal(
    upload.with["if-no-files-found"],
    "error",
    "a missing qualified file must fail the leg, never warn",
  );

  // The aggregate job merges every leg's metadata into one manifest and
  // verifies it before upload; a duplicate/dropped target fails closed.
  const aggregateSteps = workflow.jobs.aggregate.steps;
  const merge = aggregateSteps.find(
    (step) => step.name === "Merge, verify, and emit the aggregate artifact",
  );
  assert.match(merge.run, /generate-runtime-manifest\.mjs/u);
  assert.match(merge.run, /--verify/u);
  assert.match(merge.run, /ARGS\+=\(--artifact/u);
  // Per-leg metadata handling reads env vars in a node script; nothing is
  // interpolated into node -p source, and win32-x64 is copied by the same
  // platform-arch naming as every other leg.
  assert.match(merge.run, /ci-server-artifact-meta\.mjs aggregate-leg/u);
  for (const step of [...steps, ...aggregateSteps, ...workflow.jobs.native_qualification.steps]) {
    assert.doesNotMatch(step.run ?? "", /node -p "require\('\$/u);
  }
  const aggregateUpload = aggregateSteps.find(
    (step) => step.name === "Upload the aggregate qualified artifact",
  );
  assert.equal(aggregateUpload.with["if-no-files-found"], "error");
  assert.match(String(aggregateUpload.with.name), /-qualified-/u);
  for (const releaseName of ["release.yml", "release-nightly.yml"]) {
    const release = await readWorkflow(releaseName);
    const downloads = release.jobs.release.steps.filter((step) =>
      step.uses?.startsWith("actions/download-artifact"),
    );
    assert.ok(
      downloads.some((step) => /poracode-server-artifact-qualified-/u.test(step.with.pattern)),
      `${releaseName} must download the verified aggregate, not the per-leg builds`,
    );
  }
});

void test("out-of-checkout qualification requires each target's truthful optional capabilities", () => {
  const doctor = (computerUse) => ({
    hostServices: { ssh: { enabled: true }, computerUse: { enabled: computerUse } },
  });
  const capabilities = (computerUse) => ({ ssh: true, computerUse });

  assert.doesNotThrow(() =>
    assertOutOfCheckoutCapabilities(doctor(true), capabilities(true), true),
  );
  assert.doesNotThrow(() =>
    assertOutOfCheckoutCapabilities(doctor(false), capabilities(false), false),
  );
  assert.throws(
    () => assertOutOfCheckoutCapabilities(doctor(false), capabilities(false), true),
    /computerUse:true/u,
  );
  assert.throws(
    () => assertOutOfCheckoutCapabilities(doctor(true), capabilities(true), false),
    /computerUse:false/u,
  );
});

void test("the arm64 node-pty cross-build stages the installed node-addon-api sibling and proves it visible", async () => {
  const workflow = await readWorkflow("_server-artifact.yml");
  const cross = workflow.jobs.build.steps.find(
    (step) => step.name === "Cross-build the linux-arm64 node-pty binding",
  );
  assert.ok(cross, "the arm64 cross-build step is required in _server-artifact.yml");
  const run = cross.run;

  // The emulated arm64 container must still drop the binding where
  // prepare-server-native.mjs picks cross targets up.
  assert.match(run, /--platform linux\/arm64/u);
  assert.match(run, /dist\/server-native-cross\/linux-arm64\/pty\.node/u);

  // pnpm resolves node-pty's dependency to a virtual-store sibling, so the
  // exact installed node-addon-api must be resolved by Node through pnpm's
  // symlinks from the installed node-pty — never fetched from the registry,
  // where the version would be unpinned.
  assert.match(run, /require\.resolve\('node-addon-api\/package\.json'/u);
  assert.match(
    run,
    /paths:\s*\[require\('node:path'\)\.dirname\(require\.resolve\('node-pty\/package\.json'\)\)\]/u,
    "node-addon-api must resolve from the installed node-pty's real location",
  );
  assert.match(
    run,
    /cp -RL "\$ADDON_API_DIR" dist\/server-native-cross\/node-pty\/node_modules\/node-addon-api/u,
    "the staged package must carry a dereferenced copy of node-addon-api",
  );
  assert.doesNotMatch(
    run,
    /npm (?:install|i|update|ci)\b/u,
    "the cross-build must not fetch dependencies from the registry",
  );
  assert.match(
    run,
    /npm_config_build_from_source=true npm rebuild --offline/u,
    "npm rebuild must emit build/Release/pty.node even when a prebuild is available",
  );

  // The container proves binding.gyp's own require resolves before building.
  assert.match(
    run,
    /node -p 'require\(\\"node-addon-api\\"\)\.include_dir'/u,
    "the container must verify node-addon-api is visible before npm rebuild",
  );

  // Behavioral proof of the staged recipe: replicate the two copies the
  // workflow performs under the real pnpm layout, then resolve node-addon-api
  // the way binding.gyp does (require rooted at the staged package dir) and
  // confirm it resolves inside the staged tree at the exact installed version.
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  const hostRequire = createRequire(join(repoRoot, "package.json"));
  const ptyDir = dirname(hostRequire.resolve("node-pty/package.json"));
  const addonApiPackage = hostRequire.resolve("node-addon-api/package.json", {
    paths: [ptyDir],
  });
  const addonApiVersion = hostRequire(addonApiPackage).version;

  const stage = await mkdtemp(join(tmpdir(), "node-pty-cross-"));
  try {
    const stagedPty = join(stage, "node-pty");
    await cp(ptyDir, stagedPty, { recursive: true, dereference: true });
    await cp(dirname(addonApiPackage), join(stagedPty, "node_modules", "node-addon-api"), {
      recursive: true,
      dereference: true,
    });
    const stagedResolution = createRequire(join(stagedPty, "binding.gyp")).resolve(
      "node-addon-api/package.json",
    );
    assert.equal(
      await realpath(dirname(stagedResolution)),
      await realpath(join(stagedPty, "node_modules", "node-addon-api")),
      `the staged copy must be visible from the staged package, resolved ${stagedResolution}`,
    );
    assert.equal(
      hostRequire(stagedResolution).version,
      addonApiVersion,
      "the staged copy must be the exact installed node-addon-api version",
    );
    const prebuildScript = join(stagedPty, "scripts", "prebuild.js");
    await mkdir(join(stagedPty, "prebuilds", `${process.platform}-${process.arch}`), {
      recursive: true,
    });
    execFileSync(process.execPath, [prebuildScript], {
      env: { ...process.env, npm_config_build_from_source: "false" },
    });
    assert.throws(
      () =>
        execFileSync(process.execPath, [prebuildScript], {
          env: { ...process.env, npm_config_build_from_source: "true" },
        }),
      { status: 1 },
    );
    await assert.rejects(realpath(join(stagedPty, "prebuilds")), { code: "ENOENT" });
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
});

void test("macOS updater and DMG packaging run as independent release legs", async () => {
  const build = await readWorkflow("_build.yml");
  const macLegs = build.jobs.build.strategy.matrix.include.filter(
    (entry) => entry.platform === "mac",
  );
  assert.deepEqual(macLegs.map((entry) => entry.artifact).sort(), [
    "dist-mac-dmg",
    "dist-mac-updater",
  ]);
  for (const entry of macLegs) {
    assert.ok(["zip", "dmg"].includes(entry.target));
    assert.ok(entry.app_pattern);
    assert.equal(entry.expected_zips, entry.target === "zip" ? 2 : 0);
  }
  const steps = build.jobs.build.steps;
  const packageStep = steps.find((step) => step.name === "Package macOS");
  assert.match(packageStep.run, /--target "\$\{\{ matrix\.target \}\}"/u);
  const verifyStep = steps.find(
    (step) => step.name === "Verify macOS app bundles and updater ZIPs",
  );
  assert.match(verifyStep.run, /matrix\.app_pattern/u);
  assert.match(verifyStep.run, /matrix\.expected_zips/u);
  const upload = steps.find((step) => step.name === "Upload built artifacts");
  assert.equal(upload.if, "matrix.target != 'dmg'");
  const dmgUpload = steps.find((step) => step.name === "Upload macOS DMG artifacts");
  assert.equal(dmgUpload.if, "matrix.target == 'dmg'");
  assert.match(dmgUpload.with.path, /Poracode-\*\.dmg/u);
  assert.doesNotMatch(dmgUpload.with.path, /latest\*\.yml|nightly\*\.yml/u);
});

void test("desktop packaging ships the SSH worker and the preassembled archive", async () => {
  const build = await readWorkflow("_build.yml");
  const archiveStep = build.jobs.build.steps.find(
    (step) => step.name === "Build the immutable SSH runtime archive",
  );
  assert.ok(archiveStep, "_build.yml must build the preassembled SSH runtime archive");
  assert.match(archiveStep.run, /build-ssh-runtime-archive\.mjs/u);

  const desktop = await readFile(
    new URL("../scripts/build-desktop-artifact.mjs", import.meta.url),
    "utf8",
  );
  assert.match(
    desktop,
    /- dist\/main\/sshEnvironmentWorker\.cjs/u,
    "the SSH utility child must be asar-unpacked",
  );
  assert.match(
    desktop,
    /- from: resources\/ssh-runtime-archive/u,
    "the preassembled archive must ship as an extra resource",
  );
});

void test("release promotes the qualified bytes and never rebuilds the tarball", async () => {
  const build = await readWorkflow("_build.yml");
  const buildSteps = build.jobs.build.steps.map((step) => step.name);
  assert.ok(
    !buildSteps.some((name) => /server tarball/i.test(name ?? "")),
    "the desktop build must not assemble a second server recipe",
  );
  const upload = build.jobs.build.steps.find((step) => step.name === "Upload built artifacts");
  assert.ok(
    !upload.with.path.includes("poracode-server-"),
    "desktop upload must not carry a server tarball",
  );

  for (const releaseName of ["release.yml", "release-nightly.yml"]) {
    const release = await readWorkflow(releaseName);
    const releaseSteps = release.jobs.release.steps;
    const verifyIndex = releaseSteps.findIndex((step) =>
      /Verify every qualified server artifact/u.test(step.name ?? ""),
    );
    const publishIndex = releaseSteps.findIndex((step) =>
      step.uses?.startsWith("softprops/action-gh-release"),
    );
    assert.ok(verifyIndex >= 0, `${releaseName} must verify the qualified artifacts`);
    assert.ok(publishIndex > verifyIndex, `${releaseName} must verify before publishing`);
    const verify = releaseSteps[verifyIndex];
    assert.match(verify.run, /sha256sum/u);
    assert.match(verify.run, /server-artifact-\*\.json/u);
    assert.match(verify.run, /ci-server-artifact-meta\.mjs verify-standalone-release/u);
    assert.match(verify.run, /ARGS\+=\(--standalone/u);
    assert.match(verify.run, /generate-runtime-manifest\.mjs --verify/u);
    // The installers and SHA256SUMS are added after verification and before
    // the draft upload, so the checksums cover every uploaded asset.
    const checksumsIndex = releaseSteps.findIndex(
      (step) => step.name === "Add the one-line installers and release checksums",
    );
    assert.ok(checksumsIndex > verifyIndex && checksumsIndex < publishIndex);
    assert.match(releaseSteps[checksumsIndex].run, /website\/public\/install\.sh/u);
    assert.match(releaseSteps[checksumsIndex].run, /website\/public\/install\.ps1/u);
    assert.match(releaseSteps[checksumsIndex].run, /release-checksums\.mjs "\$ASSETS"/u);
    assert.ok(
      !releaseSteps.some((step) => /assemble:server-tarball/u.test(step.run ?? "")),
      `${releaseName} must not rebuild the tarball after qualification`,
    );
  }

  // npm allows up to 10 trusted publishers per package; one dispatched
  // publish-npm.yml keeps a single trusted-publisher entry to audit. Both
  // trains dispatch it after their GitHub release, gated on explicit
  // authorization, then wait for the run so a failed publish fails the
  // release. Stable takes `latest`; nightly only ever takes `nightly`
  // (a prerelease must never take the mutable `latest` dist-tag, which the
  // publish script also refuses).
  for (const [releaseName, tag] of [
    ["release.yml", "latest"],
    ["release-nightly.yml", "nightly"],
  ]) {
    const npmJob = (await readWorkflow(releaseName)).jobs.publish_npm;
    assert.ok(npmJob, `${releaseName} must define the npm publication job`);
    assert.match(String(npmJob.if), /NPM_PUBLISH_ENABLED/u);
    assert.ok(npmJob.needs.includes("release"), "npm publishes only after the GitHub release");
    assert.equal(npmJob.permissions.actions, "write");
    assert.equal(npmJob.permissions["id-token"], undefined, "only publish-npm.yml mints OIDC");
    const dispatch = npmJob.steps.find(
      (step) => step.name === "Dispatch the npm trusted-publisher workflow",
    );
    assert.match(dispatch.run, /gh workflow run publish-npm\.yml/u);
    assert.match(dispatch.run, /source_run_id="\$SOURCE_RUN_ID"/u);
    assert.match(dispatch.run, /gh run watch "\$RUN_ID"[\s\S]*--exit-status/u);
    assert.match(dispatch.run, new RegExp(`dist_tag=${tag}$`, "mu"));
  }

  const publish = await readWorkflow("publish-npm.yml");
  assert.match(
    String(publish["run-name"]),
    /for run \$\{\{ inputs\.source_run_id \}\}$/u,
    "the dispatch lookup finds this run by its run-name suffix",
  );
  const publishJob = publish.jobs.publish;
  assert.match(String(publishJob.if), /NPM_PUBLISH_ENABLED/u);
  assert.equal(publishJob.permissions["id-token"], "write");
  const trigger = publish.on ?? publish[true];
  assert.deepEqual(trigger.workflow_dispatch.inputs.dist_tag.options, ["latest", "nightly"]);
  const steps = publishJob.steps;
  const verifySource = steps.find(
    (step) => step.name === "Verify the source run and the public release",
  );
  assert.match(
    verifySource.run,
    /\.github\/workflows\/release\.yml \| \.github\/workflows\/release-nightly\.yml/u,
  );
  assert.match(verifySource.run, /isDraft/u);
  const download = steps.find((step) => step.name === "Download the aggregate qualified artifact");
  assert.equal(download.with["run-id"], "${{ inputs.source_run_id }}");
  const compare = steps.findIndex(
    (step) => step.name === "Require the public release to carry the qualified manifest",
  );
  const publishIndex = steps.findIndex(
    (step) => step.name === "Pack and publish the exact qualified package",
  );
  assert.ok(compare >= 0 && compare < publishIndex);
  assert.match(steps[compare].run, /^cmp /u);
  const publishStep = steps[publishIndex];
  assert.match(publishStep.run, /publish-npm-package\.mjs/u);
  assert.match(publishStep.run, /--standalone/u);
  assert.match(publishStep.run, /--tag "\$DIST_TAG"/u);
  assert.match(
    publishStep.run,
    /--trusted-publishing/u,
    "the OIDC publish job must opt in explicitly; ambient OIDC env is not authority",
  );
});

void test("self-contained archives are built and qualified natively from the qualified bytes", async () => {
  const workflow = await readWorkflow("_server-artifact.yml");
  const standalone = workflow.jobs.standalone;
  assert.deepEqual(standalone.needs, "build");
  const entries = standalone.strategy.matrix.include;
  const expected = {
    "linux-x64": ["ubuntu-latest", "linux"],
    "linux-arm64": ["ubuntu-24.04-arm", "linux"],
    "darwin-arm64": ["macos-15", "darwin"],
    "darwin-x64": ["macos-15-intel", "darwin"],
    "win32-x64": ["windows-latest", "windows"],
  };
  assert.deepEqual(entries.map((entry) => entry.target).sort(), Object.keys(expected).sort());
  for (const entry of entries) {
    assert.deepEqual([entry.os, entry.build_leg], expected[entry.target], entry.target);
  }
  const steps = standalone.steps;
  const build = steps.find(
    (step) => step.name === "Build the self-contained archive from the qualified tarball",
  );
  assert.match(build.run, /ci-server-artifact-meta\.mjs native-target/u);
  assert.match(build.run, /build-standalone-archive\.mjs/u);
  const qualify = steps.find(
    (step) => step.name === "Qualify the archive with its own Node and no host Node on PATH",
  );
  assert.match(qualify.run, /server-install-qualification\.mjs .*--standalone/u);
  assert.match(qualify.run, /poracode-cli-qualification\.mjs --runtime-tarball "\$ARCHIVE"/u);
  assert.match(
    qualify.run,
    /installer-qualification\.mjs --archive "\$ARCHIVE" --metadata "\$METADATA"/u,
  );
  assert.match(String(qualify.env.PORACODE_EXPECT_COMPUTER_USE), /matrix\.computer_use/u);
  const upload = steps.find((step) => step.name === "Upload the qualified self-contained archive");
  assert.equal(upload.with["if-no-files-found"], "error");
  assert.match(String(upload.with.name), /-standalone-\$\{\{ matrix\.target \}\}-/u);

  const aggregate = workflow.jobs.aggregate;
  assert.ok(aggregate.needs.includes("standalone"));
  const merge = aggregate.steps.find(
    (step) => step.name === "Merge, verify, and emit the aggregate artifact",
  );
  assert.match(merge.run, /ci-server-artifact-meta\.mjs aggregate-standalone/u);
  assert.match(merge.run, /generate-runtime-manifest\.mjs "\$\{STANDALONE_ARGS\[@\]\}"/u);
  assert.match(merge.run, /--verify "\$\{STANDALONE_ARGS\[@\]\}"/u);
});

void test("the terminal turn command is valid in sh, cmd.exe and PowerShell and only its output matches", () => {
  const posix = terminalTurnInput("linux");
  const windows = terminalTurnInput("win32");
  assert.ok(posix.endsWith("\n") && windows.endsWith("\r"));
  for (const input of [posix, windows]) {
    // The needle is computed by node, so echoed input can never contain it.
    assert.ok(!input.includes("pty-192-turn"));
    assert.ok(!/\$\(|`/u.test(input), "no shell-specific expansion syntax");
  }
});

void test("standalone qualification PATH holds the bundled runtime but no host Node or npm", async () => {
  const { standaloneQualificationPath } = await import("./server-install-qualification.mjs");
  const posix = standaloneQualificationPath(
    "/prefix/current/runtime",
    { PATH: "/opt/node/bin:/usr/bin" },
    "linux",
  );
  assert.equal(posix.split(":")[0], "/prefix/current/runtime");
  assert.ok(!posix.split(":").includes("/opt/node/bin"), posix);
  // A git-only shim replaces a package-manager bin directory that holds node.
  const shimmed = standaloneQualificationPath(
    "/prefix/current/runtime",
    { PATH: "/opt/homebrew/bin:/usr/bin" },
    "darwin",
    "/tmp/poracode-qualify-git-x",
  );
  assert.deepEqual(shimmed.split(":").slice(0, 2), [
    "/prefix/current/runtime",
    "/tmp/poracode-qualify-git-x",
  ]);
  assert.ok(!shimmed.split(":").includes("/opt/homebrew/bin"), shimmed);
  const windows = standaloneQualificationPath(
    "C:\\p\\current\\runtime",
    { Path: "C:\\hostedtoolcache\\node;C:\\Windows\\System32", SystemRoot: "C:\\Windows" },
    "win32",
  );
  const entries = windows.split(";");
  assert.equal(entries[0], "C:\\p\\current\\runtime");
  assert.ok(entries.includes("C:\\Windows\\System32\\WindowsPowerShell\\v1.0"), windows);
  assert.ok(!entries.includes("C:\\hostedtoolcache\\node"), windows);
});
