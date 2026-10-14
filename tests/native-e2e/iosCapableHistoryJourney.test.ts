import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { capableHistoryJourneyError } from "./helpers/androidCapableHistoryHost.ts";
import { findRepoRoot } from "./harness/paths.ts";
import {
  IOS_CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_ENV,
  IOS_CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_SHA_ENV,
  IOS_CAPABLE_HISTORY_JOURNEY_IOS_SOURCE_SHA_ENV,
  IOS_CAPABLE_HISTORY_JOURNEY_SIMULATOR_NAME_ENV,
  IOS_CAPABLE_HISTORY_JOURNEY_SIMULATOR_UDID_ENV,
  IOS_CAPABLE_HISTORY_DEFAULT_PORT,
  RECOMMENDED_IOS_CAPABLE_HISTORY_SIMULATOR_NAME,
  journeyGateEnabled,
  resolveIosCapableHistoryJourneyInputs,
} from "./helpers/iosCapableHistoryJourney.ts";
import {
  PINNED_IOS_SIMULATOR_RUNTIME,
  SHARED_MOCK_SIMULATOR_NAME,
  assertIosSimulatorOwnership,
  defaultIosSimctlTarget,
  ensureIosSimulatorBooted,
  parseIosInfoPlistBundleIdentifier,
  parseIosSimulatorDeviceList,
  readIosAppBundleIdentifier,
  readIosInstalledAppState,
  readIosSimulatorIdentity,
  uninstallIosAppForFreshProfile,
  type IosCommandRunner,
  type IosSimulatorIdentity,
} from "./helpers/iosCapableHistorySimulator.ts";
import {
  absolutizeIosXctestRoots,
  appBundlePathFor,
  exportXcresultAttachments,
  extractIosJourneyMarkers,
  hashDirectoryTree,
  injectIosXctestEnvironment,
  iosSourceTreeSha256,
  locateGeneratedXctestrun,
  readXcresultSummary,
  xcresulttoolTarget,
} from "./helpers/iosCapableHistoryXcode.ts";

/**
 * Focused checks for the capable-history iOS journey components that need no
 * simulator and no Xcode build: the owned-device gate, the fresh-profile
 * uninstall gate, the xctestrun environment injection, the deterministic
 * source/bundle hashing, the marker transport, the xcresult reads, and the
 * gated end-to-end runner (which only executes with an explicitly supplied
 * frozen artifact, owned simulator and source pin).
 */

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ios-capable-history-checks-"));
  tempDirs.push(dir);
  return dir;
}

function identity(overrides: Partial<IosSimulatorIdentity> = {}): IosSimulatorIdentity {
  return {
    udid: "11111111-2222-3333-4444-555555555555",
    name: RECOMMENDED_IOS_CAPABLE_HISTORY_SIMULATOR_NAME,
    state: "Shutdown",
    isAvailable: true,
    deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-17",
    runtimeIdentifier: PINNED_IOS_SIMULATOR_RUNTIME,
    dataPath: "/Users/operator/Library/Developer/CoreSimulator/Devices/1111/data",
    lastBootedAt: null,
    ...overrides,
  };
}

function simulatorListJson(devices: unknown[]): string {
  return JSON.stringify({ devices: { [PINNED_IOS_SIMULATOR_RUNTIME]: devices } });
}

function commandResult(code: number, stdout = "", stderr = "") {
  return { code, stdout, stderr };
}

