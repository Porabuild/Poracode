#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_ID,
  BOOT_TIMEOUT_MS,
  BUILD_TIMEOUT_MS,
  CommandSupervisor,
  allChangedPathsHaveExtension,
  assertIosSimulatorSigning,
  childEnvironment,
  exactToolVersion,
  iosSimulatorBuildArguments,
  nativeDevWatchEnabled,
  optionalPairingUrl,
  selectIosSimulator,
  watchNativeSources,
} from "./native-dev-lib.mjs";
import {
  prepareIosHotReload,
  recordIosCompilerActivity,
  startIosHotReload,
  waitForIosHotPatch,
} from "./native-hot-ios.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const iosRoot = join(repoRoot, "ios", "App");
const derivedData = join(repoRoot, ".tmp", "native-dev", "ios", "DerivedData");
const appPath = join(derivedData, "Build", "Products", "Debug-iphonesimulator", "App.app");
const simulatedEntitlementsPath = join(
  derivedData,
  "Build",
  "Intermediates.noindex",
  "App.build",
  "Debug-iphonesimulator",
  "App.build",
  "App.app-Simulated.xcent",
);
const supervisor = new CommandSupervisor();
supervisor.installSignalHandlers();
let _sourceWatcher;

async function capture(command, args, label) {
  const result = await supervisor.run(command, args, { capture: true, label, quiet: true });
  return `${result.stdout}\n${result.stderr}`.trim();
}

