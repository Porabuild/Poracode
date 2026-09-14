import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parse } from "yaml";

void test("API 37 workflow preserves shell state, joins its harness, and propagates failures", async () => {
  const workflow = parse(
    await readFile(new URL("../.github/workflows/native-ci.yml", import.meta.url), "utf8"),
  );
  const step = workflow.jobs.android_api37_runtime.steps.find((item) =>
    item.uses?.startsWith("ReactiveCircus/android-emulator-runner@"),
  );
  const temporaryRoot = fileURLToPath(new URL("../tmp/", import.meta.url));
  await mkdir(temporaryRoot, { recursive: true });
  const temporary = await mkdtemp(join(temporaryRoot, "android-ci-"));
  try {
    const bin = join(temporary, "bin");
    const android = join(temporary, "android");
    const sources = join(android, "app/src/androidTest");
    await Promise.all([
      mkdir(bin),
      mkdir(sources, { recursive: true }),
      mkdir(join(temporary, "scripts")),
    ]);
    await copyFile(
      new URL("./ci-android-api37.sh", import.meta.url),
      join(temporary, "scripts/ci-android-api37.sh"),
    );
    await writeFile(join(sources, "Coverage.kt"), "ACCESS_LOCAL_NETWORK granted denied\n");
    const nodeShebang = `#!${process.execPath}\n`;
    await Promise.all([
      writeFile(
        join(bin, "adb"),
        `#!/bin/sh
case "$*" in
  'shell getprop sys.boot_completed') echo 1;;
  'shell getprop ro.build.version.release') echo 17;;
  'shell getprop ro.build.version.sdk') echo 37;;
  'shell getprop ro.build.version.codename') echo REL;;
  'shell dumpsys package '*) echo 'minSdk=26 targetSdk=37';;
  'shell am start '*) echo 'Status: ok';;
  'shell pidof '*) echo 1234;;
esac
`,
        { mode: 0o755 },
      ),
      writeFile(join(bin, "openssl"), "#!/bin/sh\necho fixture-capability\n", { mode: 0o755 }),
      writeFile(join(bin, "sleep"), nodeShebang + "setTimeout(() => {}, 50);\n", { mode: 0o755 }),
      writeFile(
        join(bin, "node"),
        nodeShebang +
          `import fs from 'node:fs';
const root = process.env.RUNNER_TEMP;
fs.writeFileSync(root + '/harness.json', JSON.stringify({
  cwd: process.cwd(), args: process.argv.slice(2),
  capability: process.env.NATIVE_E2E_CONTROL_CAPABILITY,
  slot: process.env.PORACODE_NATIVE_E2E_SLOT,
  timeout: Number(process.env.NATIVE_E2E_TEST_TIMEOUT_MS),
  built: fs.existsSync(root + '/built'),
}));
if (process.env.FAILURE_STAGE === 'harness') process.exit(9);
const timer = setInterval(() => {}, 1000);
process.on('SIGTERM', () => {
  fs.writeFileSync(root + '/harness-stopped', 'joined');
  clearInterval(timer);
});
process.stderr.write('native-e2e mock host ready\\n');
`,
        { mode: 0o755 },
      ),
      writeFile(
        join(android, "gradlew"),
        nodeShebang +
          `import fs from 'node:fs';
const root = process.env.RUNNER_TEMP;
if (process.argv[2] === 'assembleDebug') {
  fs.writeFileSync(root + '/built', 'yes');
} else {
  fs.writeFileSync(root + '/instrumentation.json', JSON.stringify({
    cwd: process.cwd(), args: process.argv.slice(2),
    harnessStopped: fs.existsSync(root + '/harness-stopped'),
  }));
  if (process.env.FAILURE_STAGE === 'instrumentation') process.exit(7);
}
`,
        { mode: 0o755 },
      ),
    ]);
    for (const failureStage of ["none", "harness", "instrumentation"]) {
      const evidence = join(temporary, failureStage);
      await mkdir(evidence);
      // The pinned emulator action executes each nonempty input line with sh -c.
      let status = null;
      let output = "";
      for (const line of step.with.script.trim().split(/\r?\n/)) {
        const result = spawnSync("sh", ["-c", line], {
          cwd: join(temporary, step.with["working-directory"]),
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            RUNNER_TEMP: evidence,
            GITHUB_STEP_SUMMARY: join(evidence, "summary"),
            FAILURE_STAGE: failureStage,
          },
          encoding: "utf8",
          timeout: 15_000,
        });
        assert.ifError(result.error);
        status = result.status;
        output += result.stdout + result.stderr;
        if (status !== 0) break;
      }
      assert.equal(
        status,
        failureStage === "none" ? 0 : failureStage === "harness" ? 1 : 7,
        output,
      );
      const harness = JSON.parse(await readFile(join(evidence, "harness.json"), "utf8"));
      assert.equal(harness.cwd, temporary);
      assert.equal(harness.capability, "fixture-capability");
      assert.equal(harness.slot, "1");
      assert.ok(harness.timeout > 120_000);
      assert.equal(harness.built, true);
      assert.ok(harness.args.includes("./tests/native-e2e/harness/cli.ts"));
      if (failureStage === "harness") {
        await assert.rejects(readFile(join(evidence, "instrumentation.json")), { code: "ENOENT" });
      } else {
        const instrumentation = JSON.parse(
          await readFile(join(evidence, "instrumentation.json"), "utf8"),
        );
        assert.equal(instrumentation.cwd, android);
        assert.equal(instrumentation.harnessStopped, false);
        assert.ok(
          instrumentation.args.includes(
            "-Pandroid.testInstrumentationRunnerArguments.capability=fixture-capability",
          ),
        );
        assert.equal(await readFile(join(evidence, "harness-stopped"), "utf8"), "joined");
      }
      if (failureStage === "none") {
        assert.match(
          await readFile(join(evidence, "summary"), "utf8"),
          /instrumentation suite passed/,
        );
      } else {
        await assert.rejects(readFile(join(evidence, "summary")), { code: "ENOENT" });
      }
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
