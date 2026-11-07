import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { userInfo } from "node:os";
import { dirname, join } from "node:path";
import { canonicalHostPath } from "@/backend/ownership/hostRootPaths";
import {
  ServerServiceRefusedError,
  readInstalledServiceRelease,
  type ServerServiceRegistration,
} from "./serverServiceRegistration";
import {
  controlWindowsService,
  qualifyWindowsServiceLauncher,
  renderWindowsServiceDefinition,
  windowsServiceContext,
  type WindowsServiceRun,
} from "./windowsServiceManager";
import type { ServerUpgradeLock } from "./serverUpgradeLock";
import {
  macosServiceDefinitionPath,
  mutateMacosService,
  readMacosServiceState,
  renderMacosServiceDefinition,
  type MacosServiceRun,
} from "./macosServiceManager";

export interface ServerServiceManagerDeps {
  readonly platform?: NodeJS.Platform;
  readonly uid?: () => number;
  readonly home?: string;
  readonly run?: (args: readonly string[]) => string;
  readonly windowsRun?: WindowsServiceRun;
  readonly macosRun?: MacosServiceRun;
}

export function serviceManagerContext(deps: ServerServiceManagerDeps = {}) {
  const platform = deps.platform ?? process.platform;
  if (platform === "win32") return windowsServiceContext(deps.windowsRun);
  if (platform !== "linux" && platform !== "darwin")
    throw new ServerServiceRefusedError(
      `Managed services are not qualified on ${platform}; use foreground serve under your own manager. No native registration was changed.`,
    );
  const uid = deps.uid?.() ?? process.getuid?.();
  if (uid === undefined || !Number.isSafeInteger(uid) || uid < 0)
    throw new ServerServiceRefusedError("Cannot establish the actual current service account uid.");
  if (!deps.uid && process.geteuid?.() !== uid)
    throw new ServerServiceRefusedError(
      "Service registration refuses a different effective account; run as the selected native user.",
    );
  if (platform === "darwin") {
    if (uid === 0 || (!deps.uid && lstatSync("/dev/console").uid !== uid))
      throw new ServerServiceRefusedError(
        "The macOS login agent requires this account's active graphical login session. Use foreground serve over SSH without a GUI login; no root/alternate-user domain is selected.",
      );
    return {
      manager: "launchd-agent" as const,
      account: { kind: "uid" as const, id: String(uid) },
      home: canonicalHostPath(deps.home ?? userInfo().homedir),
    };
  }
  return {
    manager: "systemd-user" as const,
    account: { kind: "uid" as const, id: String(uid) },
    home: canonicalHostPath(deps.home ?? userInfo().homedir),
  };
}

export function serviceDefinitionPath(id: string, home: string): string {
  return join(home, ".config", "systemd", "user", `${id}.service`);
}

function quote(value: string, command = false): string {
  if (
    value
      .split("")
      .some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127)
  )
    throw new ServerServiceRefusedError("Service paths must not contain control characters.");
  return `"${value
    .replace(/\\/gu, "\\\\")
    .replace(/"/gu, '\\"')
    .replace(/%/gu, "%%")
    .replace(/\$/gu, command ? "$$$$" : "$")}"`;
}

