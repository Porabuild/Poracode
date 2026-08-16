#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_ID,
  BOOT_TIMEOUT_MS,
  BUILD_TIMEOUT_MS,
  CommandSupervisor,
  androidInstallArguments,
  childEnvironment,
  graphicalAvdProcessId,
  javaMajorVersion,
  loopbackPortFromPairingUrl,
  nativeDevWatchEnabled,
  optionalPairingUrl,
  parseAdbDevices,
  processListHasHeadlessAvd,
  sleep,
  watchNativeSources,
} from "./native-dev-lib.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const androidRoot = join(repoRoot, "android");
const activity = `${APP_ID}/com.poracode.app.MainActivity`;
const supervisor = new CommandSupervisor();
supervisor.installSignalHandlers();
let _sourceWatcher;

function sdkRoot() {
  const fromEnvironment = (process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT)?.trim();
  if (fromEnvironment) return resolve(fromEnvironment);
  const propertiesPath = join(androidRoot, "local.properties");
  if (!existsSync(propertiesPath)) {
    throw new Error("set ANDROID_HOME or ANDROID_SDK_ROOT, or create android/local.properties");
  }
  const value = readFileSync(propertiesPath, "utf8")
    .match(/^sdk\.dir=(.+)$/m)?.[1]
    ?.trim();
  if (!value) throw new Error("android/local.properties does not define sdk.dir");
  return resolve(value.replaceAll("\\\\", "\\"));
}

function requireApi37Platform(root) {
  const platforms = join(root, "platforms");
  const installed = existsSync(platforms) ? readdirSync(platforms) : [];
  const api37 = installed.find((name) => /^android-37(?:\.0)?$/.test(name));
  if (!api37 || !existsSync(join(platforms, api37, "android.jar"))) {
    throw new Error("Android API 37 is required; install platforms;android-37.0");
  }
}

async function capture(command, args, label, env) {
  const result = await supervisor.run(command, args, {
    capture: true,
    ...(env ? { env } : {}),
    label,
    quiet: true,
  });
  return `${result.stdout}\n${result.stderr}`.trim();
}

async function deviceApi(adb, serial, env) {
  return await capture(
    adb,
    ["-s", serial, "shell", "getprop", "ro.build.version.sdk"],
    "checking the Android API level",
    env,
  );
}

async function connectedApi37Devices(adb, env) {
  const devices = parseAdbDevices(
    await capture(adb, ["devices", "-l"], "listing Android devices", env),
  );
  const compatible = [];
  for (const serial of devices) {
    if ((await deviceApi(adb, serial, env)) === "37") compatible.push(serial);
  }
  return compatible;
}

async function avdName(adb, serial, env) {
  if (!serial.startsWith("emulator-")) return null;
  try {
    return (
      await capture(adb, ["-s", serial, "emu", "avd", "name"], "reading the AVD name", env)
    ).split(/\r?\n/, 1)[0];
  } catch {
    return null;
  }
}

async function hostProcessList(env) {
  if (process.platform === "win32") {
    return await capture(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_Process | ForEach-Object { $_.CommandLine }",
      ],
      "checking whether the Android emulator is graphical",
      env,
    );
  }
  return await capture(
    "ps",
    ["-Ao", "command="],
    "checking whether the Android emulator is graphical",
    env,
  );
}

async function headlessAvdName(adb, serial, env) {
  if (!serial.startsWith("emulator-")) return null;
  const name = await avdName(adb, serial, env);
  if (!name) return null;
  return processListHasHeadlessAvd(await hostProcessList(env), name) ? name : null;
}

async function revealGraphicalEmulator(adb, serial, env) {
  if (process.platform !== "darwin" || !serial.startsWith("emulator-")) return;
  const name = await avdName(adb, serial, env);
  if (!name) return;
  const processes = await capture(
    "ps",
    ["-Ao", "pid=,command="],
    "locating the Android emulator window",
    env,
  );
  const processId = graphicalAvdProcessId(processes, name);
  if (!processId) return;
  await supervisor
    .run(
      "/usr/bin/osascript",
      [
        "-e",
        `tell application "System Events" to set frontmost of (first process whose unix id is ${String(processId)}) to true`,
      ],
      {
        capture: true,
        env,
        label: "Bringing the Android emulator window forward",
        quiet: true,
      },
    )
    .catch(() => {});
}

