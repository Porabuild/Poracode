import { randomBytes } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { probeLeaseKernelLock } from "./serverDoctorIo";
import {
  stopRegisteredOwner,
  qualifyRegisteredOwner,
  type ServiceCliOptions,
  type ServiceLifecycleDeps,
} from "./serverService";
import { readServiceLauncher } from "./serverServiceLauncher";
import {
  mutateServiceManager,
  qualifyLoadedService,
  qualifyServiceDefinition,
  qualifyServicePolicy,
  renderServiceDefinition,
  serviceDefinitionHash,
} from "./serverServiceManager";
import {
  SERVER_SERVICE_REGISTRATION_FILE,
  ServerServiceRefusedError,
  serviceRegistrationId,
  writeServiceRegistration,
  windowsServiceRegistrationSchema,
  readInstalledServiceRelease,
  readServiceRegistration,
  type WindowsServiceRegistration,
} from "./serverServiceRegistration";
import { probeRunningOwner } from "./serverUpgradeIdentity";
import type { ServerUpgradeLock } from "./serverUpgradeLock";
import { controlWindowsService, qualifyWindowsServiceLauncher } from "./windowsServiceManager";

export function installWindowsService(
  selected: ReturnType<typeof readInstalledServiceRelease>,
  profile: string,
  account: WindowsServiceRegistration["account"],
  options: ServiceCliOptions,
  existing: WindowsServiceRegistration | null,
  lock: Pick<ServerUpgradeLock, "assertHeld">,
  deps: ServiceLifecycleDeps,
) {
  if (existing && (!options.recover || existing.state !== "prepared"))
    throw new ServerServiceRefusedError(
      "This prefix already has a registration. Only a prepared registration can be completed with install --recover; uninstall explicitly to change configuration.",
    );
  let registration = existing;
  if (!registration) {
    if (options.recover)
      throw new ServerServiceRefusedError("No prepared registration exists to recover.");
    const id = serviceRegistrationId(profile, account);
    const native = controlWindowsService("inspect", id, null, null, deps.windowsRun);
    if (
      native.account.sid !== account.id ||
      native.task ||
      existsSync(join(selected.prefix, "service-definition-v1.json")) ||
      existsSync(join(selected.prefix, "service-launcher-v1.exe"))
    )
      throw new ServerServiceRefusedError(
        "A native task, definition or launcher with this identity already exists; refusing to overwrite/adopt it.",
      );
    const artifact = readServiceLauncher(selected.releaseDir);
    registration = windowsServiceRegistrationSchema.parse({
      formatVersion: 2,
      state: "prepared",
      registrationId: id,
      registrationNonce: randomBytes(24).toString("hex"),
      manager: "windows-task",
      account,
      profileNamespace: profile,
      installPrefix: selected.prefix,
      nodeExecutable: realpathSync.native(process.execPath),
      entrypointRelative: "current/lib/server.cjs",
      configPath: options.config ? resolve(options.config) : null,
      definition: {
        locator: join(selected.prefix, "service-definition-v1.json"),
        sha256: "0".repeat(64),
      },
      launcher: {
        protocolVersion: 1,
        relativePath: "service-launcher-v1.exe",
        bytes: artifact.artifact.bytes,
        sha256: artifact.artifact.sha256,
      },
    });
    registration.definition.sha256 = serviceDefinitionHash(renderServiceDefinition(registration));
    lock.assertHeld();
    writeServiceRegistration(registration);
  } else if (options.config && resolve(options.config) !== registration.configPath)
    throw new ServerServiceRefusedError("Recovery cannot retarget the prepared configuration.");
  qualifyServicePolicy(registration, deps);
  const helper = join(selected.prefix, registration.launcher.relativePath);
  if (!existsSync(helper)) {
    const artifact = readServiceLauncher(selected.releaseDir);
    if (
      artifact.artifact.sha256 !== registration.launcher.sha256 ||
      artifact.artifact.bytes !== registration.launcher.bytes
    )
      throw new ServerServiceRefusedError(
        "The selected release cannot restore the exact prepared launcher; preserve the registration and use its matching release.",
      );
    lock.assertHeld();
    writeFileSync(helper, artifact.bytes, { flag: "wx" });
  }
  qualifyWindowsServiceLauncher(registration);
  if (!existsSync(registration.definition.locator)) {
    lock.assertHeld();
    writeFileSync(registration.definition.locator, renderServiceDefinition(registration), {
      flag: "wx",
    });
  }
  qualifyServiceDefinition(registration, deps);
  mutateServiceManager("register", registration, lock, deps);
  mutateServiceManager("enable", registration, lock, deps);
  if (qualifyLoadedService(registration, deps).UnitFileState !== "enabled")
    throw new ServerServiceRefusedError(
      "Task enablement was not confirmed; prepared registration retained for explicit recovery.",
    );
  registration = { ...registration, state: "installed" };
  lock.assertHeld();
  writeServiceRegistration(registration);
  return {
    state: "installed",
    registration,
    detail:
      "Enabled at logon for this Windows user; not started. It requires an interactive user session, not an unattended boot service. No password or elevation was configured.",
  };
}