export function renderServiceDefinition(registration: ServerServiceRegistration): string {
  if (registration.formatVersion === 2) return renderWindowsServiceDefinition(registration);
  if (registration.manager === "launchd-agent")
    return renderMacosServiceDefinition(
      registration,
      dirname(dirname(dirname(registration.definition.locator))),
    );
  const args = [
    registration.nodeExecutable,
    join(registration.installPrefix, "current", "lib", "server.cjs"),
    "serve",
    ...(registration.configPath ? ["--config", registration.configPath] : []),
  ];
  return [
    "[Unit]",
    `Description=Poracode ${registration.registrationNonce}`,
    "",
    "[Service]",
    "Type=exec",
    `ExecStart=${args.map((arg) => quote(arg, true)).join(" ")}`,
    `Environment=${quote(`PORACODE_BASE_DIR=${registration.profileNamespace}`)}`,
    `WorkingDirectory=${quote(registration.installPrefix)}`,
    "Restart=no",
    "UnsetEnvironment=PORACODE_APP_VERSION PORACODE_UPGRADE_STAGING NODE_OPTIONS NODE_PATH",
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}

export function serviceDefinitionHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function serviceManagerRun(
  args: readonly string[],
  deps: ServerServiceManagerDeps = {},
): string {
  if (deps.run) return deps.run(args);
  const { account } = serviceManagerContext(deps);
  const runtimeDir = `/run/user/${account.id}`,
    bus = `${runtimeDir}/bus`;
  let ownedBus = false;
  try {
    const directory = lstatSync(runtimeDir),
      socket = lstatSync(bus);
    ownedBus =
      directory.isDirectory() &&
      directory.uid === Number(account.id) &&
      socket.isSocket() &&
      socket.uid === Number(account.id);
  } catch {
    /* A missing/inaccessible user bus is a concrete refusal below. */
  }
  if (!ownedBus)
    throw new ServerServiceRefusedError(
      "The native user bus does not belong to the selected uid. Run from that user's systemd session; no linger/elevation or alternate bus is selected.",
    );
  return execFileSync("systemctl", ["--user", "--no-ask-password", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
    windowsHide: true,
    env: {
      ...process.env,
      XDG_RUNTIME_DIR: runtimeDir,
      DBUS_SESSION_BUS_ADDRESS: `unix:path=${bus}`,
    },
  });
}

const PROPERTIES = [
  "Id",
  "Description",
  "LoadState",
  "FragmentPath",
  "SourcePath",
  "DropInPaths",
  "NeedDaemonReload",
  "Transient",
  "User",
  "Type",
  "Restart",
  "MainPID",
  "ControlPID",
  "ActiveState",
  "UnitFileState",
];
export function readServiceManagerState(
  id: string,
  deps: ServerServiceManagerDeps = {},
  registration?: ServerServiceRegistration,
): Record<string, string> {
  if ((deps.platform ?? process.platform) === "darwin")
    return readMacosServiceState(id, serviceManagerContext(deps).home, registration, deps.macosRun);
  if ((deps.platform ?? process.platform) === "win32") {
    if (registration && registration.formatVersion !== 2)
      throw new ServerServiceRefusedError(
        "This Windows CLI requires a version-2 launcher registration; version-1 registrations remain unchanged.",
      );
    if (registration) qualifyWindowsServiceLauncher(registration);
    const result = controlWindowsService(
      "inspect",
      id,
      registration ?? null,
      registration ? readInstalledServiceRelease(registration.installPrefix).releaseDir : null,
      deps.windowsRun,
    );
    const task = result.task;
    return task
      ? {
          Id: id,
          Manager: "windows-task",
          LoadState: "loaded",
          MainPID: String(task.hostPid),
          WrapperPID: String(task.wrapperPid),
          Instances: String(task.instances),
          ActiveState: task.phase,
          UnitFileState: task.enabled ? "enabled" : "disabled",
          LastTaskResult: String(task.lastResult),
        }
      : {
          LoadState: "not-found",
          MainPID: "0",
          WrapperPID: "0",
          Instances: "0",
          ActiveState: "inactive",
        };
  }
  let output: string;
  try {
    output = serviceManagerRun(
      ["show", `${id}.service`, "--all", "--no-pager", `--property=${PROPERTIES.join(",")}`],
      deps,
    );
  } catch (error) {
    const stdout =
      error && typeof error === "object" && "stdout" in error ? String(error.stdout) : "";
    if (!/^LoadState=not-found$/mu.test(stdout)) throw error;
    output = stdout;
  }
  const state: Record<string, string> = {};
  for (const line of output.trim().split(/\r?\n/u)) {
    const index = line.indexOf("=");
    if (index > 0) state[line.slice(0, index)] = line.slice(index + 1);
  }
  if (!state.LoadState)
    throw new ServerServiceRefusedError(
      "The user service manager did not return a qualified LoadState; check the user bus/session.",
    );
  return state;
}

export function qualifyServicePolicy(
  registration: ServerServiceRegistration,
  deps: ServerServiceManagerDeps = {},
): void {
  const context = serviceManagerContext(deps);
  if (
    registration.manager !== context.manager ||
    (context.manager === "windows-task" && registration.formatVersion !== 2) ||
    (context.manager === "systemd-user" && registration.formatVersion !== 1) ||
    (context.manager === "launchd-agent" && registration.formatVersion !== 1) ||
    registration.account.kind !== context.account.kind ||
    registration.account.id !== context.account.id ||
    registration.definition.locator !==
      (registration.formatVersion === 2
        ? join(registration.installPrefix, "service-definition-v1.json")
        : context.manager === "launchd-agent"
          ? macosServiceDefinitionPath(registration.registrationId, context.home)
          : serviceDefinitionPath(registration.registrationId, context.home))
  )
    throw new ServerServiceRefusedError(
      "Service manager/account/definition location does not match this native user context.",
    );
  const text = renderServiceDefinition(registration);
  if (serviceDefinitionHash(text) !== registration.definition.sha256)
    throw new ServerServiceRefusedError(
      "The registered service definition differs from this CLI's versioned policy; use a compatible CLI.",
    );
}

export function qualifyServiceDefinition(
  registration: ServerServiceRegistration,
  deps: ServerServiceManagerDeps = {},
): void {
  qualifyServicePolicy(registration, deps);
  if (registration.formatVersion === 2) qualifyWindowsServiceLauncher(registration);
  if (
    !lstatSync(registration.definition.locator).isFile() ||
    serviceDefinitionHash(readFileSync(registration.definition.locator, "utf8")) !==
      registration.definition.sha256
  )
    throw new ServerServiceRefusedError(
      "The saved native service definition was replaced or edited; refusing to mutate it.",
    );
}

export function qualifyLoadedService(
  registration: ServerServiceRegistration,
  deps: ServerServiceManagerDeps = {},
) {
  qualifyServiceDefinition(registration, deps);
  const state = readServiceManagerState(registration.registrationId, deps, registration);
  if (registration.manager === "launchd-agent") return state;
  if (registration.formatVersion === 2) {
    if (state.LoadState !== "loaded")
      throw new ServerServiceRefusedError(
        "The registered Windows task is absent; recover explicitly.",
      );
    return state;
  }
  const expected = {
    Id: `${registration.registrationId}.service`,
    Description: `Poracode ${registration.registrationNonce}`,
    LoadState: "loaded",
    FragmentPath: registration.definition.locator,
    SourcePath: "",
    DropInPaths: "",
    NeedDaemonReload: "no",
    Transient: "no",
    User: "",
    Type: "exec",
    Restart: "no",
    ControlPID: "0",
  };
  for (const [key, value] of Object.entries(expected)) {
    if (state[key] !== value)
      throw new ServerServiceRefusedError(
        `Loaded service ${key} differs from the registered definition; refusing native effects.`,
      );
  }
  if (
    !/^\d+$/u.test(state.MainPID ?? "") ||
    !["active", "activating", "deactivating", "inactive", "failed"].includes(
      state.ActiveState ?? "",
    )
  )
    throw new ServerServiceRefusedError(
      "The loaded service has an unqualified process/state response.",
    );
  return state;
}

export function mutateServiceManager(
  action: "register" | "remove" | "enable" | "disable" | "start",
  registration: ServerServiceRegistration,
  lock: Pick<ServerUpgradeLock, "assertHeld">,
  deps: ServerServiceManagerDeps = {},
): void {
  if (registration.manager === "launchd-agent") {
    qualifyServiceDefinition(registration, deps);
    mutateMacosService(action, registration, serviceManagerContext(deps).home, lock, deps.macosRun);
    return;
  }
  if (registration.formatVersion === 2) {
    qualifyServiceDefinition(registration, deps);
    const releaseDir = readInstalledServiceRelease(registration.installPrefix).releaseDir;
    lock.assertHeld();
    controlWindowsService(
      action,
      registration.registrationId,
      registration,
      releaseDir,
      deps.windowsRun,
    );
    return;
  }
  lock.assertHeld();
  serviceManagerRun(
    action === "register" || action === "remove"
      ? ["daemon-reload"]
      : [action, `${registration.registrationId}.service`],
    deps,
  );
}