describe("ios capable-history simulator device list", () => {
  it("flattens runtimes and preserves identity fields", () => {
    const parsed = parseIosSimulatorDeviceList(
      JSON.stringify({
        devices: {
          [PINNED_IOS_SIMULATOR_RUNTIME]: [
            {
              udid: "A",
              name: RECOMMENDED_IOS_CAPABLE_HISTORY_SIMULATOR_NAME,
              state: "Booted",
              isAvailable: true,
              deviceTypeIdentifier: "com.apple.CoreSimulator.SimDeviceType.iPhone-17",
              dataPath: "/tmp/A",
              lastBootedAt: "2026-09-21T00:00:00Z",
            },
            { udid: "B", name: "Broken", state: "Shutdown" },
          ],
          "com.apple.CoreSimulator.SimRuntime.iOS-27-0": [{ udid: "C", name: "Next" }],
        },
      }),
    );
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toMatchObject({
      udid: "A",
      state: "Booted",
      isAvailable: true,
      runtimeIdentifier: PINNED_IOS_SIMULATOR_RUNTIME,
    });
    expect(parsed[1]).toMatchObject({
      udid: "B",
      isAvailable: false,
      runtimeIdentifier: PINNED_IOS_SIMULATOR_RUNTIME,
    });
    expect(parsed[2]).toMatchObject({
      udid: "C",
      runtimeIdentifier: "com.apple.CoreSimulator.SimRuntime.iOS-27-0",
    });
  });

  it("refuses unreadable or shapeless lists", () => {
    expect(() => parseIosSimulatorDeviceList("not json")).toThrow(/simulator-list-unreadable/);
    expect(() => parseIosSimulatorDeviceList("{}")).toThrow(/simulator-list-unreadable/);
  });

  it("finds the explicit UDID and fails closed when absent", async () => {
    const run: IosCommandRunner = async () =>
      commandResult(0, simulatorListJson([{ ...identity(), state: "Booted" }]));
    const found = await readIosSimulatorIdentity({
      target: defaultIosSimctlTarget(),
      udid: identity().udid,
      run,
    });
    expect(found.udid).toBe(identity().udid);
    await expect(
      readIosSimulatorIdentity({ target: defaultIosSimctlTarget(), udid: "missing", run }),
    ).rejects.toThrow(/simulator-not-found/);
    await expect(
      readIosSimulatorIdentity({ target: defaultIosSimctlTarget(), udid: "  ", run }),
    ).rejects.toThrow(/simulator-udid-required/);
  });
});

describe("ios capable-history owned-device gate", () => {
  function assertOwned(candidate: IosSimulatorIdentity): void {
    assertIosSimulatorOwnership({
      identity: candidate,
      expectedName: RECOMMENDED_IOS_CAPABLE_HISTORY_SIMULATOR_NAME,
      expectedRuntime: PINNED_IOS_SIMULATOR_RUNTIME,
    });
  }

  it("accepts only the explicitly named available simulator on the pinned runtime", () => {
    expect(() => assertOwned(identity())).not.toThrow();
  });

  it("refuses the shared mock simulator name, a foreign name, a foreign runtime and unavailable devices", () => {
    expect(() =>
      assertIosSimulatorOwnership({
        identity: identity({ name: SHARED_MOCK_SIMULATOR_NAME }),
        expectedName: SHARED_MOCK_SIMULATOR_NAME,
        expectedRuntime: PINNED_IOS_SIMULATOR_RUNTIME,
      }),
    ).toThrow(/device-not-owned:.*shared mock-journey simulator/);
    expect(() => assertOwned(identity({ name: "iPhone 17" }))).toThrow(
      /named "iPhone 17", expected/,
    );
    expect(() =>
      assertOwned(identity({ runtimeIdentifier: "com.apple.CoreSimulator.SimRuntime.iOS-25-0" })),
    ).toThrow(/runs com\.apple\.CoreSimulator\.SimRuntime\.iOS-25-0, expected/);
    expect(() => assertOwned(identity({ isAvailable: false }))).toThrow(/is unavailable/);
  });
});