export async function uninstallWindowsService(
  registration: WindowsServiceRegistration,
  options: ServiceCliOptions,
  lock: Pick<ServerUpgradeLock, "assertHeld">,
  deps: ServiceLifecycleDeps,
) {
  if (registration.state !== "installed" && !options.recover)
    throw new ServerServiceRefusedError(
      `Registration is ${registration.state}; inspect it and use explicit uninstall --recover.`,
    );
  const selected = readInstalledServiceRelease(registration.installPrefix);
  lock.assertHeld();
  const native = controlWindowsService(
    "inspect",
    registration.registrationId,
    registration,
    selected.releaseDir,
    deps.windowsRun,
  );
  const paths = resolveHostRootPaths(registration.profileNamespace);
  const owner = await (deps.probe ?? probeRunningOwner)(paths, { pinGeneration: true });
  lock.assertHeld();
  if (owner) {
    qualifyRegisteredOwner(registration, owner);
    if (native.task?.hostPid !== owner.pid)
      throw new ServerServiceRefusedError(
        "The authenticated owner is outside the registered task; no owner or native task was adopted.",
      );
  }
  if (!native.task && (owner || (deps.lease ?? probeLeaseKernelLock)(paths).state !== "free"))
    throw new ServerServiceRefusedError(
      "An owner/lease remains outside the absent task; no metadata was removed.",
    );
  if (existsSync(join(registration.installPrefix, registration.launcher.relativePath)))
    qualifyWindowsServiceLauncher(registration);
  else if (native.task)
    throw new ServerServiceRefusedError(
      "The registered launcher is missing. Recover the exact prepared launcher before removing this native task.",
    );
  if (native.task && !existsSync(registration.definition.locator)) {
    if (!options.recover)
      throw new ServerServiceRefusedError(
        "The service definition is absent; inspect and use explicit uninstall --recover.",
      );
    lock.assertHeld();
    writeFileSync(registration.definition.locator, renderServiceDefinition(registration), {
      flag: "wx",
    });
  }
  if (existsSync(registration.definition.locator)) {
    // A prepared registration may have no launcher yet. Validate the declared
    // definition bytes without claiming missing binary custody for native effects.
    lock.assertHeld();
    if (
      !lstatSync(registration.definition.locator).isFile() ||
      serviceDefinitionHash(readFileSync(registration.definition.locator, "utf8")) !==
        registration.definition.sha256
    )
      throw new ServerServiceRefusedError(
        "The saved service definition was changed; preserve it for inspection.",
      );
  }
  registration = { ...registration, state: "removing" };
  lock.assertHeld();
  writeServiceRegistration(registration);
  const removingBytes = JSON.stringify(registration);
  const held = {
    assertHeld: () => {
      lock.assertHeld();
      if (JSON.stringify(readServiceRegistration(registration.installPrefix)) !== removingBytes)
        throw new ServerServiceRefusedError(
          "Service registration changed during removal; no further effects were attempted.",
        );
    },
  };
  if (native.task) {
    mutateServiceManager("disable", registration, held, deps);
    await stopRegisteredOwner(registration, held, deps, owner ?? undefined);
    mutateServiceManager("remove", registration, held, deps);
  }
  const after = controlWindowsService(
    "inspect",
    registration.registrationId,
    registration,
    selected.releaseDir,
    deps.windowsRun,
  );
  if (after.task)
    throw new ServerServiceRefusedError(
      "The native task reappeared; removing registration retained.",
    );
  if (existsSync(join(registration.installPrefix, registration.launcher.relativePath)))
    qualifyWindowsServiceLauncher(registration);
  if (
    existsSync(registration.definition.locator) &&
    (!lstatSync(registration.definition.locator).isFile() ||
      serviceDefinitionHash(readFileSync(registration.definition.locator, "utf8")) !==
        registration.definition.sha256)
  )
    throw new ServerServiceRefusedError(
      "The service definition changed during removal; no files were removed.",
    );
  for (const path of [
    join(registration.installPrefix, registration.launcher.relativePath),
    registration.definition.locator,
    join(registration.installPrefix, SERVER_SERVICE_REGISTRATION_FILE),
  ]) {
    if (existsSync(path)) {
      held.assertHeld();
      unlinkSync(path);
    }
  }
  return {
    state: "not-installed",
    detail:
      "Removed the registered Windows task and launcher; profile, history and installed releases remain.",
  };
}
