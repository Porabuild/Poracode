#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { BOOT_TIMEOUT_MS, CommandSupervisor, childEnvironment, sleep } from "./native-dev-lib.mjs";

const supervisor = new CommandSupervisor();
supervisor.installSignalHandlers();

async function main() {
  const [avd, command, ...args] = process.argv.slice(2);
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (!sdk || !avd || !command) {
    throw new Error("Set ANDROID_HOME and pass an AVD name followed by the test command.");
  }
  const adb = join(sdk, "platform-tools", "adb");
  const serial = "emulator-5554";
  const env = childEnvironment(process.env, {
    ANDROID_SERIAL: serial,
    PATH: `${join(sdk, "platform-tools")}${delimiter}${process.env.PATH ?? ""}`,
  });
  let emulatorStopped = false;
  let emulatorFailure;
  const emulatorRun = supervisor
    .run(
      join(sdk, "emulator", "emulator"),
      [
        "-avd",
        avd,
        "-port",
        "5554",
        "-cores",
        "2",
        "-memory",
        "4096",
        "-partition-size",
        "8192",
        "-no-window",
        "-gpu",
        "swiftshader_indirect",
        "-no-snapshot",
        "-noaudio",
        "-no-boot-anim",
      ],
      { env, passthrough: true, timeoutMs: 45 * 60_000, label: "Android CI emulator" },
    )
    .then(
      () => {
        emulatorStopped = true;
      },
      (error) => {
        emulatorStopped = true;
        emulatorFailure = error;
      },
    );
  const capture = async (...adbArgs) =>
    (
      await supervisor.run(adb, ["-s", serial, ...adbArgs], {
        env,
        capture: true,
        quiet: true,
        timeoutMs: 10_000,
      })
    ).stdout.trim();

  try {
    const deadline = Date.now() + BOOT_TIMEOUT_MS;
    let ready = false;
    while (Date.now() < deadline) {
      if (emulatorStopped) throw emulatorFailure ?? new Error("Emulator exited during startup.");
      try {
        // Android 17 can publish boot completion before the input service exists.
        // Wait for both before sending the unlock key; never retry the test suite.
        const booted = await capture("shell", "getprop", "sys.boot_completed");
        const input = await capture("shell", "service", "check", "input");
        if (booted === "1" && input === "Service input: found") {
          await capture("shell", "input", "keyevent", "82");
          ready = true;
          break;
        }
      } catch {
        // ADB is briefly offline while the emulator starts.
      }
      await sleep(1_000);
    }
    if (!ready) throw new Error(`Emulator services were not ready within ${BOOT_TIMEOUT_MS}ms.`);
    for (const setting of [
      "window_animation_scale",
      "transition_animation_scale",
      "animator_duration_scale",
    ]) {
      await capture("shell", "settings", "put", "global", setting, "0");
    }
    await supervisor.run(command, args, { env, timeoutMs: 40 * 60_000, label: "Android CI suite" });
    if (emulatorStopped)
      throw emulatorFailure ?? new Error("Emulator exited during the test suite.");
  } finally {
    if (process.env.RUNNER_TEMP) {
      try {
        const logcat = await capture("logcat", "-d", "-v", "threadtime");
        await writeFile(join(process.env.RUNNER_TEMP, "android-emulator-logcat.txt"), logcat);
      } catch (error) {
        console.warn("Could not capture emulator logcat:", error);
      }
    }
    await supervisor.shutdown();
    await emulatorRun;
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await supervisor.shutdown();
}