describe("ios capable-history headless boot", () => {
  it("does not boot an already-booted simulator and never opens Simulator.app", async () => {
    const calls: string[][] = [];
    const run: IosCommandRunner = async (_command, args) => {
      calls.push([...args]);
      return commandResult(0, "ok");
    };
    const evidence = await ensureIosSimulatorBooted({
      target: defaultIosSimctlTarget(),
      identity: identity({ state: "Booted" }),
      run,
    });
    expect(evidence.bootedByRunner).toBe(false);
    expect(evidence.bootOutput).toBeNull();
    expect(calls).toEqual([["simctl", "bootstatus", identity().udid, "-b"]]);
  });

  it("boots and waits for bootstatus on a shutdown simulator", async () => {
    const calls: string[][] = [];
    const run: IosCommandRunner = async (_command, args) => {
      calls.push([...args]);
      return commandResult(0, "ok");
    };
    const evidence = await ensureIosSimulatorBooted({
      target: defaultIosSimctlTarget(),
      identity: identity(),
      run,
    });
    expect(evidence.bootedByRunner).toBe(true);
    expect(calls).toEqual([
      ["simctl", "boot", identity().udid],
      ["simctl", "bootstatus", identity().udid, "-b"],
    ]);
  });

  it("fails closed on a failed boot and on an unusable state", async () => {
    const failingBoot: IosCommandRunner = async (_command, args) =>
      args.includes("boot") ? commandResult(1, "", "nope") : commandResult(0, "ok");
    await expect(
      ensureIosSimulatorBooted({
        target: defaultIosSimctlTarget(),
        identity: identity(),
        run: failingBoot,
      }),
    ).rejects.toThrow(/simulator-boot-failed/);
    await expect(
      ensureIosSimulatorBooted({
        target: defaultIosSimctlTarget(),
        identity: identity({ state: "ShuttingDown" }),
        run: failingBoot,
      }),
    ).rejects.toThrow(/simulator-state-unusable/);
  });
});

describe("ios capable-history fresh owned profile", () => {
  it("treats a non-zero get_app_container as a fresh profile and skips uninstall", async () => {
    const calls: string[][] = [];
    const run: IosCommandRunner = async (_command, args) => {
      calls.push([...args]);
      return commandResult(1, "", "No such application");
    };
    const state = await readIosInstalledAppState({
      target: defaultIosSimctlTarget(),
      udid: identity().udid,
      bundleId: "com.lightcodeapp.mobile",
      run,
    });
    expect(state.installed).toBe(false);
    const evidence = await uninstallIosAppForFreshProfile({
      target: defaultIosSimctlTarget(),
      udid: identity().udid,
      bundleId: "com.lightcodeapp.mobile",
      run,
    });
    expect(evidence).toMatchObject({ skipped: true, installedBefore: false, success: true });
    expect(calls.every((args) => args.includes("get_app_container"))).toBe(true);
  });

  it("uninstalls exactly the canonical bundle id and requires exit 0", async () => {
    const calls: string[][] = [];
    const run: IosCommandRunner = async (_command, args) => {
      calls.push([...args]);
      return args.includes("get_app_container")
        ? commandResult(0, "/container/path")
        : commandResult(0, "");
    };
    const evidence = await uninstallIosAppForFreshProfile({
      target: defaultIosSimctlTarget(),
      udid: identity().udid,
      bundleId: "com.lightcodeapp.mobile",
      run,
    });
    expect(evidence).toMatchObject({ skipped: false, installedBefore: true, success: true });
    expect(calls).toContainEqual([
      "simctl",
      "uninstall",
      identity().udid,
      "com.lightcodeapp.mobile",
    ]);

    const failing: IosCommandRunner = async (_command, args) =>
      args.includes("get_app_container")
        ? commandResult(0, "/container/path")
        : commandResult(1, "", "busy");
    const failed = await uninstallIosAppForFreshProfile({
      target: defaultIosSimctlTarget(),
      udid: identity().udid,
      bundleId: "com.lightcodeapp.mobile",
      run: failing,
    });
    expect(failed.success).toBe(false);
  });
});

