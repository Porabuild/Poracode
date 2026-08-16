import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_ID,
  NativeReloadQueue,
  allChangedPathsHaveExtension,
  androidInstallArguments,
  assertIosSimulatorSigning,
  childEnvironment,
  exactToolVersion,
  graphicalAvdProcessId,
  iosSimulatorBuildArguments,
  javaMajorVersion,
  loopbackPortFromPairingUrl,
  nativeDevWatchEnabled,
  optionalPairingUrl,
  parseAdbDevices,
  processListHasHeadlessAvd,
  selectIosSimulator,
} from "./native-dev-lib.mjs";
import {
  INJECTION_NEXT_SHA256,
  INJECTION_NEXT_VERSION,
  injectionNextPaths,
} from "./native-hot-ios.mjs";

await test("requires exact native toolchain versions", () => {
  assert.equal(APP_ID, "com.lightcodeapp.mobile");
  assert.equal(exactToolVersion("Xcode 26.6\nBuild version 17G86", "Xcode", "26.6"), "26.6");
  assert.throws(() => exactToolVersion("Xcode 26.5", "Xcode", "26.6"), /26\.6 is required/);
  assert.equal(javaMajorVersion('openjdk version "21.0.8" 2025-07-15'), 21);
  assert.equal(javaMajorVersion('java version "1.8.0_402"'), 8);
});

await test("selects only an available iOS 26.5 simulator", () => {
  const list = {
    devices: {
      "com.apple.CoreSimulator.SimRuntime.iOS-26-4": [
        { name: "iPhone 17", udid: "old", state: "Booted", isAvailable: true },
      ],
      "com.apple.CoreSimulator.SimRuntime.iOS-26-5": [
        { name: "iPhone 17 Pro", udid: "booted", state: "Booted", isAvailable: true },
        { name: "iPhone 17", udid: "preferred", state: "Shutdown", isAvailable: true },
      ],
    },
  };
  assert.equal(selectIosSimulator(list)?.udid, "booted");
  assert.equal(selectIosSimulator(list, "preferred")?.udid, "preferred");
  assert.throws(() => selectIosSimulator(list, "old"), /iOS 26\.5 simulator/);
});

await test("keeps simulator signing enabled so native credential storage is available", () => {
  const args = iosSimulatorBuildArguments({
    simulatorId: "simulator-id",
    derivedDataPath: "/tmp/poracode-derived-data",
  });

  assert.ok(args.includes("build"));
  assert.ok(args.includes("-quiet"));
  assert.ok(args.includes("platform=iOS Simulator,id=simulator-id"));
  assert.ok(!args.some((argument) => argument.startsWith("CODE_SIGNING_ALLOWED=")));

  const hotArgs = iosSimulatorBuildArguments({
    simulatorId: "simulator-id",
    derivedDataPath: "/tmp/poracode-derived-data",
    hotReload: true,
  });
  assert.ok(hotArgs.includes("OTHER_LDFLAGS=$(inherited) -Xlinker -interposable"));
  assert.ok(hotArgs.includes("OTHER_SWIFT_FLAGS=$(inherited) -D PORACODE_NATIVE_HOT_RELOAD_V1"));
  assert.ok(hotArgs.includes("EMIT_FRONTEND_COMMAND_LINES=YES"));
  assert.ok(hotArgs.includes("COMPILATION_CACHE_ENABLE_CACHING=NO"));

  assert.doesNotThrow(() =>
    assertIosSimulatorSigning(
      "Executable=/tmp/App.app/App\nIdentifier=com.lightcodeapp.mobile\nSignature=adhoc",
      "FAKETEAMID.com.lightcodeapp.mobile",
    ),
  );
  assert.throws(
    () => assertIosSimulatorSigning("Identifier=App", ""),
    /not signed with the expected identifier/,
  );
});

await test("pins and isolates the iOS hot-patch runtime", () => {
  assert.equal(INJECTION_NEXT_VERSION, "2.0.1");
  assert.match(INJECTION_NEXT_SHA256, /^[a-f0-9]{64}$/);
  const paths = injectionNextPaths("/workspace");
  assert.equal(
    paths.app,
    "/workspace/.tmp/native-hot-reload/ios/injection-next-2.0.1/InjectionNext.app",
  );
  assert.equal(paths.bundle, `${paths.app}/Contents/Resources/iOSInjection.bundle`);
  assert.equal(allChangedPathsHaveExtension(["A.swift", "B.swift"], ".swift"), true);
  assert.equal(allChangedPathsHaveExtension(["A.swift", "Info.plist"], ".swift"), false);
  assert.equal(allChangedPathsHaveExtension([], ".swift"), false);
});

