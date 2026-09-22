import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const workflowUrl = (name) => new URL(`../.github/workflows/${name}`, import.meta.url);

async function readWorkflow(name) {
  return parse(await readFile(workflowUrl(name), "utf8"));
}

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

  const nativeEntries = workflow.jobs.native_qualification.strategy.matrix.include;
  assert.ok(
    nativeEntries.some(
      (entry) => entry.target === "linux-arm64" && entry.os === "ubuntu-24.04-arm",
    ),
    "the native Linux arm64 qualification leg is required",
  );
  assert.ok(
    nativeEntries.some((entry) => entry.target === "darwin-x64" && entry.os === "macos-15-intel"),
    "the native macOS x64 qualification leg is required",
  );

  const assemble = steps.find((step) => step.name === "Build and assemble the server artifact");
  // One web build feeds the bundled client (plan D2); the same recipe runs for
  // qualification and release.
  assert.match(assemble.run, /pnpm run build:web/u);
  assert.match(assemble.run, /--require-target/u);
  assert.match(assemble.run, /--target/u);
  assert.match(assemble.run, /assemble-server-tarball/u);
  assert.match(assemble.run, /prepare-server-native/u);

  const install = steps.find(
    (step) => step.name === "Install outside the checkout without a toolchain",
  );
  assert.match(install.run, /python3 leaked/u);
  assert.match(install.run, /make leaked/u);
  assert.match(install.run, /install-server-prefix/u);

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
    /npm rebuild --offline/u,
    "npm rebuild must fail loudly on a missing dependency, not fetch one",
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
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
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
    assert.match(verify.run, /ARGS\+=\(--artifact/u);
    assert.match(verify.run, /generate-runtime-manifest\.mjs --verify/u);
    assert.ok(
      !releaseSteps.some((step) => /assemble:server-tarball/u.test(step.run ?? "")),
      `${releaseName} must not rebuild the tarball after qualification`,
    );
  }

  // Stable releases publish the exact packed package, gated on explicit
  // authorization; nightly prereleases stay GitHub-only (a prerelease must
  // never take the mutable `latest` dist-tag).
  const release = await readWorkflow("release.yml");
  const npmJob = release.jobs.publish_npm;
  assert.ok(npmJob, "release.yml must define the npm publication job");
  assert.match(String(npmJob.if), /NPM_PUBLISH_ENABLED/u);
  assert.equal(npmJob.permissions["id-token"], "write");
  const publishStep = npmJob.steps.find(
    (step) => step.name === "Pack and publish the exact qualified package",
  );
  assert.match(publishStep.run, /publish-npm-package\.mjs/u);
  assert.match(publishStep.run, /--manifest/u);
  assert.match(publishStep.run, /--artifact/u);
  assert.match(
    publishStep.run,
    /--trusted-publishing/u,
    "the OIDC publish job must opt in explicitly; ambient OIDC env is not authority",
  );
  assert.equal((await readWorkflow("release-nightly.yml")).jobs.publish_npm, undefined);
});
