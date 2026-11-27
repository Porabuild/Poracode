import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  assertIosHidTarget,
  collectForwardPorts,
  hasInstalledAndroidPackage,
  IOS_HID_ENV,
  IOS_UI_MAX_RUN_DIRS,
  IOS_UI_SIMULATOR_NAME,
  rewriteLoopbackUrlHost,
  selectFixedIosSimulator,
  selectIosTestDestination,
  selectPrunableIosRunDirs,
  startLoopbackForwarders,
  waitForAndroidFrameworkServices,
  watchIosHarnessExit,
} from "./native-e2e.mjs";
import {
  parseIosUiShard,
  parseCompiledTestIdentifiers,
  planIosUiShard,
} from "./ios-ui-test-shards.mjs";

// Small inline fixtures shaped exactly like `xcodebuild -enumerate-tests`
// flat JSON. They are intentionally unsorted, mix identifiers with and without
// a trailing `()`, and carry one disabled entry that must be ignored. No tracked
// test reads a local (gitignored) inventory file, so these pass on a fresh CI
// checkout; the real 149-case inventory is checked by a separate local command.
const COMPILED_FIXTURE = {
  errors: [],
  values: [
    {
      enabledTests: [
        { identifier: "NativeE2ETests/NativeFamilyJourneyUITests/testZulu()" },
        { identifier: "NativeE2ETests/NativeFamilyJourneyUITests/testAlpha" },
        {
          identifier:
            "NativeE2ETests/NativeBackgroundTaskUITests/testBackgroundTaskDetailsJourney()",
        },
        { identifier: "NativeE2ETests/NativeFamilyJourneyUITests/testMike()" },
        { identifier: "NativeE2ETests/NativeJourneyUITests/testRealNativeRemoteJourney" },
        { identifier: "NativeE2ETests/NativeFamilyJourneyUITests/testBravo" },
        { identifier: "NativeE2ETests/NativeFamilyJourneyUITests/testEcho()" },
      ],
      disabledTests: [
        {
          identifier:
            "NativeE2ETests/NativeCapableHistoryJourneyUITests/testCapableHistoryVisibleRecovery()",
        },
      ],
      testPlan: "App",
    },
  ],
};

function simctlList(entries) {
  const devices = {};
  for (const [runtime, list] of Object.entries(entries)) devices[runtime] = list;
  return { devices };
}

const iOS265 = "com.apple.CoreSimulator.SimRuntime.iOS-26-5";
const iOS175 = "com.apple.CoreSimulator.SimRuntime.iOS-17-5";

void test("ios-ui reuses one fixed simulator by name on the required runtime", () => {
  const list = simctlList({
    [iOS265]: [
      { udid: "newer", name: "iPhone 17", state: "Shutdown", isAvailable: true },
      { udid: "fixed-shutdown", name: IOS_UI_SIMULATOR_NAME, state: "Shutdown", isAvailable: true },
      { udid: "unavailable", name: IOS_UI_SIMULATOR_NAME, state: "Shutdown", isAvailable: false },
    ],
    [iOS175]: [{ udid: "old-runtime", name: IOS_UI_SIMULATOR_NAME, state: "Shutdown" }],
  });
  const picked = selectFixedIosSimulator(list);
  assert.equal(picked.udid, "fixed-shutdown");
});

void test("ios-ui prefers the booted fixed simulator", () => {
  const list = simctlList({
    [iOS265]: [
      { udid: "shutdown-one", name: IOS_UI_SIMULATOR_NAME, state: "Shutdown", isAvailable: true },
      { udid: "booted-one", name: IOS_UI_SIMULATOR_NAME, state: "Booted", isAvailable: true },
    ],
  });
  assert.equal(selectFixedIosSimulator(list).udid, "booted-one");
});

void test("ios-ui reports no fixed simulator so the caller creates it once", () => {
  assert.equal(selectFixedIosSimulator(simctlList({ [iOS265]: [] })), null);
  assert.equal(selectFixedIosSimulator({}), null);
  assert.equal(
    selectFixedIosSimulator(simctlList({ [iOS175]: [{ udid: "x", name: IOS_UI_SIMULATOR_NAME }] })),
    null,
    "A different runtime must not satisfy the fixed-device contract",
  );
});

