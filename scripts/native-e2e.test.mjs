import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import {
  collectForwardPorts,
  hasInstalledAndroidPackage,
  IOS_UI_MAX_RUN_DIRS,
  IOS_UI_SIMULATOR_NAME,
  rewriteLoopbackUrlHost,
  selectFixedIosSimulator,
  selectIosTestDestination,
  selectPrunableIosRunDirs,
  startLoopbackForwarders,
  waitForAndroidFrameworkServices,
} from "./native-e2e.mjs";

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
