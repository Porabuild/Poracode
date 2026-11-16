import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createSecureContext } from "node:tls";
import { resolveHostRootPaths } from "@/backend/ownership/hostRootPaths";
import { HostOwnerLease } from "@/backend/ownership/hostOwnerLease";
import { inspectOwnedHostRootAdmission } from "@/backend/ownership/hostRootManifest";
import {
  readHostCredentialState,
  secretKeyFingerprint,
} from "@/backend/ownership/hostCredentialState";
import { probeLeaseKernelLock } from "./serverDoctorIo";
import { probeRunningOwner } from "./serverUpgradeIdentity";
import { macosServiceDefinitionPath } from "./macosServiceManager";
import { controlWindowsService } from "./windowsServiceManager";
import {
  readServiceManagerState,
  serviceDefinitionPath,
  serviceManagerContext,
  serviceManagerRun,
} from "./serverServiceManager";
import type { ServiceLifecycleDeps } from "./serverService";
import { serviceRegistrationId, type ServerServiceRegistration } from "./serverServiceRegistration";
import { readProfileSchemaVersion } from "./serverUpgradeSchema";
import { releaseNodeExecutable } from "./serverStandaloneRuntime";
import { parseCandidateMigrationPolicy } from "./serverUpgradeMigrationPolicy";
import {
  applyServeSettingsToEnv,
  defaultServerConfigPath,
  resolveServeSettings,
} from "./serverConfig";
import { resolveRemoteAccessBind } from "@/host/remote/config";
import { loadRemoteAccessTlsMaterial } from "@/host/remote/server/tlsMaterial";

function relevantServiceEnvironment(key: string): boolean {
  return (
    key.startsWith("PORACODE_REMOTE_") ||
    [
      "PORACODE_ALLOW_PLAINTEXT_LAN",
      "PORACODE_SECRET_STORAGE_KEY",
      "PORACODE_LOG_LEVEL",
      "PORACODE_SHUTDOWN_DRAIN_DEADLINE_MS",
    ].includes(key)
  );
}

