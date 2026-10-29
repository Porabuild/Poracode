import { readHostOwnerRecord } from "@/backend/ownership/hostOwnerLease";
import { callHostControl } from "@/backend/ownership/hostControlClient";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { probeLeaseKernelLock } from "./serverDoctorIo";
import {
  qualifyRegisteredOwner,
  startRegisteredService,
  stopRegisteredOwner,
  type ServiceLifecycleDeps,
} from "./serverService";
import { qualifyLoadedService, serviceManagerContext } from "./serverServiceManager";
import {
  assertServiceRegistrationScope,
  readInstalledServiceRelease,
  readServiceRegistration,
  ServerServiceRefusedError,
} from "./serverServiceRegistration";
import type { ServerUpgradeLock } from "./serverUpgradeLock";
import type { UpgradeIo } from "./serverUpgradeContract";
import { probeRunningOwner } from "./serverUpgradeIdentity";

/** Optional registration changes only this prefix's upgrade IO. Legacy absence
 * returns the original IO untouched, including shipped-systemd/direct behavior. */
export async function registeredServiceUpgradeIo(
  io: UpgradeIo,
  prefix: string,
  profile: string,
  lock: Pick<ServerUpgradeLock, "assertHeld">,
  deps: ServiceLifecycleDeps = {},
): Promise<UpgradeIo> {
  const registration = readServiceRegistration(prefix);
  if (!registration) return io;
  const context = serviceManagerContext(deps);
  const paths = resolveHostRootPaths(profile);
  const probe = () => (deps.probe ?? probeRunningOwner)(paths, { pinGeneration: true });
  assertServiceRegistrationScope(registration, {
    prefix,
    profileNamespace: paths.profileNamespace,
    account: context.account,
  });
  if (registration.state !== "installed")
    throw new ServerServiceRefusedError(
      "Finish prepared/removing service recovery before upgrading this prefix.",
    );
  let selected = readInstalledServiceRelease(prefix);
  const registrationBytes = JSON.stringify(registration);
  const guard = () => {
    lock.assertHeld();
    if (JSON.stringify(readServiceRegistration(prefix)) !== registrationBytes)
      throw new ServerServiceRefusedError(
        "Service registration changed during upgrade; refusing further effects.",
      );
    if (JSON.stringify(readInstalledServiceRelease(prefix)) !== JSON.stringify(selected))
      throw new ServerServiceRefusedError(
        "The selected installed current target changed outside this upgrade.",
      );
    qualifyLoadedService(registration, deps);
  };
  const held = { assertHeld: guard };
  const assertRetired = () => {
    guard();
    const record = (deps.readOwner ?? readHostOwnerRecord)(paths);
    const native = qualifyLoadedService(registration, deps);
    if (
      (deps.lease ?? probeLeaseKernelLock)(paths, record?.pid).state !== "free" ||
      native.MainPID !== "0" ||
      !["inactive", "failed"].includes(native.ActiveState!)
    )
      throw new ServerServiceRefusedError(
        "Registered owner/process/lease retirement is unconfirmed; refusing current swap or rollback.",
      );
  };
  guard();
  const initialOwner = await probe();
  if (initialOwner) {
    qualifyRegisteredOwner(registration, initialOwner);
    if (qualifyLoadedService(registration, deps).MainPID !== String(initialOwner.pid))
      throw new ServerServiceRefusedError(
        "The running owner is outside the registered service; refusing to adopt it for upgrade.",
      );
  } else assertRetired();
  return {
    ...io,
    stage: (tarball, releaseDir) => {
      guard();
      io.stage(tarball, releaseDir);
    },
    probeOwner: async () => {
      guard();
      const owner = await probe();
      if (owner) qualifyRegisteredOwner(registration, owner);
      return owner;
    },
    stopOwner: async (targetPrefix, owner) => {
      if (targetPrefix !== prefix)
        throw new ServerServiceRefusedError("Upgrade attempted a different service prefix.");
      guard();
      await stopRegisteredOwner(registration, held, deps, owner);
    },
    writeCurrent: (targetPrefix, releaseDir) => {
      if (targetPrefix !== prefix)
        throw new ServerServiceRefusedError("Upgrade attempted a different service prefix.");
      assertRetired();
      io.writeCurrent(targetPrefix, releaseDir);
      selected = readInstalledServiceRelease(prefix);
    },
    removeCurrent: () => {
      throw new ServerServiceRefusedError(
        "A registered installed service must retain its current release; resolve recovery explicitly.",
      );
    },
    startCandidate: async ({ prefix: targetPrefix }) => {
      if (targetPrefix !== prefix)
        throw new ServerServiceRefusedError("Upgrade attempted a different service prefix.");
      guard();
      await startRegisteredService(registration, held, deps, false);
      // Candidate readiness/admission still belongs to the existing upgrader.
      return {
        child: null,
        target: { kind: "registered", registrationId: registration.registrationId, prefix },
      };
    },
    candidateStatus: async () => {
      guard();
      const owner = await probe();
      if (!owner?.status)
        throw new ServerServiceRefusedError(
          "The registered candidate has not published authenticated status.",
        );
      qualifyRegisteredOwner(registration, owner);
      if (qualifyLoadedService(registration, deps).MainPID !== String(owner.pid))
        throw new ServerServiceRefusedError(
          "The candidate is outside the registered main process.",
        );
      return { ownerGeneration: owner.generation, status: owner.status };
    },
    admitCandidate: async (expected) => {
      guard();
      const owner = await probe();
      if (!owner?.status)
        throw new ServerServiceRefusedError(
          "The registered candidate disappeared before admission.",
        );
      qualifyRegisteredOwner(registration, owner);
      if (
        expected.version !== selected.build.version ||
        expected.entrypointSha256 !== selected.build.entrypointSha256 ||
        qualifyLoadedService(registration, deps).MainPID !== String(owner.pid)
      )
        throw new ServerServiceRefusedError("Registered candidate admission identity changed.");
      guard();
      const reply = await callHostControl(paths, "admit", {
        timeoutMs: 5_000,
        expectedGeneration: owner.generation,
        payload: {
          expectedVersion: expected.version,
          expectedEntrypointSha256: expected.entrypointSha256,
        },
      });
      return { ownerGeneration: reply.ownerGeneration, status: reply.result };
    },
    stopCandidate: async () => {
      guard();
      await stopRegisteredOwner(registration, held, deps);
    },
  };
}
