import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { z } from "zod";
import {
  ServerServiceRefusedError,
  type ServerServiceRegistration,
} from "./serverServiceRegistration";
import type { ServerUpgradeLock } from "./serverUpgradeLock";

// This closed response belongs to a single bundled, short-lived native API query.
// No independently deployed helper or persistent registration shape is added.
export const MACOS_SERVICE_QUERY_VERSION = 1;
const QUERY = String.raw`
ObjC.import('Foundation');
ObjC.import('ServiceManagement');
function run(args) {
  if (args.length !== 1 || !/^poracode-[a-f0-9]{32}$/.test(args[0])) throw Error('Invalid service label');
  var reference = $.SMJobCopyDictionary($.kSMDomainUserLaunchd, $(args[0]));
  var object = ObjC.castRefToObject(reference);
  var job = object ? ObjC.deepUnwrap(object) : null;
  // castRefToObject gives the scripting bridge custody. A second CFRelease
  // crashes the loaded-job path; the short-lived query joins before returning.
  return JSON.stringify({version:1, job:job ? {
    label:job.Label, program:job.Program, arguments:job.ProgramArguments,
    pid:job.PID || 0, lastExitStatus:job.LastExitStatus || 0,
    onDemand:job.OnDemand, session:job.LimitLoadToSessionType
  } : null});
}`;
const responseSchema = z.strictObject({
  version: z.literal(MACOS_SERVICE_QUERY_VERSION),
  job: z
    .strictObject({
      label: z.string(),
      program: z.string(),
      arguments: z.array(z.string()).max(512),
      pid: z.int().nonnegative(),
      lastExitStatus: z.int(),
      onDemand: z.boolean(),
      session: z.string(),
    })
    .nullable(),
});
export type MacosServiceRun = (executable: string, args: readonly string[]) => string;
export function runMacosService(
  executable: string,
  args: readonly string[],
  run?: MacosServiceRun,
): string {
  if (run) return run(executable, args);
  if (process.platform !== "darwin")
    throw new ServerServiceRefusedError("launchd requires native macOS.");
  try {
    return execFileSync(executable, [...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
  } catch {
    throw new ServerServiceRefusedError(
      "The selected macOS user service operation failed. Check service status and run serve with the selected config for startup errors; no kill or alternate-user fallback was attempted.",
    );
  }
}
export function macosServiceDefinitionPath(id: string, home: string): string {
  return join(home, "Library", "LaunchAgents", `${id}.plist`);
}
export function macosServiceArguments(
  registration: ServerServiceRegistration,
  home: string,
): string[] {
  return [
    "/usr/bin/env",
    "-i",
    "-C",
    registration.installPrefix,
    `HOME=${home}`,
    "PATH=/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin",
    `PORACODE_BASE_DIR=${registration.profileNamespace}`,
    `PORACODE_SERVICE_REGISTRATION_NONCE=${registration.registrationNonce}`,
    registration.nodeExecutable,
    join(registration.installPrefix, "current", "lib", "server.cjs"),
    "serve",
    ...(registration.configPath ? ["--config", registration.configPath] : []),
  ];
}
function xml(value: string): string {
  if (
    value.split("").some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 || code === 0xfffe || code === 0xffff;
    })
  )
    throw new ServerServiceRefusedError("Service paths must be valid XML text.");
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}
export function renderMacosServiceDefinition(
  registration: ServerServiceRegistration,
  home: string,
): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict>',
    `<key>Label</key><string>${xml(registration.registrationId)}</string>`,
    "<key>Program</key><string>/usr/bin/env</string>",
    `<key>ProgramArguments</key><array>${macosServiceArguments(registration, home)
      .map((value) => `<string>${xml(value)}</string>`)
      .join("")}</array>`,
    "<key>RunAtLoad</key><true/>",
    "<key>KeepAlive</key><false/>",
    "<key>LimitLoadToSessionType</key><string>Aqua</string>",
    "</dict></plist>",
    "",
  ].join("\n");
}
export function readMacosServiceState(
  id: string,
  home: string,
  registration?: ServerServiceRegistration,
  run?: MacosServiceRun,
): Record<string, string> {
  if (!/^poracode-[a-f0-9]{32}$/u.test(id))
    throw new ServerServiceRefusedError("Invalid service label.");
  let response: z.infer<typeof responseSchema>;
  try {
    response = responseSchema.parse(
      JSON.parse(
        runMacosService("/usr/bin/osascript", ["-l", "JavaScript", "-e", QUERY, "--", id], run),
      ),
    );
  } catch {
    throw new ServerServiceRefusedError(
      "The macOS service API did not return a supported identity response. No native mutation was attempted; use foreground serve on an unsupported system.",
    );
  }
  const job = response.job;
  if (!job)
    return {
      LoadState: "not-found",
      MainPID: "0",
      ActiveState: "inactive",
      UnitFileState: "unknown",
    };
  if (
    job.label !== id ||
    (registration &&
      (job.program !== "/usr/bin/env" ||
        !job.onDemand ||
        job.session !== "Aqua" ||
        JSON.stringify(job.arguments) !==
          JSON.stringify(macosServiceArguments(registration, home))))
  )
    throw new ServerServiceRefusedError(
      "The loaded macOS job differs from this registration; refusing to adopt, stop or change it.",
    );
  return {
    Id: id,
    Manager: "launchd-agent",
    LoadState: "loaded",
    MainPID: String(job.pid),
    ActiveState: job.pid ? "active" : job.lastExitStatus ? "failed" : "inactive",
    LastExitStatus: String(job.lastExitStatus),
    UnitFileState: "unknown",
  };
}
export function mutateMacosService(
  action: "register" | "remove" | "enable" | "disable" | "start",
  registration: ServerServiceRegistration,
  home: string,
  lock: Pick<ServerUpgradeLock, "assertHeld">,
  run?: MacosServiceRun,
): void {
  const state = readMacosServiceState(registration.registrationId, home, registration, run);
  const domain = `gui/${registration.account.id}`,
    target = `${domain}/${registration.registrationId}`;
  if (action === "register") return; // Installing a plist must not trigger RunAtLoad.
  if (action === "remove" && state.MainPID !== "0")
    throw new ServerServiceRefusedError(
      "The macOS service process has not retired; no bootout was attempted.",
    );
  if (action === "remove" && state.LoadState === "not-found") return;
  lock.assertHeld();
  runMacosService(
    "/bin/launchctl",
    action === "start"
      ? state.LoadState === "not-found"
        ? ["bootstrap", domain, registration.definition.locator]
        : ["kickstart", target]
      : action === "remove"
        ? ["bootout", target]
        : [action, target],
    run,
  );
}