void test("run-dir pruning keeps the newest runs and never touches derived data", () => {
  const names = [
    "ios-ui-derived-data-0",
    "ios-ui-derived-data-1",
    "ios-ui-100-1",
    "ios-ui-500-5",
    "ios-ui-400-4",
    "ios-ui-300-3",
    "ios-ui-200-2",
    "random-dir",
    "ios-ui-not-a-run-dir",
  ];
  const prunable = selectPrunableIosRunDirs(names, 3);
  assert.deepEqual(prunable, ["ios-ui-200-2", "ios-ui-100-1"]);
  // Default retention matches the constant the runner uses.
  assert.deepEqual(
    selectPrunableIosRunDirs([
      "ios-ui-1-1",
      "ios-ui-2-2",
      "ios-ui-3-3",
      "ios-ui-4-4",
      "ios-ui-5-5",
      "ios-ui-6-6",
    ]),
    selectPrunableIosRunDirs(
      ["ios-ui-1-1", "ios-ui-2-2", "ios-ui-3-3", "ios-ui-4-4", "ios-ui-5-5", "ios-ui-6-6"],
      IOS_UI_MAX_RUN_DIRS,
    ),
  );
  // With at most `keep` runs there is nothing to prune.
  assert.deepEqual(selectPrunableIosRunDirs(["ios-ui-9-9", "ios-ui-8-8"]), []);
});

void test("android installed-package detection accepts only package-manager paths", () => {
  assert.equal(hasInstalledAndroidPackage("package:/data/app/poracode/base.apk\n"), true);
  assert.equal(hasInstalledAndroidPackage("Failed\n"), false);
  assert.equal(hasInstalledAndroidPackage(""), false);
});

void test("android framework readiness uses direct adb commands and retries", async () => {
  const calls = [];
  let failures = 1;
  await waitForAndroidFrameworkServices(
    async (command, args) => {
      calls.push([command, args]);
      if (failures > 0) {
        failures -= 1;
        throw new Error("not ready");
      }
      return "ok";
    },
    { attempts: 2, delayMs: 0, sleep: async () => {} },
  );
  assert.deepEqual(calls, [
    ["adb", ["shell", "pm", "path", "android"]],
    ["adb", ["shell", "pm", "path", "android"]],
    ["adb", ["shell", "am", "get-current-user"]],
  ]);
});

void test("ios target selector builds the CoreDevice destination for a physical UDID", () => {
  for (const udid of [
    "0123456789abcdef0123456789abcdef01234567",
    "12345678-90AB-cdEF-1234-567890ABCDEF",
  ]) {
    const target = selectIosTestDestination({ physicalUdid: `  ${udid}  ` });
    assert.deepEqual(target, {
      destination: `platform=iOS,id=${udid}`,
      physical: true,
    });
  }
});

void test("ios target selector keeps the simulator destination for the fixed simulator", () => {
  assert.deepEqual(selectIosTestDestination({ simulatorUdid: "sim-udid" }), {
    destination: "platform=iOS Simulator,id=sim-udid",
    physical: false,
  });
});

void test("ios target selector rejects non-UDID physical targets and an empty selection", () => {
  for (const bad of ["iPhone 15", "not a udid", "12345", "zzzz"]) {
    assert.throws(() => selectIosTestDestination({ physicalUdid: bad }), /must be a device UDID/);
  }
  assert.throws(() => selectIosTestDestination({}), /needs a simulator or a physical device/);
  assert.throws(() => selectIosTestDestination({ physicalUdid: "", simulatorUdid: "" }));
});

void test("loopback rewrite rewrites only the loopback host and preserves everything else", () => {
  const host = "192.168.1.20";
  assert.equal(
    rewriteLoopbackUrlHost("http://127.0.0.1:49160/#token=lc_pair_abc", host),
    "http://192.168.1.20:49160/#token=lc_pair_abc",
  );
  assert.equal(
    rewriteLoopbackUrlHost("http://localhost:49153/v1/state?x=1&y=2#t=ok", host),
    "http://192.168.1.20:49153/v1/state?x=1&y=2#t=ok",
  );
  // Hostname comparison is case-insensitive; the path stays exact.
  assert.equal(
    rewriteLoopbackUrlHost("http://LOCALHOST:8443/a/b/c", host),
    "http://192.168.1.20:8443/a/b/c",
  );
});