describe("ios capable-history built app identity", () => {
  it("parses the bundle identifier from an XML Info.plist", () => {
    expect(
      parseIosInfoPlistBundleIdentifier(
        "<plist><dict><key>CFBundleIdentifier</key><string>com.lightcodeapp.mobile</string></dict></plist>",
      ),
    ).toBe("com.lightcodeapp.mobile");
    expect(parseIosInfoPlistBundleIdentifier("<plist><dict/></plist>")).toBeNull();
  });

  it("reads the identifier from a real bundle file", async () => {
    const dir = tempDir();
    const bundle = join(dir, "App.app");
    mkdirSync(bundle, { recursive: true });
    writeFileSync(
      join(bundle, "Info.plist"),
      "<plist><dict><key>CFBundleIdentifier</key><string>com.lightcodeapp.mobile</string></dict></plist>",
    );
    await expect(readIosAppBundleIdentifier({ appBundlePath: bundle })).resolves.toBe(
      "com.lightcodeapp.mobile",
    );
    await expect(
      readIosAppBundleIdentifier({ appBundlePath: join(dir, "Missing.app") }),
    ).rejects.toThrow(/app-bundle-unreadable/);
  });
});

describe("ios capable-history xctestrun environment injection", () => {
  const generated = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<plist version="1.0">',
    "<dict>",
    "\t<key>TestConfigurations</key>",
    "\t<array>",
    "\t\t<dict>",
    "\t\t\t<key>TestTargets</key>",
    "\t\t\t<array>",
    "\t\t\t\t<dict>",
    "\t\t\t\t\t<key>BlueprintName</key>",
    "\t\t\t\t\t<string>NativeE2ETests</string>",
    "\t\t\t\t\t<key>EnvironmentVariables</key>",
    "\t\t\t\t\t<dict>",
    "\t\t\t\t\t\t<key>Existing</key>",
    "\t\t\t\t\t\t<string>kept</string>",
    "\t\t\t\t\t</dict>",
    "\t\t\t\t\t<key>ParallelizationEnabled</key>",
    "\t\t\t\t\t<true/>",
    "\t\t\t\t</dict>",
    "\t\t\t</array>",
    "\t\t</dict>",
    "\t</array>",
    "</dict>",
    "</plist>",
  ].join("\n");

  it("inserts runner values into the NativeE2ETests blueprint and disables parallelization", () => {
    const injected = injectIosXctestEnvironment(generated, {
      IOS_CAPABLE_HISTORY_RUN_ID: "run-1",
      IOS_CAPABLE_HISTORY_USER_MARKER: "[chj-prefix-user]",
      IOS_CAPABLE_HISTORY_ACK_IDENTIFIER: "a&b<c>\"d'e",
    });
    expect(injected).toContain("<key>IOS_CAPABLE_HISTORY_RUN_ID</key>");
    expect(injected).toContain("<string>[chj-prefix-user]</string>");
    expect(injected).toContain("<string>a&amp;b&lt;c&gt;&quot;d&apos;e</string>");
    expect(injected).toContain("<key>Existing</key>");
    expect(injected).toContain("<string>kept</string>");
    expect(injected).not.toContain("<true/>");
    expect(injected).toContain("<key>ParallelizationEnabled</key>");
  });

  it("refuses a plist without the NativeE2ETests blueprint", () => {
    expect(() => injectIosXctestEnvironment("<plist><dict/></plist>", {})).toThrow(
      /xctestrun-blueprint-missing/,
    );
  });

  it("absolutizes the file-relative roots so the injected copy resolves products outside its directory", () => {
    const plist =
      "<plist><string>__TESTROOT__/Debug-iphonesimulator/App.app</string>" +
      "<string>__DERIVEDDATA__/Build/ProfileData</string></plist>";
    const fixed = absolutizeIosXctestRoots(plist, {
      productsDir: "/derived/Build/Products",
      derivedDataPath: "/derived",
    });
    expect(fixed).toContain("/derived/Build/Products/Debug-iphonesimulator/App.app");
    expect(fixed).toContain("/derived/Build/ProfileData");
    expect(fixed).not.toContain("__TESTROOT__");
    expect(fixed.match(/\/derived/g)).toHaveLength(2);
    expect(() =>
      absolutizeIosXctestRoots("<plist/>", { productsDir: "/p", derivedDataPath: "/d" }),
    ).toThrow(/xctestrun-testroot-missing/);
  });

  it("locates exactly one generated xctestrun and ignores the readiness copy", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "App_iphonesimulator26.5-arm64.xctestrun"), "<plist/>");
    writeFileSync(join(dir, "NativeE2E-readiness.xctestrun"), "<plist/>");
    expect(locateGeneratedXctestrun(dir)).toBe(
      join(dir, "App_iphonesimulator26.5-arm64.xctestrun"),
    );
    writeFileSync(join(dir, "Second.xctestrun"), "<plist/>");
    expect(() => locateGeneratedXctestrun(dir)).toThrow(/xctestrun-not-unique/);
  });

  it("requires the built Debug-iphonesimulator app bundle", () => {
    const dir = tempDir();
    const expected = join(dir, "Debug-iphonesimulator", "App.app");
    mkdirSync(expected, { recursive: true });
    expect(appBundlePathFor(dir)).toBe(expected);
    expect(() => appBundlePathFor(join(dir, "missing"))).toThrow(/app-bundle-missing/);
  });
});

