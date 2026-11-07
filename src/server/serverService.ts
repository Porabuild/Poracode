import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { callHostControl } from "@/backend/ownership/hostControlClient";
import { readHostOwnerRecord } from "@/backend/ownership/hostOwnerLease";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { requestOwnerShutdown } from "./ownerShutdown";
import { probeLeaseKernelLock } from "./serverDoctorIo";
import { acquireServerUpgradeLock, type ServerUpgradeLock } from "./serverUpgradeLock";
import { readServerUpgradeJournalState, isTerminalUpgradePhase } from "./serverUpgradeJournal";
import {
  probeRunningOwner,
  verifyCandidateStatus,
  describeIdentityMismatches,
  RunningOwnerUnreachableError,
  type RunningOwnerProbe,
} from "./serverUpgradeIdentity";
import {
  assertServiceRegistrationScope,
  readInstalledServiceRelease,
  readServiceRegistration,
  writeServiceRegistration,
  serviceRegistrationId,
  ServerServiceRefusedError,
  SERVER_SERVICE_REGISTRATION_FILE,
  type ServerServiceRegistration,
} from "./serverServiceRegistration";
import {
  qualifyLoadedService,
  qualifyServicePolicy,
  qualifyServiceDefinition,
  readServiceManagerState,
  renderServiceDefinition,
  serviceDefinitionHash,
  serviceDefinitionPath,
  serviceManagerContext,
  serviceManagerRun,
  mutateServiceManager,
  type ServerServiceManagerDeps,
} from "./serverServiceManager";
import { installWindowsService, uninstallWindowsService } from "./windowsServiceLifecycle";
import { installMacosService, uninstallMacosService } from "./macosServiceLifecycle";

export const SERVICE_USAGE =
  "service install|start|stop|restart|status|uninstall --prefix <installed-prefix> [--config <path> (install only)] [--recover (install/uninstall only)] [--json]";
export const SERVICE_HELP =
  `  ${SERVICE_USAGE}\n` +
  "  One managed registration per explicit installed prefix, bound to one account/profile; additional profiles need separate prefixes.\n" +
  "  install enables the native user service for user-manager startup/logon; it does not start it. No automatic lingering/elevation.\n" +
  "  start/restart use that prefix's current release; no download/update. Windows and macOS require a logged-on graphical user.\n" +
  "  stop/uninstall require authenticated headless shutdown and joined retirement; desktop owners are refused.\n";
export function serviceCommandHelp(action?: string): string {
  if (!action || action.startsWith("-")) return SERVICE_HELP;
  const help: Record<string, string> = {
    install:
      "service install --prefix PATH [--config PATH] [--recover] [--json]\n" +
      "  Register this exact installed prefix/profile/account under native Node.js and enable its native user service without starting it.\n" +
      "  --config selects the startup config. --recover only recovers matching owned registration state; it does not adopt a foreign service.\n",
    start:
      "service start --prefix PATH [--json]\n  Start the registered prefix's current installed release after identity checks; no download or upgrade.\n",
    stop: "service stop --prefix PATH [--json]\n  Request authenticated headless shutdown and confirm owned process/lease/native-service retirement. Desktop owners refuse.\n",
    restart:
      "service restart --prefix PATH [--json]\n  Retire the registered headless owner, then start this prefix's current installed release. No download or upgrade; desktop owners refuse.\n",
    status:
      "service status --prefix PATH [--json]\n  Inspect this prefix's saved registration, native manager state and authenticated running-owner identity. It does not adopt or start an owner.\n",
    uninstall:
      "service uninstall --prefix PATH [--recover] [--json]\n  Retire the registered headless owner and remove its verified service definition/registration; profile, history and installed releases remain.\n" +
      "  --recover completes matching interrupted removal. It never deletes a foreign definition or stops a desktop owner.\n",
  };
  if (!Object.hasOwn(help, action))
    throw new Error("Unknown service action. Run poracode service --help.");
  return (
    `Usage: poracode ${help[action]}` +
    "  One registration per explicit installed prefix, bound to one account/profile; other profiles require separate prefixes.\n" +
    "  Linux uses systemd --user. Windows requires a logged-on interactive user; macOS requires the same user's GUI login and uses launchd. Both start at logon. No password, automatic lingering or elevation.\n"
  );
}
export interface ServiceCliOptions {
  readonly action: "install" | "start" | "stop" | "restart" | "status" | "uninstall";
  readonly prefix: string;
  readonly config?: string;
  readonly recover: boolean;
  readonly json: boolean;
}
export function parseServiceCliOptions(args: readonly string[]): ServiceCliOptions {
  const action = args[0];
  if (!["install", "start", "stop", "restart", "status", "uninstall"].includes(action ?? ""))
    throw new Error(SERVICE_USAGE);
  let prefix: string | undefined, config: string | undefined;
  let recover = false,
    json = false;
  const seen = new Set<string>();
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (seen.has(arg)) throw new Error(SERVICE_USAGE);
    seen.add(arg);
    if (arg === "--json") json = true;
    else if (arg === "--recover" && (action === "install" || action === "uninstall"))
      recover = true;
    else if (arg === "--prefix" || (arg === "--config" && action === "install")) {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(SERVICE_USAGE);
      if (arg === "--prefix") prefix = value;
      else config = value;
    } else throw new Error(SERVICE_USAGE);
  }
  if (!prefix) throw new Error(SERVICE_USAGE);
  return {
    action: action as ServiceCliOptions["action"],
    prefix,
    recover,
    json,
    ...(config ? { config } : {}),
  };
}