void test("loopback rewrite leaves non-loopback, non-http, and unparseable URLs untouched", () => {
  const host = "192.168.1.20";
  assert.equal(
    rewriteLoopbackUrlHost("http://10.0.2.2:49160/#token=x", host),
    "http://10.0.2.2:49160/#token=x",
  );
  assert.equal(
    rewriteLoopbackUrlHost("http://[::1]:49160/#token=x", host),
    "http://[::1]:49160/#token=x",
    "Only 127.0.0.1/localhost are rewritten; IPv6 loopback is out of contract",
  );
  assert.equal(
    rewriteLoopbackUrlHost("ws://127.0.0.1:49160/socket", host),
    "ws://127.0.0.1:49160/socket",
  );
  assert.equal(rewriteLoopbackUrlHost("http://127.0.0.1:1/#t=1", ""), "http://127.0.0.1:1/#t=1");
  assert.equal(rewriteLoopbackUrlHost("http://127.0.0.1:1/#t=1", "   "), "http://127.0.0.1:1/#t=1");
  assert.equal(rewriteLoopbackUrlHost("::not-a-url::", host), "::not-a-url::");
});

void test("loopback rewrite rejects a device host that cannot serve as a hostname", () => {
  assert.throws(
    () => rewriteLoopbackUrlHost("http://127.0.0.1:49160/#token=x", "fe80::1"),
    /not a usable host/,
  );
});

void test("forward ports are the unique dialable ports of the harness URLs", () => {
  assert.deepEqual(
    collectForwardPorts(["http://127.0.0.1:49153/", "http://127.0.0.1:49160/#token=x"]),
    [49153, 49160],
  );
  assert.deepEqual(
    collectForwardPorts(["http://127.0.0.1:49153/", "http://localhost:49153/x"]),
    [49153],
  );
  assert.deepEqual(collectForwardPorts([undefined, "", "::bad::"]), []);
});

void test("test-only forwarder proxies to loopback and cleans up its listener", async (t) => {
  const harness = createServer((_request, response) => {
    response.end("harness-ok");
  });
  await new Promise((resolve) => harness.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    harness.closeAllConnections();
    return new Promise((resolve) => harness.close(resolve));
  });
  const harnessPort = harness.address().port;

  // The raw factory with an explicit target: a distinct listener port
  // proxying into the loopback harness port.
  const { createLoopbackForwarder } = await import("./native-e2e.mjs");
  const forwarder = createLoopbackForwarder({
    listenHost: "127.0.0.1",
    port: 0,
    targetHost: "127.0.0.1",
    targetPort: harnessPort,
  });
  await forwarder.listening;
  const response = await fetch(`http://127.0.0.1:${forwarder.port}/`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "harness-ok");
  await forwarder.close();
  await assert.rejects(
    fetch(`http://127.0.0.1:${forwarder.port}/`),
    undefined,
    "the explicit-target forwarder must be gone after close()",
  );
});

void test("forwarder keeps the same-port cross-interface production semantic when the OS allows it", async (t) => {
  const harness = createServer((_request, response) => {
    response.end("same-port-ok");
  });
  await new Promise((resolve) => harness.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    harness.closeAllConnections();
    return new Promise((resolve) => harness.close(resolve));
  });
  const port = harness.address().port;

  // The device-path semantic: same port, device-reachable address (127.0.0.2
  // is loopback on Linux CI) proxying to 127.0.0.1. Some environments
  // (macOS out of the box) refuse secondary loopback addresses; skip there.
  let forwarders;
  try {
    forwarders = await startLoopbackForwarders({ listenHost: "127.0.0.2", ports: [port] });
  } catch (error) {
    t.skip(`this environment does not bind secondary loopback addresses: ${error.message}`);
    return;
  }
  const response = await fetch(`http://127.0.0.2:${port}/`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "same-port-ok");
  await forwarders.close();
  await assert.rejects(
    fetch(`http://127.0.0.2:${port}/`),
    undefined,
    "the forwarder listener must be gone after close()",
  );
});

void test("forwarder startup fails closed when a port cannot bind", async () => {
  const blocker = createServer();
  await new Promise((resolve) => blocker.listen(0, "127.0.0.1", resolve));
  try {
    await assert.rejects(
      startLoopbackForwarders({ listenHost: "127.0.0.1", ports: [blocker.address().port] }),
      /could not listen/,
    );
  } finally {
    await new Promise((resolve) => blocker.close(resolve));
  }
});

void test("watchIosHarnessExit rejects startup fast when the harness exits early", () => {
  const harness = new EventEmitter();
  const rejected = [];
  const killed = [];
  const state = watchIosHarnessExit({
    harness,
    isReady: () => false,
    isDone: () => false,
    rejectReady: (error) => rejected.push(error),
    killChildren: (signal) => killed.push(signal),
  });
  // Synchronous reaction to the process `exit` event: no polling, sleep, or
  // retry; a startup failure never touches the (not yet started) XCTest child.
  harness.emit("exit", 7, null);
  assert.equal(state.harnessDied, false);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].message, /harness exited early \(7\)/);
  assert.deepEqual(killed, []);
});