await test("watches by default and retains an explicit one-shot mode", () => {
  assert.equal(nativeDevWatchEnabled([]), true);
  assert.equal(nativeDevWatchEnabled(["--once"]), false);
  assert.equal(nativeDevWatchEnabled(["--", "--once"]), false);
  assert.throws(() => nativeDevWatchEnabled(["--watch"]), /optional --once/);

  const androidArgs = androidInstallArguments();
  assert.deepEqual(androidArgs, ["--console=plain", ":app:installDebug"]);
  assert.ok(!androidArgs.includes("--no-daemon"));
});

await test("serializes native reloads and collapses changes received during a build", async () => {
  const batches = [];
  let markStarted;
  let finishFirst;
  const firstStarted = new Promise((resolve) => {
    markStarted = resolve;
  });
  const firstGate = new Promise((resolve) => {
    finishFirst = resolve;
  });
  const queue = new NativeReloadQueue({
    debounceMs: 60_000,
    reload: async (paths) => {
      batches.push(paths);
      if (batches.length === 1) {
        markStarted();
        await firstGate;
      }
    },
    onError: (error) => {
      throw error;
    },
  });

  queue.enqueue("b.swift");
  queue.enqueue("a.swift");
  const running = queue.flushNow();
  await firstStarted;
  queue.enqueue("c.swift");
  queue.enqueue("c.swift");
  finishFirst();
  await running;
  await queue.close();

  assert.deepEqual(batches, [["a.swift", "b.swift"], ["c.swift"]]);
});

await test("parses only online adb devices", () => {
  const output = [
    "List of devices attached",
    "emulator-5554 device product:sdk_gphone model:Pixel",
    "phone offline transport_id:2",
    "pending unauthorized transport_id:3",
    "",
  ].join("\n");
  assert.deepEqual(parseAdbDevices(output), ["emulator-5554"]);
});

await test("recognizes a headless emulator process for one exact AVD", () => {
  const processes = [
    "/sdk/qemu-system-aarch64-headless -avd poracode-pixel9-api37 -no-window",
    "/sdk/qemu-system-aarch64 -avd another-api37",
  ].join("\n");
  assert.equal(processListHasHeadlessAvd(processes, "poracode-pixel9-api37"), true);
  assert.equal(processListHasHeadlessAvd(processes, "another-api37"), false);
  assert.equal(
    processListHasHeadlessAvd(
      "C:\\sdk\\qemu-system-x86_64-headless.exe -avd=windows-api37",
      "windows-api37",
    ),
    true,
  );
  assert.equal(
    graphicalAvdProcessId(
      "123 /sdk/qemu-system-aarch64 -avd poracode-pixel9-api37 -no-snapshot-save",
      "poracode-pixel9-api37",
    ),
    123,
  );
  assert.equal(
    graphicalAvdProcessId(
      "124 /sdk/qemu-system-aarch64-headless -avd poracode-pixel9-api37 -no-window",
      "poracode-pixel9-api37",
    ),
    null,
  );
});

await test("accepts supported E2E pairing links without leaking them to children", () => {
  const pairingUrl = "poracode://pair?host=http%3A%2F%2F127.0.0.1%3A49152&token=top-secret";
  assert.equal(optionalPairingUrl({ PORACODE_NATIVE_E2E_PAIRING_URL: pairingUrl }), pairingUrl);
  assert.equal(loopbackPortFromPairingUrl(pairingUrl), 49152);
  assert.throws(
    () => optionalPairingUrl({ PORACODE_NATIVE_E2E_PAIRING_URL: "https://example.com/pair" }),
    /supported Poracode pairing/,
  );

  const env = childEnvironment({
    PATH: "/bin",
    NATIVE_E2E_CONTROL_CAPABILITY: "control-secret",
    PORACODE_NATIVE_E2E_PAIRING_URL: pairingUrl,
    PORACODE_PAIRING_URL: pairingUrl,
  });
  assert.deepEqual(env, { PATH: "/bin" });
});