async function stopHeadlessAvd(adb, serial, name, env) {
  process.stdout.write(
    `[native-android] ${serial} is the headless ${name} AVD; restarting it with a visible window\n`,
  );
  await supervisor.run(adb, ["-s", serial, "emu", "kill"], {
    env,
    label: "Stopping the headless Android emulator",
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const devices = parseAdbDevices(
      await capture(adb, ["devices", "-l"], "waiting for the headless emulator to stop", env),
    );
    if (!devices.includes(serial)) return;
    await sleep(250);
  }
  throw new Error(`headless AVD ${name} did not stop within 30000ms`);
}

async function startAvd(emulator, adb, name, env) {
  process.stdout.write(`[native-android] starting AVD: ${name}\n`);
  const started = supervisor.startLongRunning(emulator, ["-avd", name, "-no-snapshot-save"], {
    env,
  });
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  try {
    while (Date.now() < deadline) {
      const devices = parseAdbDevices(
        await capture(adb, ["devices", "-l"], "waiting for the Android emulator", env),
      );
      for (const serial of devices) {
        if ((await avdName(adb, serial, env)) !== name) continue;
        const booted = await capture(
          adb,
          ["-s", serial, "shell", "getprop", "sys.boot_completed"],
          "waiting for Android to boot",
          env,
        );
        if (booted === "1") {
          if ((await deviceApi(adb, serial, env)) !== "37") {
            throw new Error(`AVD ${name} is not an Android 17 / API 37 device`);
          }
          return { serial, started };
        }
      }
      if (started.child.exitCode !== null) {
        throw new Error(`AVD ${name} exited before Android finished booting`);
      }
      await sleep(1_000);
    }
    throw new Error(`AVD ${name} did not boot within ${String(BOOT_TIMEOUT_MS)}ms`);
  } catch (error) {
    started.child.kill("SIGTERM");
    throw error;
  }
}

async function selectDevice(adb, emulator, env) {
  const requested = process.env.PORACODE_ANDROID_TARGET?.trim();
  const requestedAvdFromEnvironment = process.env.PORACODE_ANDROID_AVD?.trim();
  if (requested && requestedAvdFromEnvironment) {
    throw new Error("set only one of PORACODE_ANDROID_TARGET or PORACODE_ANDROID_AVD");
  }
  const compatible = await connectedApi37Devices(adb, env);
  if (requested && compatible.includes(requested)) return { serial: requested, started: null };
  if (!requested && !requestedAvdFromEnvironment) {
    const graphical = [];
    const headless = [];
    for (const serial of compatible) {
      const name = await headlessAvdName(adb, serial, env);
      if (name) headless.push({ name, serial });
      else graphical.push(serial);
    }
    if (graphical.length === 1) return { serial: graphical[0], started: null };
    if (graphical.length > 1) {
      throw new Error("multiple API 37 devices are connected; set PORACODE_ANDROID_TARGET");
    }
    const conventionalHeadless = headless.find(({ name }) => name === "poracode-pixel9-api37");
    if (conventionalHeadless) {
      if (!emulator) throw new Error("the Android SDK emulator is required to restart the AVD");
      await stopHeadlessAvd(adb, conventionalHeadless.serial, conventionalHeadless.name, env);
      return await startAvd(emulator, adb, conventionalHeadless.name, env);
    }
    if (headless.length > 0) {
      throw new Error(
        "only headless API 37 emulators are connected; set PORACODE_ANDROID_AVD to restart one graphically",
      );
    }
  }

  if (!emulator) {
    throw new Error("the Android SDK emulator is required to start an AVD");
  }

  const avds = (await capture(emulator, ["-list-avds"], "listing Android AVDs", env))
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
  const requestedAvd =
    requestedAvdFromEnvironment ?? (requested && avds.includes(requested) ? requested : undefined);
  if (requested && !requestedAvd) {
    throw new Error(
      `PORACODE_ANDROID_TARGET must be a connected API 37 device serial or installed AVD; received ${requested}`,
    );
  }
  if (requestedAvd && !avds.includes(requestedAvd)) {
    throw new Error(`Android AVD ${requestedAvd} is not installed`);
  }
  if (requestedAvd) return await startAvd(emulator, adb, requestedAvd, env);

  const conventionalAvd = avds.find((name) => name === "poracode-pixel9-api37");
  if (!conventionalAvd) {
    throw new Error(
      "no Android 17 / API 37 device is connected and poracode-pixel9-api37 is not installed",
    );
  }
  return await startAvd(emulator, adb, conventionalAvd, env);
}

async function main() {
  const watchEnabled = nativeDevWatchEnabled(process.argv.slice(2));
  const pairingUrl = optionalPairingUrl();
  const root = sdkRoot();
  requireApi37Platform(root);
  const executableSuffix = process.platform === "win32" ? ".exe" : "";
  const adb = join(root, "platform-tools", `adb${executableSuffix}`);
  const emulatorPath = join(root, "emulator", `emulator${executableSuffix}`);
  const emulator = existsSync(emulatorPath) ? emulatorPath : null;
  if (!existsSync(adb)) throw new Error("the Android SDK must include platform-tools");

  const env = childEnvironment(process.env, { ANDROID_HOME: root, ANDROID_SDK_ROOT: root });
  const javaFromHome = env.JAVA_HOME?.trim()
    ? join(env.JAVA_HOME, "bin", `java${executableSuffix}`)
    : null;
  if (javaFromHome && !existsSync(javaFromHome)) {
    throw new Error("JAVA_HOME does not contain a Java executable");
  }
  const javaOutput = await capture(javaFromHome ?? "java", ["-version"], "checking Java", env);
  const javaVersion = javaMajorVersion(javaOutput);
  if (javaVersion !== 21) throw new Error(`Java 21 is required; found Java ${String(javaVersion)}`);

  const selectedDevice = await selectDevice(adb, emulator, env);
  const { serial } = selectedDevice;
  if ((await deviceApi(adb, serial, env)) !== "37") {
    throw new Error(`Android 17 / API 37 is required; ${serial} has a different API level`);
  }
  process.stdout.write(`[native-android] device: ${serial} (API 37)\n`);
  await revealGraphicalEmulator(adb, serial, env);

  const gradleArgs = androidInstallArguments();
  const gradleEnv = childEnvironment(env, { ANDROID_SERIAL: serial });
  const gradle =
    process.platform === "win32"
      ? {
          command: "cmd.exe",
          args: ["/d", "/s", "/c", join(androidRoot, "gradlew.bat"), ...gradleArgs],
        }
      : { command: join(androidRoot, "gradlew"), args: gradleArgs };
  const reversePort = loopbackPortFromPairingUrl(pairingUrl);
  const processId = async () => {
    try {
      return await capture(
        adb,
        ["-s", serial, "shell", "pidof", APP_ID],
        "reading the Android app process id",
        env,
      );
    } catch {
      return "";
    }
  };
  const runDeployer = async (command) => {
    const commandArgs = [
      "--console=plain",
      ":androidApkDeployer",
      `-Pporacode.android.deployer.command=${command}`,
      `-Pporacode.android.deployer.serial=${serial}`,
      `-Pporacode.android.deployer.adb=${adb}`,
    ];
    await supervisor.run(
      gradle.command,
      process.platform === "win32"
        ? ["/d", "/s", "/c", join(androidRoot, "gradlew.bat"), ...commandArgs]
        : commandArgs,
      {
        cwd: androidRoot,
        env: gradleEnv,
        label:
          command === "codeswap"
            ? "Building and applying Android code changes"
            : "Building and installing with the Android APK deployer",
        timeoutMs: BUILD_TIMEOUT_MS,
      },
    );
  };
  const deploy = async ({ initial }) => {
    if (initial) {
      try {
        await runDeployer("install");
      } catch (error) {
        process.stdout.write(
          `[native-android] APK deployer install unavailable (${error instanceof Error ? error.message : String(error)}); using Gradle install\n`,
        );
        await supervisor.run(gradle.command, gradle.args, {
          cwd: androidRoot,
          env: gradleEnv,
          label: "Building and installing the native Android app",
          timeoutMs: BUILD_TIMEOUT_MS,
        });
      }
    } else {
      await supervisor.run(gradle.command, gradle.args, {
        cwd: androidRoot,
        env: gradleEnv,
        label: "Incrementally rebuilding and installing the Android app",
        timeoutMs: BUILD_TIMEOUT_MS,
      });
    }

    if (initial && reversePort) {
      await supervisor.run(
        adb,
        ["-s", serial, "reverse", `tcp:${String(reversePort)}`, `tcp:${String(reversePort)}`],
        { env, label: "Forwarding the existing E2E host to Android" },
      );
    }
    await supervisor.run(adb, ["-s", serial, "shell", "am", "force-stop", APP_ID], {
      env,
      label: initial ? "Stopping the previous Android app process" : "Stopping for Android reload",
    });
    await supervisor.run(adb, ["-s", serial, "shell", "am", "set-debug-app", APP_ID], {
      env,
      label: "Enabling Android code-swap discovery",
    });
    await supervisor.run(adb, ["-s", serial, "shell", "am", "start", "-W", "-n", activity], {
      env,
      label: initial ? "Launching the native Android app" : "Reloading the native Android app",
    });
    if (!initial || !pairingUrl) return;

    process.stdout.write("[native-android] opening the E2E pairing link from the environment\n");
    await supervisor.run(
      adb,
      [
        "-s",
        serial,
        "shell",
        "am",
        "start",
        "-W",
        "-a",
        "android.intent.action.VIEW",
        "-d",
        pairingUrl,
        "-p",
        APP_ID,
      ],
      { capture: true, env, label: "Opening the E2E pairing link", quiet: true },
    );
  };

  const hotSwap = async () => {
    const before = await processId();
    if (!before) throw new Error("the Android app is not running");
    await runDeployer("codeswap");
    const afterSwap = await processId();
    if (afterSwap !== before) {
      throw new Error(
        `Android code swap changed the app process (${before} -> ${afterSwap || "none"})`,
      );
    }
    process.stdout.write(`[native-android] code swap complete; process ${before} preserved\n`);
  };

  await deploy({ initial: true });
  selectedDevice.started?.release();
  if (!watchEnabled) return;

  const generatedNativeRoot = join(repoRoot, "protocol", "remote", "v3", "generated", "native");
  _sourceWatcher = watchNativeSources({
    targets: [
      { path: join(androidRoot, "app", "src", "main") },
      { path: join(androidRoot, "app", "src", "debug") },
      {
        path: join(androidRoot, "app"),
        recursive: false,
        include: (path) =>
          ["build.gradle.kts", "google-services.json", "proguard-rules.pro"].includes(
            path.replaceAll("\\", "/"),
          ),
      },
      {
        path: androidRoot,
        recursive: false,
        include: (path) =>
          ["build.gradle.kts", "settings.gradle.kts", "gradle.properties"].includes(
            path.replaceAll("\\", "/"),
          ),
      },
      {
        path: join(androidRoot, "gradle", "wrapper"),
        recursive: false,
        include: (path) => path.replaceAll("\\", "/") === "gradle-wrapper.properties",
      },
      {
        path: generatedNativeRoot,
        include: (path) => {
          const portable = path.replaceAll("\\", "/");
          return portable === "native-bindings.json" || portable.startsWith("kotlin/");
        },
      },
    ],
    reload: async (changedPaths) => {
      const shown = changedPaths.slice(0, 3).map((path) => relative(repoRoot, path));
      const remaining = changedPaths.length - shown.length;
      process.stdout.write(
        `[native-android] change detected: ${shown.join(", ")}${remaining > 0 ? ` (+${remaining})` : ""}\n`,
      );
      const kotlinOnly = changedPaths.every((path) => path.endsWith(".kt"));
      if (kotlinOnly) {
        try {
          await hotSwap();
        } catch (error) {
          process.stdout.write(
            `[native-android] code swap unavailable (${error instanceof Error ? error.message : String(error)}); falling back to reinstall\n`,
          );
          await deploy({ initial: false });
        }
      } else {
        await deploy({ initial: false });
      }
      process.stdout.write("[native-android] reload complete; watching for changes\n");
    },
    onError: (error) => {
      process.stderr.write(
        `[native-android] reload failed: ${error instanceof Error ? error.message : String(error)}; watching for the next change\n`,
      );
    },
  });
  process.stdout.write("[native-android] watching native sources; press Ctrl+C to stop\n");
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    `[native-android] ${error instanceof Error ? error.message : String(error)}\n`,
  );
  await supervisor.shutdown();
  process.exitCode = 1;
}
