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
  const buildStep = workflow.jobs.android_api37_runtime.steps.find(
    (item) => item.name === "Build Android runtime APKs before boot",
  );
  assert.ok(
    workflow.jobs.android_api37_runtime.steps.indexOf(buildStep) <
      workflow.jobs.android_api37_runtime.steps.indexOf(step),
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
  'install -r '*) if [ "$FAILURE_STAGE" = install ]; then exit 6; fi;;
  'logcat -d -t '*) if [ "$FAILURE_STAGE" = instrumentation-logcat ]; then echo fixture-logcat-error >&2; exit 8; fi; echo fixture-logcat;;
  'logcat -d '*) echo fixture-logcat;;
  'shell getprop sys.boot_completed') echo 1;;
  'shell getprop ro.build.version.release') echo 17;;
  'shell getprop ro.build.version.sdk') echo 37;;
  'shell getprop ro.build.version.codename') echo REL;;
  'shell pm path '*) echo 'package:/data/app/android.apk';;
  'shell am get-current-user') echo 0;;
  'shell dumpsys package '*) echo 'minSdk=34 targetSdk=37';;
  'shell am start '*) echo 'Status: ok';;
  'shell pidof '*) echo 1234;;
  'shell dumpsys activity activities'*) echo 'mResumedActivity=ComponentInfo{com.poracode.app.MainActivity}'};;
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
  if (process.env.FAILURE_STAGE === 'build') process.exit(5);
  fs.writeFileSync(root + '/built', 'yes');
} else {
  fs.writeFileSync(root + '/instrumentation.json', JSON.stringify({
    cwd: process.cwd(), args: process.argv.slice(2),
    harnessStopped: fs.existsSync(root + '/harness-stopped'),
  }));
  if (process.env.FAILURE_STAGE.startsWith('instrumentation')) process.exit(7);
}
`,
        { mode: 0o755 },
      ),
    ]);
    for (const [failureStage, expectedStatus] of [
      ["none", 0],
      ["build", 5],
      ["install", 6],
      ["harness", 1],
      ["instrumentation", 7],
      ["instrumentation-logcat", 7],
    ]) {
      const evidence = join(temporary, failureStage);
      await mkdir(evidence);
      // The pinned emulator action executes each nonempty input line with sh -c.
      let status = null;
      let output = "";
      const commands = [
        { script: buildStep.run, cwd: buildStep["working-directory"] },
        ...step.with.script
          .trim()
          .split(/\r?\n/)
          .map((script) => ({
            script,
            cwd: step.with["working-directory"],
          })),
      ];
      for (const command of commands) {
        const result = spawnSync("sh", ["-c", command.script], {
          cwd: join(temporary, command.cwd),
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
      assert.equal(status, expectedStatus, output);
      if (failureStage !== "build") {
        const logcat = await readFile(join(evidence, "android-api37-logcat.txt"), "utf8");
        assert.match(logcat, /^fixture-logcat\n/);
        if (failureStage === "instrumentation-logcat") {
          assert.equal(logcat, "fixture-logcat\nfixture-logcat-error\n");
        }
      }
      if (failureStage === "build" || failureStage === "install") {
        await assert.rejects(readFile(join(evidence, "harness.json")), { code: "ENOENT" });
        await assert.rejects(readFile(join(evidence, "instrumentation.json")), { code: "ENOENT" });
        await assert.rejects(readFile(join(evidence, "summary")), { code: "ENOENT" });
        continue;
      }
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
        const classFilter = instrumentation.args.find((argument) =>
          argument.startsWith("-Pandroid.testInstrumentationRunnerArguments.class="),
        );
        assert.equal(
          classFilter,
          "-Pandroid.testInstrumentationRunnerArguments.class=" +
            [
              "com.poracode.app.Android37MultihostInstrumentedTest",
              "com.poracode.app.Android37WireLabFamilyInstrumentedTest",
              "com.poracode.app.Android37WireLabJourneyInstrumentedTest",
              "com.poracode.app.Android37WireLabSmokeInstrumentedTest",
            ].join(","),
        );
        assert.doesNotMatch(classFilter, /CapableHistory|NoticeCapability/u);
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

void test("API 34 minimum-supported runtime boots Android 14 and requires launch plus TLS pin evidence", async () => {
  const workflow = parse(
    await readFile(new URL("../.github/workflows/native-ci.yml", import.meta.url), "utf8"),
  );
  const job = workflow.jobs.android_api34_runtime;
  assert.ok(job, "The API 26 lane must be replaced by a required Android 14/API 34 lane");
  assert.deepEqual(job.needs, ["changes", "android"]);
  const boot = job.steps.find(
    (item) => item.name === "Boot Android 14 and run the minimum-supported runtime tests",
  );
  assert.ok(boot, "The minimum-supported runtime boot step must stay present");
  assert.equal(boot.with["api-level"], 34);
  assert.match(boot.with.script, /ro\.build\.version\.sdk \| tr -d '\\r'\)" = "34"/);
  // Both minimum-floor classes stay required on the oldest supported release:
  // the cold-launch pairing entry point and the TLS pin pairing test.
  assert.ok(
    boot.with.script.includes(
      "-Pandroid.testInstrumentationRunnerArguments.class=com.poracode.app.MinimumSdkLaunchInstrumentedTest,com.poracode.app.transport.TlsPinPairingInstrumentedTest",
    ),
  );
  const upload = job.steps.find(
    (item) => item.name === "Upload Android 14 minimum-supported runtime evidence",
  );
  assert.ok(upload, "The minimum-supported runtime evidence upload must stay present");
  assert.match(upload.with.name, /^android-api34-runtime-/);
});

void test("iOS UI journeys keep the owned harness alive through a clean Xcode build", async () => {
  const workflow = parse(
    await readFile(new URL("../.github/workflows/native-ci.yml", import.meta.url), "utf8"),
  );
  const steps = workflow.jobs.ios_ui.steps.filter(
    (item) => item.name?.includes("iOS") && item.name?.includes("journey"),
  );
  const mock = steps.find((item) => item.name.includes("mock peer"));
  const real = steps.find((item) => item.name.includes("real host"));
  assert.equal(mock?.env?.NATIVE_E2E_TEST_TIMEOUT_MS, "1800000");
  assert.equal(real?.env?.NATIVE_E2E_TEST_TIMEOUT_MS, "1800000");
  assert.ok(Number(mock.env.NATIVE_E2E_TEST_TIMEOUT_MS) < 60 * 60 * 1_000);
});

void test("native host load suites are isolated without serializing the whole foundation", async () => {
  const workflow = parse(
    await readFile(new URL("../.github/workflows/native-ci.yml", import.meta.url), "utf8"),
  );
  const steps = workflow.jobs.native_e2e_foundation.steps;
  const foundation = steps.find(
    (item) => item.name === "Run native foundation and production-host smoke",
  );
  const load = steps.find((item) => item.name === "Run isolated native load qualifications");
  assert.ok(foundation && load);
  assert.equal(workflow.jobs.native_e2e_foundation["timeout-minutes"], 35);
  assert.doesNotMatch(foundation.run, /--no-file-parallelism/u);
  assert.match(foundation.run, /--exclude='\*\*\/gitBurstQualification\.test\.ts'/u);
  assert.match(foundation.run, /--exclude='\*\*\/sharedHostLoadProfile\.test\.ts'/u);
  assert.match(foundation.run, /--exclude='\*\*\/largePayloadCompression\.test\.ts'/u);
  assert.match(foundation.run, /FULL_QUALIFICATION/u);
  assert.equal(foundation.env.FULL_QUALIFICATION, "${{ needs.changes.outputs.full }}");
  assert.match(load.run, /gitBurstQualification\.test\.ts/u);
  assert.match(load.run, /sharedHostLoadProfile\.test\.ts/u);
  assert.match(load.run, /--no-file-parallelism/u);
  assert.equal(load.env.GIT_BURST_N64_TIMEOUT_MS, "600000");
  assert.equal(load.env.NATIVE_E2E_TEST_TIMEOUT_MS, undefined);
  const upload = steps.find((item) => item.name === "Upload native E2E evidence");
  assert.match(upload.with.path, /native-load-junit\.xml/u);
});

void test("physical-device workflow is dispatch-only on separately labeled self-hosted jobs", async () => {
  const workflow = parse(
    await readFile(
      new URL("../.github/workflows/physical-device-qualification.yml", import.meta.url),
      "utf8",
    ),
  );
  // Dispatch-only: never triggered by push/PR, never a workflow_call building
  // block, so no required gate can pull a physical device into CI.
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.deepEqual(Object.keys(workflow.jobs).sort(), ["android_device", "ios_device"]);
  // Separate labeled self-hosted jobs: distinct device pools, one job per
  // platform.
  const runsOn = Object.values(workflow.jobs).map((job) => job["runs-on"]);
  for (const labels of runsOn) {
    assert.ok(Array.isArray(labels), "self-hosted jobs are selected by a label list");
    assert.equal(labels[0], "self-hosted");
  }
  assert.notDeepEqual(runsOn[0], runsOn[1], "each platform targets its own labeled runner pool");
  // A device is a shared resource: queue dispatches instead of cancelling a
  // mid-run device grab.
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  // Evidence uploads fire on success and failure but not cancellation.
  for (const job of Object.values(workflow.jobs)) {
    const uploads = job.steps.filter((step) => step.uses?.startsWith("actions/upload-artifact@"));
    assert.ok(uploads.length >= 1, "each job uploads evidence");
    for (const upload of uploads) {
      assert.ok(
        typeof upload.if === "string" && upload.if.includes("!cancelled()"),
        "evidence uploads must run on success and failure",
      );
      assert.ok(!upload.if.includes("always()"), "evidence uploads must not run on cancellation");
    }
  }
});

void test("physical-device workflow reuses the real-peer families and never carries pairing secrets", async () => {
  const workflow = parse(
    await readFile(
      new URL("../.github/workflows/physical-device-qualification.yml", import.meta.url),
      "utf8",
    ),
  );
  const serialized = JSON.stringify(workflow);
  // Pairing credentials are harness-minted in-repo; no workflow input, env,
  // or secret may carry them.
  assert.ok(!serialized.includes("NATIVE_E2E_PAIRING_URL"));
  assert.ok(!serialized.includes("pairingUrl"));
  assert.ok(!/\bsecrets\./.test(serialized));
  assert.ok(!serialized.includes("workflow_call"));

  const ios = workflow.jobs.ios_device;
  const iosRun = ios.steps.find((step) => step.run?.includes("node scripts/native-e2e.mjs ios-ui"));
  assert.ok(iosRun, "the iOS job drives the ios-ui journey");
  assert.equal(iosRun.env.NATIVE_E2E_PEER_MODE, "real");
  assert.ok(iosRun.env.NATIVE_E2E_IOS_PHYSICAL_UDID, "the physical selector env is wired");
  assert.ok(iosRun.env.NATIVE_E2E_DEVICE_HOST, "the device-reachable host env is wired");
  assert.equal(iosRun.env.NATIVE_E2E_DEVICE_FORWARD, "1", "the opt-in forwarder is enabled");
  for (const family of [
    "testTerminalKeystrokeFamilyWritesToPty",
    "testGitFamilyReachesHostFromWorkspace",
  ]) {
    assert.ok(
      iosRun.env.NATIVE_E2E_IOS_ONLY_TESTING.includes(family),
      `the real-peer scope must include ${family}`,
    );
  }
  assert.ok(
    ios.steps.some((step) => step.run?.includes("dist/main/server.cjs")),
    "the iOS job builds the production host the real-peer journey requires",
  );
  assert.ok(
    ios.steps.some((step) => step.name === "Resolve the physical iOS target" && step.run),
    "missing dispatch inputs must fail the job before any device work",
  );

  const android = workflow.jobs.android_device;
  const androidRun = android.steps.find((step) =>
    step.run?.includes("scripts/ci-android-device.sh"),
  );
  assert.ok(androidRun, "the Android job runs the physical-device script");
  assert.ok(androidRun.env.ANDROID_SERIAL, "the Android job pins ANDROID_SERIAL");
  const serialStep = android.steps.find(
    (step) => step.name === "Resolve the physical Android serial",
  );
  assert.match(serialStep.run, /\^\[A-Za-z0-9\._:-\]\+\$/u);
  assert.match(serialStep.run, /printf 'ANDROID_SERIAL=%s\\n'/u);
  assert.ok(
    android.steps.some((step) => step.run?.includes("dist/main/server.cjs")),
    "the Android job builds the production host the real-peer journey requires",
  );
});

void test("physical Android script pins the serial, requires API >= 34, and hands off to the real-peer journey", async () => {
  const script = await readFile(new URL("./ci-android-device.sh", import.meta.url), "utf8");
  // No emulator machinery on the physical lane: strip comments and assert
  // no executable line touches an emulator, AVD, KVM, or the 10.0.2.2 alias.
  const executableLines = script
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line) && line.trim() !== "")
    .join("\n");
  assert.doesNotMatch(executableLines, /emulator|avdmanager|sdkmanager|kvm|10\.0\.2\.2/u);
  // The device pin is absolute: every adb call carries -s "$ANDROID_SERIAL".
  assert.doesNotMatch(executableLines, /\badb (?!-s)/u);
  assert.match(executableLines, /ANDROID_SERIAL/);
  assert.match(executableLines, /-lt 34/u, "the maintained floor is enforced numerically");
  assert.match(executableLines, /android-real/u, "hand-off to the real-peer journey");

  const temporaryRoot = fileURLToPath(new URL("../tmp/", import.meta.url));
  await mkdir(temporaryRoot, { recursive: true });
  const temporary = await mkdtemp(join(temporaryRoot, "android-device-"));
  try {
    const bin = join(temporary, "bin");
    const android = join(temporary, "android");
    await Promise.all([
      mkdir(bin),
      mkdir(android, { recursive: true }),
      mkdir(join(temporary, "scripts"), { recursive: true }),
    ]);
    // Copied under scripts/ so the script's own `cd .../../android` resolves
    // inside the fixture tree.
    await copyFile(
      new URL("./ci-android-device.sh", import.meta.url),
      join(temporary, "scripts", "ci-android-device.sh"),
    );
    const nodeShebang = `#!${process.execPath}\n`;
    await Promise.all([
      writeFile(
        join(bin, "adb"),
        `#!/bin/sh
if [ "$1" = "-s" ]; then shift 2; fi
case "$1" in
  get-state)
    if [ "$FAILURE_STAGE" = "offline" ]; then echo offline; else echo device; fi;;
  install) echo Success;;
  logcat) ;;
  shell)
    shift
    case "$*" in
      'getprop sys.boot_completed') echo 1;;
      'getprop ro.build.version.sdk') echo "\${FAKE_SDK:-34}";;
      'getprop ro.build.version.release') echo 14;;
      'pm path android') echo 'package:/data/app/android.apk';;
      'am get-current-user') echo 0;;
      'df -h /data') echo 'fixture-df';;
      'dumpsys package '*) echo 'minSdk=34 targetSdk=37';;
      'am force-stop '*) ;;
      'am start '*) echo 'Status: ok';;
      'pidof '*) echo 1234;;
      *) echo "UNHANDLED ADB: $*" >&2; exit 9;;
    esac;;
  *) echo "UNHANDLED ADB CMD: $*" >&2; exit 9;;
esac
`,
        { mode: 0o755 },
      ),
      writeFile(join(bin, "sleep"), nodeShebang + "setTimeout(() => {}, 20);\n", { mode: 0o755 }),
      writeFile(
        join(bin, "node"),
        nodeShebang +
          `import fs from 'node:fs';
const root = process.env.RUNNER_TEMP;
if (process.argv[2] !== 'scripts/native-e2e.mjs' || process.argv[3] !== 'android-real') {
  console.error('unexpected journey invocation:', process.argv.slice(2));
  process.exit(8);
}
fs.writeFileSync(root + '/journey.json', JSON.stringify({
  cwd: process.cwd(),
  args: process.argv.slice(2),
  serial: process.env.ANDROID_SERIAL,
}));
`,
        { mode: 0o755 },
      ),
    ]);

    const run = (env) =>
      spawnSync("bash", [join(temporary, "scripts", "ci-android-device.sh")], {
        cwd: temporary,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          RUNNER_TEMP: join(temporary, "evidence"),
          GITHUB_STEP_SUMMARY: join(temporary, "evidence", "summary"),
          ANDROID_SERIAL: "PXE0FIXTURE",
          ...env,
        },
        encoding: "utf8",
        timeout: 30_000,
      });

    // Missing serial fails before touching any device.
    const missing = run({ ANDROID_SERIAL: "" });
    assert.equal(missing.status, 1, missing.stdout + missing.stderr);
    assert.match(missing.stderr, /ANDROID_SERIAL is required/);

    // An unresponsive serial fails at get-state.
    const offline = run({ FAILURE_STAGE: "offline" });
    assert.equal(offline.status, 1, offline.stdout + offline.stderr);
    assert.match(offline.stderr, /not an attached, responsive device/);

    // Below the maintained floor fails without installing anything.
    const old = run({ FAKE_SDK: "33" });
    assert.equal(old.status, 1, old.stdout + old.stderr);
    assert.match(old.stderr, /requires API >= 34/);
    await assert.rejects(readFile(join(temporary, "evidence", "journey.json")), { code: "ENOENT" });

    // A device at the floor passes the gates and hands off with the serial
    // still exported for adb and Gradle. The journey path is repo-root
    // relative: the script has `cd ..`-ed out of android/ at that point.
    await mkdir(join(temporary, "evidence"), { recursive: true });
    const good = run({});
    assert.equal(good.status, 0, good.stdout + good.stderr);
    const journey = JSON.parse(await readFile(join(temporary, "evidence", "journey.json"), "utf8"));
    assert.equal(journey.cwd, temporary);
    assert.deepEqual(journey.args, ["scripts/native-e2e.mjs", "android-real"]);
    assert.equal(journey.serial, "PXE0FIXTURE");
    assert.match(
      await readFile(join(temporary, "evidence", "summary"), "utf8"),
      /PXE0FIXTURE \(API 34\)/,
    );
    assert.match(
      await readFile(join(temporary, "evidence", "android-device-launch.txt"), "utf8"),
      /Status: ok/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