describe("ios capable-history deterministic hashing", () => {
  it("hashes a tree independent of insertion order and sensitive to content and layout", () => {
    const dir = tempDir();
    mkdirSync(join(dir, "a"), { recursive: true });
    mkdirSync(join(dir, "b"), { recursive: true });
    writeFileSync(join(dir, "a", "one.txt"), "one");
    writeFileSync(join(dir, "b", "two.txt"), "two");
    const first = hashDirectoryTree(dir);
    const second = hashDirectoryTree(dir);
    expect(first.sha256).toBe(second.sha256);
    expect(first.fileCount).toBe(2);

    writeFileSync(join(dir, "a", "one.txt"), "changed");
    const changed = hashDirectoryTree(dir);
    expect(changed.sha256).not.toBe(first.sha256);

    rmSync(join(dir, "a", "one.txt"));
    writeFileSync(join(dir, "x"), "one");
    expect(hashDirectoryTree(dir).sha256).not.toBe(changed.sha256);
  });

  it("pins the iOS source roots and refuses a missing root", () => {
    const root = tempDir();
    mkdirSync(join(root, "ios/App/App"), { recursive: true });
    mkdirSync(join(root, "ios/App/App.xcodeproj"), { recursive: true });
    writeFileSync(join(root, "ios/App/App/App.swift"), "// app");
    writeFileSync(join(root, "ios/App/App.xcodeproj/project.pbxproj"), "// pbx");
    const hashed = iosSourceTreeSha256(root, ["ios/App/App", "ios/App/App.xcodeproj"]);
    expect(hashed.fileCount).toBe(2);
    expect(hashed.sha256).toMatch(/^[0-9a-f]{64}$/);
    writeFileSync(join(root, "ios/App/App/App.swift"), "// app changed");
    expect(iosSourceTreeSha256(root, ["ios/App/App", "ios/App/App.xcodeproj"]).sha256).not.toBe(
      hashed.sha256,
    );
    expect(() => iosSourceTreeSha256(root, ["ios/App/NativeE2ETests"])).toThrow(
      /ios-source-root-missing/,
    );
  });
});

describe("ios capable-history marker transport", () => {
  it("reports present and missing phase markers", () => {
    const result = extractIosJourneyMarkers(
      "noise IOS_CAPABLE_HISTORY_UI_FRESH_PAIR noise IOS_CAPABLE_HISTORY_UI_ACK_TAPPED",
      [
        "IOS_CAPABLE_HISTORY_UI_FRESH_PAIR",
        "IOS_CAPABLE_HISTORY_UI_ACK_TAPPED",
        "IOS_CAPABLE_HISTORY_UI_LIVE_VISIBLE",
      ],
    );
    expect(result.present).toEqual([
      "IOS_CAPABLE_HISTORY_UI_FRESH_PAIR",
      "IOS_CAPABLE_HISTORY_UI_ACK_TAPPED",
    ]);
    expect(result.missing).toEqual(["IOS_CAPABLE_HISTORY_UI_LIVE_VISIBLE"]);
  });
});