export interface ServiceLifecycleDeps extends ServerServiceManagerDeps {
  readonly probe?: typeof probeRunningOwner;
  readonly lease?: typeof probeLeaseKernelLock;
  readonly shutdown?: typeof requestOwnerShutdown;
  readonly readOwner?: typeof readHostOwnerRecord;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}
const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
const JOIN_MS = 30_000;

export function qualifyRegisteredOwner(
  registration: ServerServiceRegistration,
  owner: RunningOwnerProbe,
): void {
  const selected = readInstalledServiceRelease(registration.installPrefix);
  const paths = resolveHostRootPaths(registration.profileNamespace);
  if (!owner.status || owner.generation.length === 0 || owner.kind !== "headless")
    throw new ServerServiceRefusedError(
      "The owner cannot prove a current headless build; desktop/older owners are never stopped or adopted.",
    );
  const mismatches = verifyCandidateStatus(owner.status, {
    profileNamespace: paths.profileNamespace,
    dataRoot: paths.dataRoot,
    releaseRoot: selected.releaseDir,
    version: selected.build.version!,
    entrypointSha256: selected.build.entrypointSha256!,
  });
  if (mismatches.length)
    throw new ServerServiceRefusedError(
      `The owner does not match this installed service: ${describeIdentityMismatches(mismatches)}`,
    );
}

export async function stopRegisteredOwner(
  registration: ServerServiceRegistration,
  lock: Pick<ServerUpgradeLock, "assertHeld">,
  deps: ServiceLifecycleDeps = {},
  selectedOwner?: RunningOwnerProbe,
): Promise<void> {
  const paths = resolveHostRootPaths(registration.profileNamespace);
  const state = qualifyLoadedService(registration, deps);
  const owner =
    selectedOwner ?? (await (deps.probe ?? probeRunningOwner)(paths, { pinGeneration: true }));
  const initialGeneration =
    owner?.generation ?? (deps.readOwner ?? readHostOwnerRecord)(paths)?.generation;
  lock.assertHeld();
  if (owner) {
    qualifyRegisteredOwner(registration, owner);
    if (state.MainPID !== String(owner.pid))
      throw new ServerServiceRefusedError(
        "The authenticated owner is not the registered manager's main process; refusing to adopt/stop it.",
      );
    lock.assertHeld();
    const accepted = await (deps.shutdown ?? requestOwnerShutdown)(paths, owner.generation, {
      call: (p, op, options) =>
        callHostControl(p, op, { ...options, expectedGeneration: owner.generation }),
    });
    if (accepted !== "accepted")
      throw new ServerServiceRefusedError(
        "This owner does not support authenticated shutdown; use a compatible owner. No PID or manager-kill fallback.",
      );
  }
  const deadline = (deps.now ?? Date.now)() + JOIN_MS;
  for (;;) {
    lock.assertHeld();
    const record = (deps.readOwner ?? readHostOwnerRecord)(paths);
    if (record && record.generation !== initialGeneration)
      throw new ServerServiceRefusedError(
        "A different owner appeared during service retirement; refusing further effects.",
      );
    const native = qualifyLoadedService(registration, deps);
    const lease = (deps.lease ?? probeLeaseKernelLock)(paths, record?.pid);
    if (
      lease.state === "free" &&
      native.MainPID === "0" &&
      ["inactive", "failed"].includes(native.ActiveState!) &&
      (!record ||
        record.phase === "stopped" ||
        !(await (deps.probe ?? probeRunningOwner)(paths, { pinGeneration: true })))
    )
      return;
    if ((deps.now ?? Date.now)() >= deadline)
      throw new ServerServiceRefusedError(
        "Service shutdown was not joined (owner, kernel lease or native process remains). No restart/removal was attempted; inspect status/doctor.",
      );
    await (deps.sleep ?? wait)(100);
  }
}

