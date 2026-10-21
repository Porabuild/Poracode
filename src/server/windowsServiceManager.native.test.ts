import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { expect, it } from "vitest";
import { readServiceLauncherArtifact } from "@/shared/serverServiceLauncherArtifact";
import { windowsServiceRegistrationSchema } from "./serverServiceRegistration";
import {
  controlWindowsService,
  runWindowsServiceControl,
  windowsServiceContext,
  type WindowsServiceRequest,
  type WindowsServiceResponse,
} from "./windowsServiceManager";

// Explicit native qualification only. Ordinary suites never register a task.
it.skipIf(process.platform !== "win32" || process.env.PORACODE_TEST_NATIVE_SERVICES !== "1")(
  "qualifies one disposable task/launcher/host, refuses active removal and orphan adoption, and joins native cleanup",
  async () => {
    const resources = process.env.PORACODE_TEST_SERVICE_LAUNCHER_ROOT;
    if (!resources)
      throw new Error(
        "Set PORACODE_TEST_SERVICE_LAUNCHER_ROOT to the exact built launcher resource directory.",
      );
    const architecture = process.arch;
    if (architecture !== "x64" && architecture !== "arm64")
      throw new Error("Unsupported native fixture architecture.");
    const artifact = readServiceLauncherArtifact(
      realpathSync.native(resources),
      `win32-${architecture}`,
    );
    const scratch = realpathSync.native(join(process.cwd(), "tmp"));
    const root = mkdtempSync(join(scratch, "windows-service-native-")),
      prefix = join(root, "selected prefix"),
      release = join(prefix, "releases", "selected-release"),
      profile = join(root, "profile");
    mkdirSync(join(release, "lib"), { recursive: true });
    copyFileSync(artifact.path, join(prefix, "service-launcher-v1.exe"));
    symlinkSync(release, join(prefix, "current"), "junction");
    const nonce = randomBytes(24).toString("hex"),
      context = windowsServiceContext();
    writeFileSync(
      join(release, "lib", "server.cjs"),
      `const fs=require('node:fs');const profile=process.argv[3];fs.writeFileSync(profile+'.ready',JSON.stringify({pid:process.pid,parentPid:process.ppid,argv:process.argv}));const timer=setInterval(()=>{let value;try{value=fs.readFileSync(profile+'.stop','utf8')}catch{}if(value==='${nonce}'){clearInterval(timer);process.exitCode=0;}},50);const expiry=setTimeout(()=>{clearInterval(timer);process.exitCode=124;},60000);expiry.unref();`,
    );
    const registration = windowsServiceRegistrationSchema.parse({
      formatVersion: 2,
      state: "prepared",
      registrationId: `poracode-${randomBytes(16).toString("hex")}`,
      registrationNonce: nonce,
      manager: "windows-task",
      account: context.account,
      profileNamespace: profile,
      installPrefix: prefix,
      nodeExecutable: realpathSync.native(process.execPath),
      entrypointRelative: "current/lib/server.cjs",
      configPath: null,
      definition: { locator: join(prefix, "service-definition-v1.json"), sha256: "0".repeat(64) },
      launcher: {
        protocolVersion: 1,
        relativePath: "service-launcher-v1.exe",
        bytes: artifact.artifact.bytes,
        sha256: artifact.artifact.sha256,
      },
    });
    const calls: { operation: string; result: WindowsServiceResponse }[] = [];
    const report: {
      root: string;
      registration: typeof registration;
      artifact: typeof artifact.manifest;
      calls: typeof calls;
      retired: boolean;
      error?: string;
    } = { root, registration, artifact: artifact.manifest, calls, retired: false };
    const control = (operation: Parameters<typeof controlWindowsService>[0]) => {
      const result = controlWindowsService(
        operation,
        registration.registrationId,
        registration,
        release,
      );
      calls.push({ operation, result });
      return result;
    };
    const waitRetired = async () => {
      for (let index = 0; index < 60; index++) {
        const value = control("inspect");
        if (value.task?.instances === 0 || value.task === null) return;
        await delay(100);
      }
      throw new Error(
        `Owned native retirement is unconfirmed; preserve ${root} and task ${registration.registrationId}.`,
      );
    };
    let direct: ReturnType<typeof spawn> | undefined;
    let directClosed: Promise<number | null> | undefined;
    writeFileSync(join(root, "qualification.json"), JSON.stringify(report, null, 2));
    try {
      expect(() =>
        runWindowsServiceControl({
          version: 2,
          operation: "register",
          id: registration.registrationId,
          definition: null,
        } as unknown as WindowsServiceRequest),
      ).toThrow("Unsupported local task-control request");
      expect(control("inspect").task).toBeNull();
      expect(control("register").task).toMatchObject({
        qualified: true,
        enabled: true,
        instances: 0,
      });
      expect(control("disable").task?.enabled).toBe(false);
      expect(control("enable").task?.enabled).toBe(true);
      control("start");
      let active: WindowsServiceResponse | undefined;
      for (let index = 0; index < 30; index++) {
        active = control("inspect");
        if (active.task?.phase === "active") break;
        await delay(100);
      }
      expect(active?.task).toMatchObject({ phase: "active", instances: 1 });
      const ready = JSON.parse(readFileSync(profile + ".ready", "utf8"));
      expect(ready.pid).toBe(active!.task!.hostPid);
      expect(ready.parentPid).toBe(active!.task!.wrapperPid);
      expect(() => control("remove")).toThrow("retirement is unconfirmed");
      expect(() => control("start")).toThrow("retirement is unconfirmed");
      writeFileSync(profile + ".stop", nonce);
      await waitRetired();
      unlinkSync(profile + ".stop");
      unlinkSync(profile + ".ready");
      direct = spawn(
        join(prefix, "service-launcher-v1.exe"),
        ["--run-v1", nonce, registration.nodeExecutable, prefix, profile, ""],
        { windowsHide: true, stdio: "ignore" },
      );
      directClosed = new Promise((done, reject) => {
        direct!.once("error", reject);
        direct!.once("close", done);
      });
      for (let index = 0; index < 100 && !existsSync(profile + ".ready"); index++) await delay(50);
      expect(existsSync(profile + ".ready")).toBe(true);
      expect(() => control("inspect")).toThrow("orphaned launcher/host");
      writeFileSync(profile + ".stop", nonce);
      expect(await directClosed).toBe(0);
      await waitRetired();
    } catch (error) {
      report.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
      throw error;
    } finally {
      writeFileSync(profile + ".stop", nonce);
      try {
        if (directClosed) await directClosed;
        await waitRetired();
        expect(control("remove").task).toBeNull();
        expect(control("inspect").task).toBeNull();
        report.retired = true;
      } finally {
        writeFileSync(join(root, "qualification.json"), JSON.stringify(report, null, 2) + "\n");
      }
    }
  },
  150_000,
);