describe("ios capable-history xcresult reads", () => {
  it("summarizes a passed result bundle and surfaces failures", async () => {
    const passed: IosCommandRunner = async (_command, args) => {
      expect(args).toEqual([
        "xcresulttool",
        "get",
        "test-results",
        "summary",
        "--path",
        "/bundle.xcresult",
      ]);
      return commandResult(
        0,
        JSON.stringify({
          result: "Passed",
          passedTests: 1,
          failedTests: 0,
          skippedTests: 0,
        }),
      );
    };
    const summary = await readXcresultSummary({
      target: xcresulttoolTarget(),
      resultBundlePath: "/bundle.xcresult",
      run: passed,
    });
    expect(summary.ok).toBe(true);
    expect(summary.passedTests).toBe(1);

    const failed: IosCommandRunner = async () =>
      commandResult(0, JSON.stringify({ result: "Failed", failedTests: 1 }));
    expect(
      (
        await readXcresultSummary({
          target: xcresulttoolTarget(),
          resultBundlePath: "/bundle.xcresult",
          run: failed,
        })
      ).ok,
    ).toBe(false);

    const broken: IosCommandRunner = async () => commandResult(1, "", "boom");
    const brokenSummary = await readXcresultSummary({
      target: xcresulttoolTarget(),
      resultBundlePath: "/bundle.xcresult",
      run: broken,
    });
    expect(brokenSummary.ok).toBe(false);
    expect(brokenSummary.error).toMatch(/exited 1/);
  });

  it("exports attachments with hashes", async () => {
    const outDir = join(tempDir(), "attachments");
    mkdirSync(outDir, { recursive: true });
    const run: IosCommandRunner = async (_command, args) => {
      expect(args.slice(0, 3)).toEqual(["xcresulttool", "export", "attachments"]);
      writeFileSync(join(outDir, "01-fresh-pair.png"), "png-bytes");
      return commandResult(0, "");
    };
    const exported = await exportXcresultAttachments({
      target: xcresulttoolTarget(),
      resultBundlePath: "/bundle.xcresult",
      outDir,
      run,
    });
    expect(exported.error).toBeNull();
    expect(exported.files).toEqual([join(outDir, "01-fresh-pair.png")]);
    expect(exported.hashes["01-fresh-pair.png"]).toBe(
      createHash("sha256").update("png-bytes").digest("hex"),
    );
  });
});