export async function startRegisteredService(
  registration: ServerServiceRegistration,
  lock: Pick<ServerUpgradeLock, "assertHeld">,
  deps: ServiceLifecycleDeps = {},
  qualifyReady = true,
): Promise<RunningOwnerProbe | null> {
  const paths = resolveHostRootPaths(registration.profileNamespace);
  const state = qualifyLoadedService(registration, deps);
  const owner = await (deps.probe ?? probeRunningOwner)(paths, { pinGeneration: true });
  lock.assertHeld();
  if (owner) {
    qualifyRegisteredOwner(registration, owner);
    if (state.MainPID !== String(owner.pid))
      throw new ServerServiceRefusedError(
        "A matching standalone owner is running outside this registration; it was not adopted. Stop it explicitly first.",
      );
    if (owner.status?.state !== "ready" || owner.status.admission !== "open")
      throw new ServerServiceRefusedError(
        "The registered owner is not ready; inspect status/upgrade recovery.",
      );
    return owner;
  }
  if (
    (deps.lease ?? probeLeaseKernelLock)(paths).state !== "free" ||
    state.MainPID !== "0" ||
    !["inactive", "failed"].includes(state.ActiveState!)
  )
    throw new ServerServiceRefusedError(
      "The owner lease or registered process is still active; refusing a second start.",
    );
  lock.assertHeld();
  const previousGeneration = (deps.readOwner ?? readHostOwnerRecord)(paths)?.generation;
  mutateServiceManager("start", registration, lock, deps);
  if (!qualifyReady) return null;
  const deadline = (deps.now ?? Date.now)() + JOIN_MS;
  for (;;) {
    lock.assertHeld();
    let next: RunningOwnerProbe | null = null;
    try {
      next = await (deps.probe ?? probeRunningOwner)(paths, { pinGeneration: true });
    } catch (error) {
      if (!(error instanceof RunningOwnerUnreachableError)) throw error;
    }
    if (next) {
      if (next.generation === previousGeneration)
        throw new ServerServiceRefusedError(
          "Start returned the previous owner generation; refusing stale success.",
        );
      qualifyRegisteredOwner(registration, next);
      const native = qualifyLoadedService(registration, deps);
      if (native.MainPID !== String(next.pid))
        throw new ServerServiceRefusedError(
          "The started owner does not match the registered main process.",
        );
      if (next.status?.state === "ready" && next.status.admission === "open") return next;
    }
    if ((deps.now ?? Date.now)() >= deadline)
      throw new ServerServiceRefusedError(
        "The service start did not qualify before the deadline. It may still be starting; inspect status/doctor. No kill/restart was attempted.",
      );
    await (deps.sleep ?? wait)(100);
  }
}