void test("watchIosHarnessExit rejects readiness on a child spawn error", () => {
  const harness = new EventEmitter();
  const rejected = [];
  const killed = [];
  const state = watchIosHarnessExit({
    harness,
    isReady: () => false,
    isDone: () => false,
    rejectReady: (error) => rejected.push(error),
    killChildren: (signal) => killed.push(signal),
  });
  // A failed spawn emits `error` and never `exit`. EventEmitter throws an
  // unhandled `error` when no listener exists, so this also proves one is
  // installed; readiness must reject without stopping any XCTest child.
  assert.ok(harness.listenerCount("error") > 0);
  assert.doesNotThrow(() => harness.emit("error", new Error("spawn ENOENT")));
  assert.equal(state.harnessDied, false);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].message, /failed to spawn: spawn ENOENT/);
  assert.deepEqual(killed, []);
});

void test("watchIosHarnessExit stops the owned XCTest when the harness dies mid-suite", () => {
  const harness = new EventEmitter();
  const rejected = [];
  const killed = [];
  const state = watchIosHarnessExit({
    harness,
    isReady: () => true,
    isDone: () => false,
    rejectReady: (error) => rejected.push(error),
    killChildren: (signal) => killed.push(signal),
  });
  harness.emit("exit", 1, "SIGTERM");
  assert.equal(state.harnessDied, true);
  assert.deepEqual(killed, ["SIGTERM"], "the owned XCTest child must be stopped promptly");
  assert.deepEqual(rejected, [], "readiness already resolved; do not reject it");
});

void test("watchIosHarnessExit ignores exits once XCTest has finished", () => {
  const harness = new EventEmitter();
  const rejected = [];
  const killed = [];
  const state = watchIosHarnessExit({
    harness,
    isReady: () => true,
    isDone: () => true,
    rejectReady: (error) => rejected.push(error),
    killChildren: (signal) => killed.push(signal),
  });
  // The journey's own finally kills the detached harness on success; that
  // expected exit must not look like a mid-suite failure or kill cleanup.
  harness.emit("exit", 0, "SIGTERM");
  assert.equal(state.harnessDied, false);
  assert.deepEqual(rejected, []);
  assert.deepEqual(killed, []);
});