describe("ios capable-history journey ownership inputs", () => {
  function artifactEnv(): Record<string, string> {
    const dir = tempDir();
    const entrypoint = join(dir, "server.cjs");
    writeFileSync(entrypoint, "// fixture server\n");
    writeFileSync(join(dir, "supervisor.cjs"), "// fixture supervisor\n");
    return {
      [IOS_CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_ENV]: entrypoint,
      [IOS_CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_SHA_ENV]: createHash("sha256")
        .update("// fixture server\n")
        .digest("hex"),
    };
  }

  it("requires the frozen artifact, the source pin, and the explicit dedicated simulator", () => {
    expect(() => resolveIosCapableHistoryJourneyInputs({}, findRepoRoot())).toThrow(
      /capable-history-journey:entrypoint-required/,
    );
    expect(() =>
      resolveIosCapableHistoryJourneyInputs(
        {
          [IOS_CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_ENV]: join(
            findRepoRoot(),
            "dist/main/server.cjs",
          ),
          [IOS_CAPABLE_HISTORY_JOURNEY_ENTRYPOINT_SHA_ENV]: "c".repeat(64),
        },
        findRepoRoot(),
      ),
    ).toThrow(/entrypoint-root-dist-refused/);

    const base = artifactEnv();
    expect(() => resolveIosCapableHistoryJourneyInputs(base, findRepoRoot())).toThrow(
      /simulator-udid-required/,
    );
    expect(() =>
      resolveIosCapableHistoryJourneyInputs(
        { ...base, [IOS_CAPABLE_HISTORY_JOURNEY_SIMULATOR_UDID_ENV]: identity().udid },
        findRepoRoot(),
      ),
    ).toThrow(/simulator-name-required/);
    expect(() =>
      resolveIosCapableHistoryJourneyInputs(
        {
          ...base,
          [IOS_CAPABLE_HISTORY_JOURNEY_SIMULATOR_UDID_ENV]: identity().udid,
          [IOS_CAPABLE_HISTORY_JOURNEY_SIMULATOR_NAME_ENV]:
            RECOMMENDED_IOS_CAPABLE_HISTORY_SIMULATOR_NAME,
        },
        findRepoRoot(),
      ),
    ).toThrow(/capable-history-journey:sha256-required/);
    expect(() =>
      resolveIosCapableHistoryJourneyInputs(
        {
          ...base,
          [IOS_CAPABLE_HISTORY_JOURNEY_SIMULATOR_UDID_ENV]: identity().udid,
          [IOS_CAPABLE_HISTORY_JOURNEY_SIMULATOR_NAME_ENV]:
            RECOMMENDED_IOS_CAPABLE_HISTORY_SIMULATOR_NAME,
          [IOS_CAPABLE_HISTORY_JOURNEY_IOS_SOURCE_SHA_ENV]: "not-a-hash",
        },
        findRepoRoot(),
      ),
    ).toThrow(/capable-history-journey:sha256-required/);
  });

  it("resolves the documented defaults for a fully owned setup", () => {
    const inputs = resolveIosCapableHistoryJourneyInputs(
      {
        ...artifactEnv(),
        [IOS_CAPABLE_HISTORY_JOURNEY_SIMULATOR_UDID_ENV]: identity().udid,
        [IOS_CAPABLE_HISTORY_JOURNEY_SIMULATOR_NAME_ENV]:
          RECOMMENDED_IOS_CAPABLE_HISTORY_SIMULATOR_NAME,
        [IOS_CAPABLE_HISTORY_JOURNEY_IOS_SOURCE_SHA_ENV]: "d".repeat(64),
      },
      findRepoRoot(),
    );
    expect(inputs.port).toBe(IOS_CAPABLE_HISTORY_DEFAULT_PORT);
    expect(inputs.simulatorRuntime).toBe(PINNED_IOS_SIMULATOR_RUNTIME);
    expect(inputs.simctl).toEqual(defaultIosSimctlTarget());
    expect(inputs.outDir).toBe(join(findRepoRoot(), "tmp/v2-production/ios-capable-journey"));
    expect(inputs.derivedDataPath).toBe(
      join(findRepoRoot(), ".tmp/native-e2e/ios-capable-history-derived-data"),
    );
  });

  it("keeps the journey error taxonomy stable and gated", () => {
    expect(journeyGateEnabled({})).toBe(false);
    expect(journeyGateEnabled({ IOS_CAPABLE_HISTORY_JOURNEY: "1" })).toBe(true);
    expect(capableHistoryJourneyError("demo", "detail").message).toBe(
      "capable-history-journey:demo: detail",
    );
  });
});

/**
 * The end-to-end journey. It only runs when `IOS_CAPABLE_HISTORY_JOURNEY=1`
 * and the explicit artifact/source/simulator env are supplied; see
 * `tmp/v2-production/ios-capable-journey-preparation.md`.
 */
describe.skipIf(!journeyGateEnabled())("capable-host iOS capable-history journey", () => {
  it("runs the reused seed and the integrated XCUITest journey against the supplied artifact", async () => {
    const { runIosCapableHistoryJourney } = await import("./helpers/iosCapableHistoryJourney.ts");
    const inputs = resolveIosCapableHistoryJourneyInputs();
    const result = await runIosCapableHistoryJourney(inputs, { testTimeoutMs: 900_000 });
    expect(result.provenancePath).toContain("provenance.json");
  }, 1_800_000);
});
