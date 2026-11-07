import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { probeLeaseKernelLock } from "./serverDoctorIo";
import {
  stopRegisteredOwner,
  type ServiceCliOptions,
  type ServiceLifecycleDeps,
} from "./serverService";
import { macosServiceDefinitionPath } from "./macosServiceManager";
import {
  mutateServiceManager,
  qualifyLoadedService,
  qualifyServiceDefinition,
  qualifyServicePolicy,
  readServiceManagerState,
  renderServiceDefinition,
  serviceDefinitionHash,
} from "./serverServiceManager";
import {
  readInstalledServiceRelease,
  readServiceRegistration,
  SERVER_SERVICE_REGISTRATION_FILE,
  ServerServiceRefusedError,
  serviceRegistrationId,
  writeServiceRegistration,
  type ServerServiceRegistration,
} from "./serverServiceRegistration";
import { probeRunningOwner } from "./serverUpgradeIdentity";
import type { ServerUpgradeLock } from "./serverUpgradeLock";

export function installMacosService(
  selected: ReturnType<typeof readInstalledServiceRelease>,
  profile: string,
  account: ServerServiceRegistration["account"],
  home: string,
  options: ServiceCliOptions,
  existing: ServerServiceRegistration | null,
  lock: Pick<ServerUpgradeLock, "assertHeld">,
  deps: ServiceLifecycleDeps,
) {
  if (existing && (!options.recover || existing.state !== "prepared"))
    throw new ServerServiceRefusedError(
      "This prefix already has a registration; only a prepared registration can use install --recover.",
    );
  let registration = existing;
  if (!registration) {
    if (options.recover)
      throw new ServerServiceRefusedError("No prepared registration exists to recover.");
    const id = serviceRegistrationId(profile, account),
      path = macosServiceDefinitionPath(id, home);
    if (existsSync(path) || readServiceManagerState(id, deps).LoadState !== "not-found")
      throw new ServerServiceRefusedError(
        "A macOS definition or loaded job already exists; refusing to overwrite or adopt it.",
      );
    registration = {
      formatVersion: 1,
      state: "prepared",
      registrationId: id,
      registrationNonce: randomBytes(24).toString("hex"),
      manager: "launchd-agent",
      account,
      profileNamespace: profile,
      installPrefix: selected.prefix,
      nodeExecutable: realpathSync.native(process.execPath),
      entrypointRelative: "current/lib/server.cjs",
      configPath: options.config ? resolve(options.config) : null,
      definition: { locator: path, sha256: "0".repeat(64) },
      launcher: null,
    };
    registration.definition.sha256 = serviceDefinitionHash(renderServiceDefinition(registration));
    lock.assertHeld();
    writeServiceRegistration(registration);
  } else if (options.config && resolve(options.config) !== registration.configPath)
    throw new ServerServiceRefusedError("Recovery cannot retarget the prepared configuration.");
  qualifyServicePolicy(registration, deps);
  const preparedBytes = JSON.stringify(registration);
  const held = {
    assertHeld: () => {
      lock.assertHeld();
      if (JSON.stringify(readServiceRegistration(selected.prefix)) !== preparedBytes)
        throw new ServerServiceRefusedError(
          "Service registration changed during installation; no further effects were attempted.",
        );
    },
  };
  if (!existsSync(registration.definition.locator)) {
    if (
      readServiceManagerState(registration.registrationId, deps, registration).LoadState !==
      "not-found"
    )
      throw new ServerServiceRefusedError(
        "A loaded job exists without its saved definition; preserve it for inspection.",
      );
    held.assertHeld();
    mkdirSync(dirname(registration.definition.locator), { recursive: true, mode: 0o700 });
    held.assertHeld();
    writeFileSync(registration.definition.locator, renderServiceDefinition(registration), {
      flag: "wx",
      mode: 0o600,
    });
  }
  qualifyLoadedService(registration, deps);
  mutateServiceManager("enable", registration, held, deps);
  registration = { ...registration, state: "installed" };
  held.assertHeld();
  writeServiceRegistration(registration);
  return {
    state: "installed",
    registration,
    detail:
      "Enabled at macOS GUI login; not started. Use service start to load it now. A logged-in graphical user session is required; no root daemon or approval bypass was configured. Native enablement overrides are not exposed by the identity API.",
  };
}

export async function uninstallMacosService(
  registration: ServerServiceRegistration,
  options: ServiceCliOptions,
  lock: Pick<ServerUpgradeLock, "assertHeld">,
  deps: ServiceLifecycleDeps,
) {
  if (registration.state !== "installed" && !options.recover)
    throw new ServerServiceRefusedError(
      `Registration is ${registration.state}; inspect it and use explicit uninstall --recover.`,
    );
  const paths = resolveHostRootPaths(registration.profileNamespace);
  const initialBytes = JSON.stringify(registration);
  if (existsSync(registration.definition.locator)) {
    qualifyServiceDefinition(registration, deps);
    await stopRegisteredOwner(registration, lock, deps);
  } else {
    if (
      !options.recover ||
      readServiceManagerState(registration.registrationId, deps, registration).LoadState !==
        "not-found" ||
      (await (deps.probe ?? probeRunningOwner)(paths, { pinGeneration: true })) ||
      (deps.lease ?? probeLeaseKernelLock)(paths).state !== "free"
    )
      throw new ServerServiceRefusedError(
        "The saved macOS definition is absent and retirement is not proven; no metadata was removed.",
      );
  }
  lock.assertHeld();
  if (JSON.stringify(readServiceRegistration(registration.installPrefix)) !== initialBytes)
    throw new ServerServiceRefusedError(
      "Service registration changed during retirement; no further effects were attempted.",
    );
  registration = { ...registration, state: "removing" };
  writeServiceRegistration(registration);
  const bytes = JSON.stringify(registration);
  const held = {
    assertHeld: () => {
      lock.assertHeld();
      if (JSON.stringify(readServiceRegistration(registration.installPrefix)) !== bytes)
        throw new ServerServiceRefusedError(
          "Service registration changed during removal; no further effects were attempted.",
        );
    },
  };
  if (existsSync(registration.definition.locator)) {
    mutateServiceManager("disable", registration, held, deps);
    mutateServiceManager("remove", registration, held, deps);
    qualifyServiceDefinition(registration, deps);
  }
  if (
    readServiceManagerState(registration.registrationId, deps, registration).LoadState !==
    "not-found"
  )
    throw new ServerServiceRefusedError(
      "The macOS job reappeared; removing registration retained.",
    );
  if (existsSync(registration.definition.locator)) {
    held.assertHeld();
    unlinkSync(registration.definition.locator);
  }
  held.assertHeld();
  unlinkSync(join(registration.installPrefix, SERVER_SERVICE_REGISTRATION_FILE));
  return {
    state: "not-installed",
    detail:
      "Removed the registered macOS login agent; profile, history and installed releases remain.",
  };
}