async function main() {
  if (process.platform !== "darwin") throw new Error("iOS native development requires macOS");
  const watchEnabled = nativeDevWatchEnabled(process.argv.slice(2));
  const pairingUrl = optionalPairingUrl();
  const hotReload = watchEnabled ? await prepareIosHotReload({ repoRoot, supervisor }) : null;
  let hotReloadStarted = false;

  exactToolVersion(await capture("xcodebuild", ["-version"], "checking Xcode"), "Xcode", "26.6");
  const sdkVersion = await capture(
    "xcrun",
    ["--sdk", "iphonesimulator", "--show-sdk-version"],
    "checking the iOS Simulator SDK",
  );
  if (sdkVersion !== "26.5") {
    throw new Error(`iOS Simulator SDK 26.5 is required; found ${sdkVersion || "unknown"}`);
  }

  const rawDevices = await capture(
    "xcrun",
    ["simctl", "list", "devices", "available", "--json"],
    "listing iOS simulators",
  );
  let deviceList;
  try {
    deviceList = JSON.parse(rawDevices);
  } catch {
    throw new Error("simctl returned an invalid simulator list");
  }
  const simulator = selectIosSimulator(deviceList, process.env.PORACODE_IOS_TARGET?.trim());
  if (!simulator)
    throw new Error("no available iPhone simulator has the required iOS 26.5 runtime");

  process.stdout.write(`[native-ios] simulator: ${simulator.name} (${simulator.udid})\n`);
  const bootedByRunner = simulator.state !== "Booted";

  const deploy = async ({ initial }) => {
    const buildOutput = await supervisor.run(
      "xcodebuild",
      iosSimulatorBuildArguments({
        simulatorId: simulator.udid,
        derivedDataPath: derivedData,
        hotReload: hotReload !== null,
      }),
      {
        capture: hotReload !== null,
        captureLimit: 64 * 1024 * 1024,
        cwd: iosRoot,
        label: initial
          ? "Building the native iOS app"
          : "Incrementally rebuilding the native iOS app",
        timeoutMs: BUILD_TIMEOUT_MS,
      },
    );
    const buildLogPath = hotReload
      ? await recordIosCompilerActivity({
          derivedDataPath: derivedData,
          stderr: buildOutput.stderr,
          stdout: buildOutput.stdout,
        })
      : null;
    if (initial && hotReload && !hotReloadStarted) {
      await startIosHotReload({
        buildLogPath,
        iosRoot,
        paths: hotReload,
        repoRoot,
        supervisor,
      });
      hotReloadStarted = true;
    }
    const signatureDetails = await capture(
      "/usr/bin/codesign",
      ["-dvv", appPath],
      "checking the native iOS app signature",
    );
    const applicationIdentifier = await capture(
      "/usr/bin/plutil",
      ["-extract", "application-identifier", "raw", simulatedEntitlementsPath],
      "checking the native iOS app entitlements",
    );
    assertIosSimulatorSigning(signatureDetails, applicationIdentifier);
    await supervisor.run("xcrun", ["simctl", "install", simulator.udid, appPath], {
      label: initial ? "Installing the native iOS app" : "Installing the iOS reload",
    });
    await supervisor.run(
      "xcrun",
      ["simctl", "launch", "--terminate-running-process", simulator.udid, APP_ID],
      {
        env: hotReload
          ? childEnvironment(process.env, {
              SIMCTL_CHILD_PORACODE_INJECTION_BUNDLE_PATH: hotReload.bundle,
            })
          : childEnvironment(),
        label: initial ? "Launching the native iOS app" : "Reloading the native iOS app",
      },
    );

    if (initial && pairingUrl) {
      process.stdout.write("[native-ios] opening the E2E pairing link from the environment\n");
      await supervisor.run("xcrun", ["simctl", "openurl", simulator.udid, pairingUrl], {
        env: childEnvironment(),
        label: "Opening the E2E pairing link",
        quiet: true,
        capture: true,
      });
    }
  };

  try {
    if (bootedByRunner) {
      await supervisor.run("xcrun", ["simctl", "boot", simulator.udid], {
        label: "Booting the iOS 26.5 simulator",
      });
    }
    await supervisor.run("xcrun", ["simctl", "bootstatus", simulator.udid, "-b"], {
      label: "Waiting for the iOS simulator",
      timeoutMs: BOOT_TIMEOUT_MS,
    });

    await mkdir(derivedData, { recursive: true });
    await deploy({ initial: true });
    if (!watchEnabled) return;

    const generatedNativeRoot = join(repoRoot, "protocol", "remote", "v3", "generated", "native");
    _sourceWatcher = watchNativeSources({
      targets: [
        { path: join(iosRoot, "App") },
        { path: join(iosRoot, "PoracodeActivities") },
        {
          path: join(iosRoot, "App.xcodeproj"),
          include: (path) => {
            const portable = path.replaceAll("\\", "/");
            return (
              portable === "project.pbxproj" ||
              portable.endsWith(".xcscheme") ||
              portable.endsWith("Package.resolved")
            );
          },
        },
        {
          path: generatedNativeRoot,
          include: (path) => {
            const portable = path.replaceAll("\\", "/");
            return portable === "native-bindings.json" || portable.startsWith("swift/");
          },
        },
      ],
      reload: async (changedPaths) => {
        const shown = changedPaths.slice(0, 3).map((path) => relative(repoRoot, path));
        const remaining = changedPaths.length - shown.length;
        process.stdout.write(
          `[native-ios] change detected: ${shown.join(", ")}${remaining > 0 ? ` (+${remaining})` : ""}\n`,
        );
        if (
          hotReload &&
          allChangedPathsHaveExtension(changedPaths, ".swift") &&
          (await waitForIosHotPatch(changedPaths))
        ) {
          process.stdout.write(
            "[native-ios] hot patch applied in place; app process and UI state preserved\n",
          );
          return;
        }
        if (hotReload && allChangedPathsHaveExtension(changedPaths, ".swift")) {
          process.stdout.write(
            "[native-ios] hot patch was not compatible; falling back to rebuild and relaunch\n",
          );
        }
        await deploy({ initial: false });
        process.stdout.write("[native-ios] reload complete; watching for changes\n");
      },
      onError: (error) => {
        process.stderr.write(
          `[native-ios] reload failed: ${error instanceof Error ? error.message : String(error)}; watching for the next change\n`,
        );
      },
    });
    process.stdout.write(
      "[native-ios] watching native sources (Swift hot patch + rebuild fallback); press Ctrl+C to stop\n",
    );
  } catch (error) {
    if (bootedByRunner) {
      await supervisor
        .run("xcrun", ["simctl", "shutdown", simulator.udid], {
          capture: true,
          label: "Shutting down the simulator after failure",
          quiet: true,
        })
        .catch(() => {});
    }
    throw error;
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(`[native-ios] ${error instanceof Error ? error.message : String(error)}\n`);
  await supervisor.shutdown();
  process.exitCode = 1;
}