export async function runServerService(
  profileNamespace: string,
  options: ServiceCliOptions,
  deps: ServiceLifecycleDeps = {},
) {
  const context = serviceManagerContext(deps); // Refuse unqualified managers before file/native effects.
  if (options.action === "install" && process.versions.electron)
    throw new ServerServiceRefusedError(
      "Run service install with supported native Node.js. An Electron executable cannot be registered as Node; its desktop/run-as-node launch mode is not persisted.",
    );
  const selected = readInstalledServiceRelease(options.prefix);
  const profile = resolveHostRootPaths(profileNamespace).profileNamespace;
  const lock =
    options.action === "status"
      ? null
      : acquireServerUpgradeLock({ prefix: selected.prefix, releaseId: selected.releaseId });
  const assertCurrent = () => {
    lock?.assertHeld();
    if (JSON.stringify(readInstalledServiceRelease(selected.prefix)) !== JSON.stringify(selected))
      throw new ServerServiceRefusedError(
        "The selected current release changed while preparing the service command; retry explicitly.",
      );
  };
  try {
    assertCurrent();
    let registration = readServiceRegistration(selected.prefix);
    if (registration) {
      assertServiceRegistrationScope(registration, {
        prefix: selected.prefix,
        profileNamespace: profile,
        account: context.account,
      });
      qualifyServicePolicy(registration, deps);
    }
    if (options.action === "status") {
      if (!registration)
        return {
          state: "not-installed",
          prefix: selected.prefix,
          policy: "one registration per prefix",
        };
      if (registration.state !== "installed")
        return {
          state: registration.state,
          registration,
          native: readServiceManagerState(registration.registrationId, deps, registration),
          detail:
            "Inspect the prepared/removing registration; explicit --recover is required before completing it.",
        };
      const native = qualifyLoadedService(registration, deps);
      const owner = await (deps.probe ?? probeRunningOwner)(resolveHostRootPaths(profile), {
        pinGeneration: true,
      });
      if (owner) qualifyRegisteredOwner(registration, owner);
      assertCurrent();
      return {
        state: registration.state,
        registration,
        native,
        ownerGeneration: owner?.generation ?? null,
        ownerManaged: owner ? native.MainPID === String(owner.pid) : false,
      };
    }
    const held = { assertHeld: assertCurrent };
    const journal = readServerUpgradeJournalState(selected.prefix);
    if (
      journal.state !== "absent" &&
      (journal.state !== "ok" || !isTerminalUpgradePhase(journal.journal.phase))
    )
      throw new ServerServiceRefusedError(
        "An interrupted/unreadable upgrade exists; resolve upgrade recovery before service mutations.",
      );
    if (context.manager === "windows-task") {
      if (registration && registration.formatVersion !== 2)
        throw new ServerServiceRefusedError(
          "This Windows service requires version-2 launcher custody; version-1 registrations are preserved unchanged.",
        );
      if (options.action === "install")
        return installWindowsService(
          selected,
          profile,
          context.account,
          options,
          registration,
          held,
          deps,
        );
      if (options.action === "uninstall") {
        if (!registration)
          throw new ServerServiceRefusedError(
            "No managed registration exists for this prefix. Install explicitly first.",
          );
        return await uninstallWindowsService(registration, options, held, deps);
      }
    }
    if (context.manager === "launchd-agent") {
      if (options.action === "install")
        return installMacosService(
          selected,
          profile,
          context.account,
          context.home,
          options,
          registration,
          held,
          deps,
        );
      if (options.action === "uninstall") {
        if (!registration)
          throw new ServerServiceRefusedError(
            "No managed registration exists for this prefix. Install explicitly first.",
          );
        return await uninstallMacosService(registration, options, held, deps);
      }
    }
    if (options.action === "install") {
      if (registration && (!options.recover || registration.state !== "prepared"))
        throw new ServerServiceRefusedError(
          "This prefix already has a registration. Only a prepared registration can be completed with install --recover; uninstall explicitly to change configuration.",
        );
      if (!registration) {
        if (options.recover)
          throw new ServerServiceRefusedError("No prepared registration exists to recover.");
        const id = serviceRegistrationId(profile, context.account);
        if (
          readServiceManagerState(id, deps).LoadState !== "not-found" ||
          existsSync(serviceDefinitionPath(id, context.home))
        )
          throw new ServerServiceRefusedError(
            "A native definition with this name already exists; refusing to overwrite/adopt it.",
          );
        const prepared: ServerServiceRegistration = {
          formatVersion: 1,
          state: "prepared",
          registrationId: id,
          registrationNonce: randomBytes(24).toString("hex"),
          manager: "systemd-user",
          account: context.account,
          profileNamespace: profile,
          installPrefix: selected.prefix,
          nodeExecutable: realpathSync.native(process.execPath),
          entrypointRelative: "current/lib/server.cjs",
          configPath: options.config ? resolve(options.config) : null,
          definition: { locator: serviceDefinitionPath(id, context.home), sha256: "0".repeat(64) },
          launcher: null,
        };
        prepared.definition.sha256 = serviceDefinitionHash(renderServiceDefinition(prepared));
        assertCurrent();
        writeServiceRegistration(prepared);
        registration = prepared;
      } else if (options.config && resolve(options.config) !== registration.configPath)
        throw new ServerServiceRefusedError("Recovery cannot retarget the prepared configuration.");
      qualifyServicePolicy(registration, deps);
      const before = readServiceManagerState(registration.registrationId, deps);
      if (before.LoadState !== "not-found") qualifyLoadedService(registration, deps);
      if (options.recover) {
        assertCurrent();
        writeServiceRegistration(registration);
      }
      if (!existsSync(registration.definition.locator)) {
        assertCurrent();
        mkdirSync(dirname(registration.definition.locator), { recursive: true, mode: 0o700 });
        assertCurrent();
        writeFileSync(registration.definition.locator, renderServiceDefinition(registration), {
          flag: "wx",
          mode: 0o600,
        });
      }
      qualifyServiceDefinition(registration, deps);
      assertCurrent();
      serviceManagerRun(["daemon-reload"], deps);
      qualifyLoadedService(registration, deps);
      assertCurrent();
      serviceManagerRun(["enable", `${registration.registrationId}.service`], deps);
      const state = qualifyLoadedService(registration, deps);
      if (state.UnitFileState !== "enabled")
        throw new ServerServiceRefusedError(
          "Service enablement was not confirmed; prepared registration retained for explicit recovery.",
        );
      registration = { ...registration, state: "installed" };
      assertCurrent();
      writeServiceRegistration(registration);
      return {
        state: "installed",
        registration,
        detail:
          "Enabled for user-manager startup; not started. No lingering/elevation was changed.",
      };
    }
    if (!registration)
      throw new ServerServiceRefusedError(
        "No managed registration exists for this prefix. Install explicitly first.",
      );
    if (registration.state !== "installed" && !(options.action === "uninstall" && options.recover))
      throw new ServerServiceRefusedError(
        `Registration is ${registration.state}; use explicit install/uninstall --recover after inspecting it.`,
      );
    assertCurrent();
    const removingNative =
      options.action === "uninstall" && options.recover && registration.state !== "installed"
        ? readServiceManagerState(registration.registrationId, deps)
        : null;
    if (
      removingNative &&
      (removingNative.LoadState === "not-found" || !existsSync(registration.definition.locator))
    ) {
      const paths = resolveHostRootPaths(profile);
      if (
        (await (deps.probe ?? probeRunningOwner)(paths, { pinGeneration: true })) ||
        (deps.lease ?? probeLeaseKernelLock)(paths).state !== "free"
      )
        throw new ServerServiceRefusedError(
          "An owner/lease remains during removal recovery; no metadata was removed.",
        );
      if (
        removingNative.LoadState !== "not-found" &&
        (removingNative.Id !== `${registration.registrationId}.service` ||
          removingNative.Description !== `Poracode ${registration.registrationNonce}` ||
          removingNative.FragmentPath !== registration.definition.locator ||
          removingNative.DropInPaths !== "" ||
          removingNative.MainPID !== "0" ||
          removingNative.ControlPID !== "0" ||
          !["inactive", "failed"].includes(removingNative.ActiveState ?? ""))
      )
        throw new ServerServiceRefusedError(
          "The cached native definition is not the retired owned registration; no reload/removal was attempted.",
        );
      if (existsSync(registration.definition.locator)) {
        qualifyServiceDefinition(registration, deps);
        assertCurrent();
        unlinkSync(registration.definition.locator);
      }
      assertCurrent();
      serviceManagerRun(["daemon-reload"], deps);
      if (readServiceManagerState(registration.registrationId, deps).LoadState !== "not-found")
        throw new ServerServiceRefusedError(
          "Native service reappeared during recovery; registration retained.",
        );
      assertCurrent();
      unlinkSync(join(selected.prefix, SERVER_SERVICE_REGISTRATION_FILE));
      return {
        state: "not-installed",
        detail: "Completed removal recovery; profile/history/installed releases remain.",
      };
    }
    if (
      options.action === "stop" ||
      options.action === "restart" ||
      options.action === "uninstall"
    ) {
      await stopRegisteredOwner(registration, held, deps);
      assertCurrent();
    }
    if (options.action === "uninstall") {
      registration = { ...registration, state: "removing" };
      assertCurrent();
      writeServiceRegistration(registration);
      qualifyLoadedService(registration, deps);
      assertCurrent();
      serviceManagerRun(["disable", `${registration.registrationId}.service`], deps);
      qualifyServiceDefinition(registration, deps);
      assertCurrent();
      unlinkSync(registration.definition.locator);
      assertCurrent();
      serviceManagerRun(["daemon-reload"], deps);
      if (readServiceManagerState(registration.registrationId, deps).LoadState !== "not-found")
        throw new ServerServiceRefusedError(
          "Native service absence was not confirmed; removing journal retained.",
        );
      assertCurrent();
      unlinkSync(join(selected.prefix, SERVER_SERVICE_REGISTRATION_FILE));
      return {
        state: "not-installed",
        detail: "Removed the registered service; profile/history/installed releases remain.",
      };
    }
    const owner =
      options.action === "start" || options.action === "restart"
        ? await startRegisteredService(registration, held, deps)
        : null;
    assertCurrent();
    return {
      state: options.action === "stop" ? "stopped" : "running",
      registration,
      ownerGeneration: owner?.generation ?? null,
    };
  } finally {
    lock?.release();
  }
}