void test("ios-ui builds for testing before spawning the wire-lab harness", async () => {
  const source = await readFile(new URL("./native-e2e.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function runIosUIJourney(");
  const end = source.indexOf("async function pruneIosUIRunDirs(", start);
  assert.ok(start >= 0 && end > start, "the ios-ui journey source must be locatable");
  const journey = source.slice(start, end);
  const buildIndex = journey.indexOf('"build-for-testing"');
  const harnessIndex = journey.indexOf("harness = spawn(");
  // The enumeration leg also ends in test-without-building (before the harness);
  // the last one is the actual XCTest run that must start with a live harness.
  const xctestIndex = journey.lastIndexOf('"test-without-building"');
  assert.ok(buildIndex >= 0 && harnessIndex >= 0 && xctestIndex >= 0);
  assert.ok(
    buildIndex < harnessIndex,
    "build-for-testing must finish before the harness is spawned, so its bounded test budget is not consumed by a cold compile",
  );
  assert.ok(harnessIndex < xctestIndex, "the harness must still be alive before XCTest starts");
});

void test("ios mock runner names the primary fixture host for NativeFamily journeys", async () => {
  const [runner, cli] = await Promise.all([
    readFile(new URL("./native-e2e.mjs", import.meta.url), "utf8"),
    readFile(new URL("../tests/native-e2e/harness/cli.ts", import.meta.url), "utf8"),
  ]);
  // The CLI accepts an optional primary label and forwards it to the mock
  // WireLab's `label` only when present, leaving the default name unchanged.
  assert.match(cli, /args\.get\("lab-label"\)/u);
  // No env fallback: ios-ui sends an explicit --lab-label; CLI default stays.
  assert.doesNotMatch(cli, /NATIVE_E2E_LAB_LABEL/u);
  assert.match(cli, /options\.labLabel \? \{ label: options\.labLabel \} : \{\}/u);
  // Only the built-in iOS mock runner passes the override, gated on mock mode.
  assert.match(runner, /harnessMode === "mock"[\s\S]{0,120}"--lab-label",\s*"Navigation Host A"/u);
  // The generic mock/real supervisor in main() never labels the lab.
  const supervisorEnd = runner.indexOf("export function selectFixedIosSimulator");
  assert.doesNotMatch(runner.slice(0, supervisorEnd), /--lab-label/u);
});

void test("ios-ui shard env parses strictly as one-based index/count (null when omitted)", () => {
  assert.equal(parseIosUiShard(undefined), null);
  assert.equal(parseIosUiShard(""), null);
  assert.equal(parseIosUiShard("   "), null);
  assert.deepEqual(parseIosUiShard("1/4"), { index: 1, count: 4 });
  assert.deepEqual(parseIosUiShard("4/4"), { index: 4, count: 4 });
  assert.deepEqual(parseIosUiShard(" 2/4 "), { index: 2, count: 4 });
  for (const bad of [
    "0/4",
    "5/4",
    "1/0",
    "1",
    "1/",
    "/4",
    "1/4/5",
    "-1/4",
    "1.5/4",
    "abc",
    "one/two",
    "1/4x",
  ]) {
    assert.throws(
      () => parseIosUiShard(bad),
      /index\/count|1 <= index <= count/u,
      `must reject ${bad}`,
    );
  }
});

void test("compiled iOS inventory normalizes and sorts enabled leaf IDs and ignores disabledTests", () => {
  const ids = parseCompiledTestIdentifiers(COMPILED_FIXTURE);
  assert.equal(ids.length, 7);
  assert.equal(new Set(ids).size, 7);
  for (const id of ids) {
    assert.ok(id.startsWith("NativeE2ETests/"));
    assert.ok(!id.endsWith("()"), `trailing () must be stripped from ${id}`);
    assert.equal(id.split("/").length, 3, `must be target/class/method: ${id}`);
  }
  // disabledTests are ignored entirely.
  assert.ok(
    !ids.includes(
      "NativeE2ETests/NativeCapableHistoryJourneyUITests/testCapableHistoryVisibleRecovery",
    ),
  );
  // Unsorted input (with and without a trailing `()`) becomes a deterministic,
  // sorted, normalized list of leaf method selectors.
  assert.deepEqual(ids, [...ids].sort());
  assert.deepEqual(ids, [
    "NativeE2ETests/NativeBackgroundTaskUITests/testBackgroundTaskDetailsJourney",
    "NativeE2ETests/NativeFamilyJourneyUITests/testAlpha",
    "NativeE2ETests/NativeFamilyJourneyUITests/testBravo",
    "NativeE2ETests/NativeFamilyJourneyUITests/testEcho",
    "NativeE2ETests/NativeFamilyJourneyUITests/testMike",
    "NativeE2ETests/NativeFamilyJourneyUITests/testZulu",
    "NativeE2ETests/NativeJourneyUITests/testRealNativeRemoteJourney",
  ]);
});

void test("six shards are disjoint and exhaustive over the compiled inventory", () => {
  const all = parseCompiledTestIdentifiers(COMPILED_FIXTURE);
  const shards = [1, 2, 3, 4, 5, 6].map((index) =>
    planIosUiShard(COMPILED_FIXTURE, { index, count: 6 }),
  );
  for (const shard of shards) {
    assert.equal(shard.totalIdentifiers, all.length);
    assert.ok(shard.assignedIdentifiers.length > 0);
  }
  const union = shards.flatMap((shard) => shard.assignedIdentifiers);
  assert.equal(union.length, all.length, "every compiled case is assigned exactly once");
  assert.equal(new Set(union).size, all.length, "no case is assigned to two shards");
  assert.deepEqual(new Set(union), new Set(all));
  // Round-robin by sorted position: (i % count) === index - 1.
  for (let index = 1; index <= 6; index += 1) {
    const expected = all.filter((_id, position) => position % 6 === index - 1);
    assert.deepEqual(shards[index - 1].assignedIdentifiers, expected);
  }
});

void test("shard discovery rejects absent, malformed, error-bearing, and empty inventories", () => {
  const goodValue = {
    enabledTests: [{ identifier: "NativeE2ETests/Class/testA()" }],
    disabledTests: [],
    testPlan: "App",
  };
  assert.throws(() => parseCompiledTestIdentifiers("not json"), /not valid JSON/u);
  assert.throws(() => parseCompiledTestIdentifiers(undefined), /missing or is not/u);
  assert.throws(
    () => parseCompiledTestIdentifiers({ values: [goodValue] }),
    /missing its errors array/u,
  );
  assert.throws(
    () => parseCompiledTestIdentifiers({ errors: ["boom"], values: [goodValue] }),
    /enumeration error/u,
  );
  assert.throws(
    () => parseCompiledTestIdentifiers({ errors: [], values: [] }),
    /missing its values array/u,
  );
  assert.throws(
    () => parseCompiledTestIdentifiers({ errors: [], values: [{}] }),
    /missing its enabledTests array/u,
  );
  assert.throws(
    () => parseCompiledTestIdentifiers({ errors: [], values: [{ enabledTests: [] }] }),
    /no enabled tests/u,
  );
  assert.throws(
    () =>
      parseCompiledTestIdentifiers({
        errors: [],
        values: [{ enabledTests: [{ identifier: "" }] }],
      }),
    /non-string or empty/u,
  );
  assert.throws(
    () =>
      parseCompiledTestIdentifiers({
        errors: [],
        values: [{ enabledTests: [{ identifier: "()" }] }],
      }),
    /empty normalized/u,
  );
  // A disabled-only inventory still rejects (disabledTests are never counted).
  assert.throws(
    () =>
      parseCompiledTestIdentifiers({
        errors: [],
        values: [{ enabledTests: [], disabledTests: [{ identifier: "X/Y/z()" }] }],
      }),
    /no enabled tests/u,
  );
});

void test("shard discovery rejects duplicate normalized identifiers", () => {
  const base = { errors: [], values: [{ enabledTests: [] }] };
  base.values[0].enabledTests = [
    { identifier: "NativeE2ETests/Class/testA()" },
    { identifier: "NativeE2ETests/Class/testA()" },
  ];
  assert.throws(() => parseCompiledTestIdentifiers(base), /duplicate normalized identifier/u);
  // Two raw identifiers that normalize to the same selector also collide.
  base.values[0].enabledTests = [
    { identifier: "NativeE2ETests/Class/testB()" },
    { identifier: "NativeE2ETests/Class/testB" },
  ];
  assert.throws(() => parseCompiledTestIdentifiers(base), /duplicate normalized identifier/u);
});

void test("shard planning rejects a zero selection and an invalid config", () => {
  // A valid config whose slice matches no test (count > total) is rejected.
  assert.throws(
    () => planIosUiShard(COMPILED_FIXTURE, { index: 8, count: 8 }),
    /selected no tests/u,
  );
  for (const bad of [
    null,
    { index: 0, count: 4 },
    { index: 5, count: 4 },
    { index: 1, count: 0 },
  ]) {
    assert.throws(() => planIosUiShard(COMPILED_FIXTURE, bad), /one-based/u);
  }
});

void test("shard discovery rejects class-only and malformed selectors that would widen a shard", () => {
  const inventory = (identifier) => ({
    errors: [],
    values: [{ enabledTests: [{ identifier }], disabledTests: [], testPlan: "App" }],
  });
  for (const bad of [
    "NativeE2ETests/NativeFamilyJourneyUITests", // class-only: would widen a shard
    "NativeE2ETests/NativeFamilyJourneyUITests/testMethod/extra", // four components
    "NativeE2ETests/NativeFamilyJourneyUITests/", // empty method
    "NativeE2ETests//testMethod", // empty class
    "NativeE2ETests/NativeFamilyJourneyUITests/test Method", // whitespace
    "NativeE2ETests/NativeFamilyJourneyUITests/test(M)ethod", // parentheses
  ]) {
    assert.throws(
      () => parseCompiledTestIdentifiers(inventory(bad)),
      /malformed test identifier/u,
      `must reject ${bad}`,
    );
  }
});

void test("ios-ui enumerates the compiled inventory and runs shard flags around the harness", async () => {
  const source = await readFile(new URL("./native-e2e.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function runIosUIJourney(");
  const end = source.indexOf("async function pruneIosUIRunDirs(", start);
  const journey = source.slice(start, end);
  // The shard selector is parsed before any simctl/xcodebuild tool is spawned.
  const parseIndex = journey.indexOf("parseIosUiShard(process.env[IOS_UI_SHARD_ENV])");
  assert.ok(parseIndex >= 0);
  assert.ok(parseIndex < journey.indexOf('"xcrun"'), "shard parse precedes the first tool");
  // Enumeration of the ORIGINAL xctestrun finishes before the wire-lab starts.
  const enumerateIndex = journey.indexOf('"-enumerate-tests"');
  const harnessIndex = journey.indexOf("harness = spawn(");
  assert.ok(enumerateIndex >= 0 && enumerateIndex < harnessIndex);
  assert.ok(journey.indexOf('"test-without-building"') < harnessIndex);
  assert.match(journey, /-test-enumeration-format/u);
  assert.match(journey, /-test-enumeration-output-path/u);
  assert.match(journey, /compiled-tests\.json/u);
  assert.match(
    journey,
    /join\(products, generatedName\)/u,
    "enumeration uses the original xctestrun",
  );
  assert.match(
    journey,
    /name !== IOS_UI_READINESS_XCTESTRUN/u,
    "the generated-xctestrun lookup excludes a stale injected readiness runner",
  );
  assert.match(journey, /planIosUiShard\(/u);
  assert.match(journey, /shard-selection\.json/u);
  assert.match(journey, /shardTestingFlags = shardPlan\.assignedIdentifiers\.map/u);
  // The actual XCTest step uses only the shard flags (no union with broad selectors).
  assert.match(journey, /const onlyTestingFlags = shardTestingFlags \?\? iosOnlyTestingFlags\(\)/u);
  const finalTest = journey.slice(
    journey.lastIndexOf('"test-without-building"') - 400,
    journey.lastIndexOf('"test-without-building"'),
  );
  assert.match(finalTest, /\.\.\.onlyTestingFlags/u);
  assert.doesNotMatch(finalTest, /\.\.\.iosOnlyTestingFlags\(\)/u);
  // Build and enumeration still use the broad selector override (unsharded path).
  assert.match(journey, /iosOnlyTestingFlags\(\),\s*"build-for-testing"/u);
});

void test("iOS HID opt-in is mock-simulator-only and rejects physical/real combos", () => {
  // Off by default: an unset flag changes nothing, even for a physical or
  // real-peer journey (CI never sets it).
  assert.doesNotThrow(() => assertIosHidTarget({ hid: false, physicalUdid: "", peerMode: "mock" }));
  assert.doesNotThrow(() =>
    assertIosHidTarget({
      hid: false,
      physicalUdid: "00000000-0000-0000-0000-000000000000",
      peerMode: "real",
    }),
  );
  // The one valid opt-in: mock peer + fixed simulator (no physical UDID).
  assert.doesNotThrow(() => assertIosHidTarget({ hid: true, physicalUdid: "", peerMode: "mock" }));
  // A physical CoreDevice target has no simulator HID channel.
  assert.throws(
    () =>
      assertIosHidTarget({
        hid: true,
        physicalUdid: "00000000-0000-0000-0000-000000000000",
        peerMode: "mock",
      }),
    /requires the mock simulator journey/u,
  );
  // The real-peer production host has no simulator at all.
  assert.throws(
    () => assertIosHidTarget({ hid: true, physicalUdid: "", peerMode: "real" }),
    /requires the mock harness/u,
  );
  assert.equal(IOS_HID_ENV, "NATIVE_E2E_IOS_HID");
});

void test("ios-ui HID opt-in is gated early, passed to the mock harness, and injected into XCTest", async () => {
  const source = await readFile(new URL("./native-e2e.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function runIosUIJourney(");
  const end = source.indexOf("async function pruneIosUIRunDirs(", start);
  const journey = source.slice(start, end);
  // The flag is read from the dedicated env constant, not a default value.
  assert.match(journey, /process\.env\[IOS_HID_ENV\] === "1"/u);
  // Validation runs before every simctl/xcodebuild/harness process.
  const validateIndex = journey.indexOf("assertIosHidTarget({");
  assert.ok(validateIndex >= 0, "the HID target assertion must be present in the journey");
  assert.ok(validateIndex < journey.indexOf('"xcrun"'), "validation precedes simctl");
  assert.ok(validateIndex < journey.indexOf("harness = spawn("), "validation precedes the harness");
  // Only the dedicated mock harness child receives the actual fixed simulator UDID.
  assert.match(
    journey,
    /\.\.\.\(iosHid && harnessMode === "mock" \? \["--ios-hid-udid", simulatorId\] : \[\]\)/u,
  );
  // The generic mock/real supervisor never carries the HID flag.
  assert.doesNotMatch(source.slice(0, start), /--ios-hid-udid/u);
  // XCTest runners see the flag only when the operator opted in; no default key.
  assert.match(journey, /\.\.\.\(iosHid \? \{ NATIVE_E2E_IOS_HID: "1" \} : \{\}\)/u);
});

void test("ios-ui HID opt-in owns one private socket root after build/enumeration, passed only to the harness", async () => {
  const source = await readFile(new URL("./native-e2e.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function runIosUIJourney(");
  const end = source.indexOf("async function pruneIosUIRunDirs(", start);
  const journey = source.slice(start, end);

  // Exactly one owned mkdtemp, created after build + enumeration, before the
  // harness spawn, and only for the opt-in (the default journey is unchanged).
  assert.equal((journey.match(/mkdtemp\(/gu) ?? []).length, 1);
  const mkdtempIndex = journey.indexOf('mkdtemp(join(tmpdir(), "pora-hid-"))');
  assert.ok(mkdtempIndex >= 0);
  assert.ok(mkdtempIndex > journey.indexOf('"build-for-testing"'));
  assert.ok(mkdtempIndex > journey.indexOf('"-enumerate-tests"'));
  assert.ok(mkdtempIndex < journey.indexOf("harness = spawn("));
  assert.match(journey, /if \(iosHid\) \{\s*hidSocketRoot = await mkdtemp/u);

  // The exact socket-root env name is set in the harness spawn env only, via a
  // conditional spread, and never in the XCTest app environment.
  const spawnIndex = journey.indexOf("harness = spawn(");
  const spawnEnd = journey.indexOf("let controlUrl;", spawnIndex);
  const harnessSpawn = journey.slice(spawnIndex, spawnEnd);
  assert.match(harnessSpawn, /NATIVE_E2E_IOS_HID_SOCKET_ROOT/u);
  assert.match(
    harnessSpawn,
    /\.\.\.\(iosHid \? \{ NATIVE_E2E_IOS_HID_SOCKET_ROOT: hidSocketRoot \} : \{\}\)/u,
  );
  const injectIndex = journey.indexOf("injectXCTestEnvironment(generated");
  const injectEnd = journey.indexOf("await chmod(readinessPath", injectIndex);
  const xctestEnv = journey.slice(injectIndex, injectEnd);
  assert.doesNotMatch(xctestEnv, /NATIVE_E2E_IOS_HID_SOCKET_ROOT/u);
  // The test app still sees only the boolean opt-in flag (unchanged).
  assert.match(xctestEnv, /\.\.\.\(iosHid \? \{ NATIVE_E2E_IOS_HID: "1" \} : \{\}\)/u);
  // No module-global socket/simulator state: the owner is local to the journey.
  assert.doesNotMatch(source.slice(0, start), /hidSocketRoot|pora-hid-/u);
});

void test("ios-ui HID socket root has one idempotent owner cleaned on the finally and both signal finishes", async () => {
  const source = await readFile(new URL("./native-e2e.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function runIosUIJourney(");
  const end = source.indexOf("async function pruneIosUIRunDirs(", start);
  const journey = source.slice(start, end);

  // One data owner: a single shared helper with an idempotency guard, a bounded
  // synchronous removal, and best-effort semantics (never throws, never awaits).
  assert.equal((journey.match(/const cleanupHidSocketRoot = /gu) ?? []).length, 1);
  assert.match(
    journey,
    /const cleanupHidSocketRoot = \(\) => \{\s*if \(!hidSocketRoot\) return;\s*const root = hidSocketRoot;\s*hidSocketRoot = null;/u,
  );
  assert.match(
    journey,
    /try \{\s*rmSync\(root, \{ recursive: true, force: true \}\);\s*\} catch \{/u,
  );
  assert.doesNotMatch(journey, /await cleanupHidSocketRoot/u);

  // Shared by the normal finally and BOTH signal finish paths: three calls.
  assert.equal((journey.match(/cleanupHidSocketRoot\(\)/gu) ?? []).length, 3);
  const finallyIndex = journey.lastIndexOf("} finally {");
  assert.ok(finallyIndex > 0);
  assert.match(journey.slice(finallyIndex), /cleanupHidSocketRoot\(\);/u);

  // Both signal finish paths attempt the owned cleanup immediately before exit;
  // the harness group still gets SIGTERM then SIGKILL, bounded by the timer.
  const shutdownStart = journey.indexOf("registerShutdown(");
  const shutdownEnd = journey.indexOf("try {", shutdownStart);
  const shutdown = journey.slice(shutdownStart, shutdownEnd);
  assert.equal(
    (shutdown.match(/cleanupHidSocketRoot\(\);\s*process\.exit\(code\)/gu) ?? []).length,
    2,
  );
  assert.match(shutdown, /killHarnessGroup\("SIGTERM"\)/u);
  assert.match(shutdown, /killHarnessGroup\("SIGKILL"\)/u);
  assert.match(
    shutdown,
    /harness\.once\("exit", \(\) => \{\s*clearTimeout\(killer\);\s*killTrackedChildren\("SIGKILL"\);/u,
  );
  assert.match(shutdown, /setTimeout\([\s\S]*?SHUTDOWN_WAIT_MS\)/u);
});
