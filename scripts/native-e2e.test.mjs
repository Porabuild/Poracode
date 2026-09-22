import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasInstalledAndroidPackage,
  IOS_UI_MAX_RUN_DIRS,
  IOS_UI_SIMULATOR_NAME,
  selectFixedIosSimulator,
  selectPrunableIosRunDirs,
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
