import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { join, toNamespacedPath } from "node:path";
import { z } from "zod";
import { canonicalHostPath } from "@/backend/ownership/hostRootPaths";
import { SERVICE_LAUNCHER_MAX_BYTES } from "@/shared/contracts/serverServiceLauncher";
import { readBoundedRuntimeFileSync } from "@/shared/readBoundedRuntimeFile";
import { windowsSystemTool } from "@/shared/windowsSystemTool";
import { isWindowsGuiExecutable } from "@/shared/windowsGuiExecutable";
import {
  ServerServiceRefusedError,
  type WindowsServiceRegistration,
} from "./serverServiceRegistration";
import { WINDOWS_SERVICE_CONTROL, WINDOWS_SERVICE_CONTROL_VERSION } from "./windowsServiceControl";

export type WindowsServiceOperation =
  | "context"
  | "inspect"
  | "register"
  | "enable"
  | "disable"
  | "start"
  | "remove";
export interface WindowsServiceDefinition {
  readonly version: 1;
  readonly accountSid: string;
  readonly nonce: string;
  readonly executable: string;
  readonly arguments: string;
  readonly prefix: string;
  readonly node: string;
  readonly profile: string;
  readonly config: string | null;
  readonly entrypoint: string;
}
export interface WindowsServiceRequest {
  readonly version: typeof WINDOWS_SERVICE_CONTROL_VERSION;
  readonly operation: WindowsServiceOperation;
  readonly id: string | null;
  readonly definition: WindowsServiceDefinition | null;
}
const responseSchema = z.strictObject({
  version: z.literal(WINDOWS_SERVICE_CONTROL_VERSION),
  account: z.strictObject({
    sid: z.string().regex(/^S-1-(?:\d+-)+\d+$/u),
    home: z.string().min(1),
  }),
  task: z
    .strictObject({
      found: z.literal(true),
      qualified: z.boolean(),
      enabled: z.boolean(),
      instances: z.int().nonnegative(),
      wrapperPid: z.int().nonnegative(),
      hostPid: z.int().nonnegative(),
      phase: z.enum(["inactive", "activating", "active"]),
      lastResult: z.number().int(),
    })
    .nullable(),
});
export type WindowsServiceResponse = z.infer<typeof responseSchema>;
export type WindowsServiceRun = (request: WindowsServiceRequest) => WindowsServiceResponse;

export function runWindowsServiceControl(request: WindowsServiceRequest): WindowsServiceResponse {
  if (process.platform !== "win32")
    throw new ServerServiceRefusedError("Task control requires native Windows.");
  try {
    const output = execFileSync(
      windowsSystemTool("powershell"),
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(WINDOWS_SERVICE_CONTROL, "utf16le").toString("base64"),
      ],
      {
        input: JSON.stringify(request),
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      },
    );
    return responseSchema.parse(JSON.parse(output.replace(/^\uFEFF/u, "")));
  } catch (error) {
    const detail =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr).trim()
        : error instanceof Error
          ? error.message
          : String(error);
    throw new ServerServiceRefusedError(
      `Windows Task Scheduler refused the selected operation: ${detail}`,
    );
  }
}

export function windowsServiceContext(run: WindowsServiceRun = runWindowsServiceControl) {
  const result = responseSchema.parse(
    run({
      version: WINDOWS_SERVICE_CONTROL_VERSION,
      operation: "context",
      id: null,
      definition: null,
    }),
  );
  if (result.task !== null) throw new ServerServiceRefusedError("Unexpected native task context.");
  return {
    manager: "windows-task" as const,
    account: { kind: "sid" as const, id: result.account.sid },
    home: canonicalHostPath(result.account.home),
  };
}

function quoteArgument(value: string): string {
  if (
    value
      .split("")
      .some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)
  )
    throw new ServerServiceRefusedError("Service arguments must not contain control characters.");
  return `"${value.replace(/(\\*)"/gu, '$1$1\\"').replace(/(\\+)$/u, "$1$1")}"`;
}

function windowsServicePolicy(
  registration: WindowsServiceRegistration,
): Omit<WindowsServiceDefinition, "entrypoint"> {
  return {
    version: 1,
    accountSid: registration.account.id,
    nonce: registration.registrationNonce,
    executable: join(registration.installPrefix, registration.launcher.relativePath),
    arguments: [
      "--run-v1",
      registration.registrationNonce,
      registration.nodeExecutable,
      registration.installPrefix,
      registration.profileNamespace,
      registration.configPath ?? "",
    ]
      .map(quoteArgument)
      .join(" "),
    prefix: registration.installPrefix,
    node: registration.nodeExecutable,
    profile: registration.profileNamespace,
    config: registration.configPath,
  };
}

export function windowsServiceDefinition(
  registration: WindowsServiceRegistration,
  releaseDir: string,
): WindowsServiceDefinition {
  return {
    ...windowsServicePolicy(registration),
    entrypoint: toNamespacedPath(join(releaseDir, "lib", "server.cjs")),
  };
}

export function renderWindowsServiceDefinition(registration: WindowsServiceRegistration): string {
  // The task resolves current at launch. Persisting a release here would make an
  // ordinary fenced server upgrade silently retarget the native definition.
  return `${JSON.stringify(windowsServicePolicy(registration), null, 2)}\n`;
}

export function qualifyWindowsServiceLauncher(registration: WindowsServiceRegistration): void {
  const path = join(registration.installPrefix, registration.launcher.relativePath);
  try {
    if (!lstatSync(path).isFile() || realpathSync.native(path) !== path)
      throw new Error("Launcher custody differs.");
    const bytes = readBoundedRuntimeFileSync(path, SERVICE_LAUNCHER_MAX_BYTES);
    if (
      bytes.length !== registration.launcher.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== registration.launcher.sha256 ||
      !["x64", "arm64"].includes(process.arch) ||
      !isWindowsGuiExecutable(
        bytes,
        `win32-${process.arch as "x64" | "arm64"}`,
        SERVICE_LAUNCHER_MAX_BYTES,
      )
    )
      throw new Error("Launcher bytes or native executable differ.");
  } catch {
    throw new ServerServiceRefusedError(
      "The registered Windows launcher is missing, aliased or changed. Preserve it and recover/re-register explicitly; no native effects were attempted.",
    );
  }
}

export function controlWindowsService(
  operation: Exclude<WindowsServiceOperation, "context">,
  id: string,
  registration: WindowsServiceRegistration | null,
  releaseDir: string | null,
  run: WindowsServiceRun = runWindowsServiceControl,
): WindowsServiceResponse {
  const result = responseSchema.parse(
    run({
      version: WINDOWS_SERVICE_CONTROL_VERSION,
      operation,
      id,
      definition:
        registration && releaseDir ? windowsServiceDefinition(registration, releaseDir) : null,
    }),
  );
  if (registration && result.account.sid !== registration.account.id)
    throw new ServerServiceRefusedError("The native task account changed.");
  if (result.task && registration && !result.task.qualified)
    throw new ServerServiceRefusedError("The native task definition was not qualified.");
  return result;
}