/** Refuse before retiring the old service when the destination profile is in use. */
export async function assertServiceProfileAvailable(
  profile: string,
  account: ServerServiceRegistration["account"],
  releaseDir: string,
  deps: ServiceLifecycleDeps = {},
  options: { readonly allowRegistered?: boolean; readonly configPath?: string } = {},
): Promise<HostOwnerLease> {
  const paths = resolveHostRootPaths(profile);
  if (
    (await (deps.probe ?? probeRunningOwner)(paths)) ||
    (deps.lease ?? probeLeaseKernelLock)(paths).state !== "free"
  ) {
    throw new Error(
      `The destination profile ${profile} is in use. Stop its owner before moving the service; nothing was changed.`,
    );
  }
  const context = serviceManagerContext(deps);
  if (context.account.kind !== account.kind || context.account.id !== account.id) {
    throw new Error("The old service belongs to a different account; nothing was changed.");
  }
  const id = serviceRegistrationId(paths.profileNamespace, account);
  if (!options.allowRegistered && context.manager === "windows-task") {
    if (controlWindowsService("inspect", id, null, null, deps.windowsRun).task) {
      throw new Error(`A service already exists for ${profile}; nothing was changed.`);
    }
  } else if (!options.allowRegistered) {
    const definition =
      context.manager === "launchd-agent"
        ? macosServiceDefinitionPath(id, context.home)
        : serviceDefinitionPath(id, context.home);
    if (existsSync(definition) || readServiceManagerState(id, deps).LoadState !== "not-found") {
      throw new Error(`A service already exists for ${profile}; nothing was changed.`);
    }
  }
  const lease = HostOwnerLease.acquire(paths, "headless");
  try {
    const existing = inspectOwnedHostRootAdmission(paths);
    const serviceEnv: NodeJS.ProcessEnv = {
      PATH: process.env.PATH ?? "",
      HOME: context.home,
      PORACODE_BASE_DIR: profile,
    };
    if (context.manager === "systemd-user") {
      // systemd inherits its user-manager environment, not this CLI's shell.
      // Read only the variables relevant to startup; never log their values.
      for (const line of serviceManagerRun(["show-environment"], deps).split(/\r?\n/u)) {
        const index = line.indexOf("=");
        if (index < 1) continue;
        const key = line.slice(0, index);
        if (relevantServiceEnvironment(key)) serviceEnv[key] = line.slice(index + 1);
      }
    } else if (context.manager === "windows-task") {
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined && ["SystemRoot", "SYSTEMROOT", "USERPROFILE"].includes(key))
          serviceEnv[key] = value;
      }
    }
    const injectedKey = serviceEnv.PORACODE_SECRET_STORAGE_KEY?.trim();
    if (
      injectedKey !== undefined &&
      (Buffer.from(injectedKey, "base64").length !== 32 ||
        Buffer.from(injectedKey, "base64").toString("base64") !== injectedKey)
    ) {
      throw new Error("The service environment has an invalid credential key.");
    }
    const settings = resolveServeSettings({
      flags: options.configPath ? { config: options.configPath } : {},
      env: serviceEnv,
      defaultConfigPath: defaultServerConfigPath(profile),
    });
    applyServeSettingsToEnv(settings, serviceEnv);
    const bind = resolveRemoteAccessBind({ env: serviceEnv });
    if (bind.refusalReason)
      throw new Error(`The destination profile cannot start: ${bind.refusalReason}`);
    const tls = loadRemoteAccessTlsMaterial({ env: serviceEnv });
    if (tls) createSecureContext({ cert: tls.cert, key: tls.key });
    let output: string;
    try {
      output = execFileSync(
        releaseNodeExecutable(releaseDir),
        [join(releaseDir, "lib", "server.cjs"), "doctor", "--json"],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 120_000,
          env: serviceEnv,
        },
      );
    } catch (error) {
      if (!error || typeof error !== "object" || !("stdout" in error) || !error.stdout) throw error;
      output = String(error.stdout);
    }
    let report: unknown;
    try {
      report = JSON.parse(output);
    } catch {
      throw new Error("The destination release returned invalid diagnostic output.");
    }
    if (
      !report ||
      typeof report !== "object" ||
      !("checks" in report) ||
      !Array.isArray(report.checks) ||
      report.checks.length === 0 ||
      report.checks.some(
        (check: unknown) =>
          !check ||
          typeof check !== "object" ||
          !("status" in check) ||
          !["ok", "warn"].includes(String(check.status)),
      )
    ) {
      throw new Error(
        `The destination profile ${profile} failed candidate diagnostics; inspect it with poracode doctor before moving the service.`,
      );
    }
    const policy = "migrations" in report ? parseCandidateMigrationPolicy(report.migrations) : null;
    if (!policy)
      throw new Error("The destination release did not report a usable migration policy.");
    if (existing) {
      const state = readHostCredentialState(lease);
      if (!state || !["headless-file", "headless-environment"].includes(state.mode)) {
        throw new Error(
          `The destination profile ${profile} has credentials that need explicit activation for a headless service.`,
        );
      }
      const keyFiles = readdirSync(paths.dataRoot).filter((name) => name.startsWith("secret-key."));
      let key: string;
      if (state.mode === "headless-environment") {
        if (context.manager === "windows-task")
          throw new Error(
            "The destination uses an environment credential key, but the Windows task environment cannot be verified from this shell. Keep the existing profiles and install the destination service explicitly after checking the account environment.",
          );
        if (!injectedKey || keyFiles.length !== 0)
          throw new Error(
            "The destination profile requires its environment credential key without stored key files.",
          );
        key = injectedKey;
      } else {
        if (keyFiles.length !== 1 || keyFiles[0] !== "secret-key.headless")
          throw new Error(
            "The destination profile has missing or conflicting credential key files.",
          );
        const keyPath = join(paths.dataRoot, "secret-key.headless");
        const stat = lstatSync(keyPath);
        if (!stat.isFile() || stat.nlink !== 1 || stat.size > 16_384)
          throw new Error("The destination profile's credential key is not a safe file.");
        key = readFileSync(keyPath, "utf8").trim();
        if (injectedKey !== undefined && injectedKey !== key)
          throw new Error(
            "The service environment's credential key does not match the destination profile.",
          );
      }
      if (
        Buffer.from(key, "base64").length !== 32 ||
        Buffer.from(key, "base64").toString("base64") !== key ||
        secretKeyFingerprint(key) !== state.keyFingerprint
      ) {
        throw new Error(
          "The destination profile's credential key does not match its recorded state.",
        );
      }
      const schema = readProfileSchemaVersion(paths);
      if (schema !== null && schema !== policy.latestSchemaVersion) {
        throw new Error(
          `The destination profile ${profile} needs an explicit backup and upgrade before moving the service.`,
        );
      }
    }
    lease.assertActive();
    return lease;
  } catch (error) {
    lease.release();
    throw error;
  }
}
