import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parse } from "yaml";

void test("server_install_qualification blocks native_gate and verifies the unit", async () => {
  const workflow = parse(
    await readFile(new URL("../.github/workflows/native-ci.yml", import.meta.url), "utf8"),
  );
  assert.ok(workflow.jobs.server_install_qualification);
  assert.ok(workflow.jobs.native_gate.needs.includes("server_install_qualification"));
  const steps = workflow.jobs.server_install_qualification.steps.map((step) => step.name);
  assert.ok(steps.includes("Verify systemd unit"));
  assert.ok(steps.includes("Install outside the checkout without a toolchain"));
  assert.ok(steps.includes("Qualify doctor, start, pair, thread turn, SIGTERM"));
  // V6 D.4: the upgrade runs INSIDE the qualification script (which owns the
  // profile/port env the respawn needs); the old standalone upgrade step is
  // gone because a second bare-env upgrade would spuriously roll back.
  assert.ok(
    steps.includes("Upgrade a running install from the real tarball (vitest)"),
    "the real-process upgrade integration step is required",
  );
  assert.ok(
    !steps.includes("Qualify upgrade of the running install"),
    "the standalone upgrade step was replaced by the in-script phase",
  );
  const crossBuild = workflow.jobs.server_install_qualification.steps.find(
    (step) => step.name === "Cross-build the linux-arm64 node-pty binding",
  );
  assert.match(crossBuild.run, /cp -RL node_modules\/node-pty\/\./u);
  assert.match(crossBuild.run, /cp -R \/work\/dist\/server-native-cross\/node-pty/u);
  assert.ok(
    workflow.jobs.server_install_qualification.steps.some(
      (step) =>
        step.uses?.startsWith("docker/setup-qemu-action@") && step.with?.platforms === "arm64",
    ),
  );
  // V6 D.2: the shipped overlay must cover both advertised Linux shapes.
  assert.ok(
    steps.includes("Cross-build the linux-arm64 node-pty binding"),
    "the arm64 node-pty cross-build is required before packaging",
  );
  assert.ok(
    steps.includes("Require both linux prebuilds in the tarball"),
    "the tarball must carry linux-x64 and linux-arm64 node-pty prebuilds",
  );
  // V6 round-3: pin the CONTENT greps, not just the step name — the check is
  // only honest while it greps both Linux arches for BOTH staged modules.
  const prebuilds = workflow.jobs.server_install_qualification.steps.find(
    (step) => step.name === "Require both linux prebuilds in the tarball",
  );
  assert.ok(prebuilds, "the prebuild-content step is required");
  for (const module of ["node-pty", "better-sqlite3"]) {
    for (const arch of ["linux-x64", "linux-arm64"]) {
      assert.match(
        prebuilds.run,
        new RegExp(`native-overlay/${module}/${arch}(?:/pty)?\\.node`, "u"),
        `the tarball grep must cover ${module} ${arch}`,
      );
    }
  }
  const install = workflow.jobs.server_install_qualification.steps.find(
    (step) => step.name === "Install outside the checkout without a toolchain",
  );
  assert.match(install.run, /python3 leaked/u);
  assert.match(install.run, /install-server-prefix/u);
});
