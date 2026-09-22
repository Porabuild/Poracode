import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  EXEC_TIMEOUT_MS,
  FIREWALL_RULE_NAME,
  IMPORT_TIMEOUT_MS,
  LAB_SCHEMA,
  PRIMARY_DISTRO,
  SECONDARY_DISTRO,
  TYPED_EXIT_CODES,
  UNREGISTER_TIMEOUT_MS,
  WSL_NO_DISTROS_EXIT,
} from "./constants.mjs";
import { LabError } from "./errors.mjs";
import { addFirewallRule, applyNetworkingMode, probeDistroNetworkingMode } from "./networking.mjs";
import {
  assertDistroNameSafe,
  decodeWslOutput,
  hasDistro,
  parseOsReleaseField,
  redactPrivateMaterial,
} from "./pure.mjs";
import { ensureRootfs } from "./rootfs.mjs";
import { configureDistroSshd } from "./sshd.mjs";
import { runWsl, wslListDistros } from "./subprocess.mjs";

// ── Provision ───────────────────────────────────────────────────────────────

async function importDistro(name, installDir, rootfsPath) {
  try {
    await runWsl(["--import", name, installDir, rootfsPath, "--version", "2"], {
      timeoutMs: IMPORT_TIMEOUT_MS,
    });
  } catch (error) {
    // WSL builds without per-distro version selection still import fine.
    if (!String(error).includes("--version")) throw error;
    await runWsl(["--import", name, installDir, rootfsPath], { timeoutMs: IMPORT_TIMEOUT_MS });
  }
}

export async function provision(options) {
  if (process.platform !== "win32") {
    throw new LabError(
      TYPED_EXIT_CODES.NOT_WINDOWS,
      "the Windows/WSL lab can only run on win32 (this lane qualifies real WSL2 behavior)",
    );
  }
  assertDistroNameSafe(PRIMARY_DISTRO);
  assertDistroNameSafe(SECONDARY_DISTRO);

  const evidenceDir = resolve(options.out);
  const stateDir = resolve(options.state);
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(stateDir, { recursive: true });
  const keysDir = join(stateDir, "keys");
  mkdirSync(keysDir, { recursive: true });

  const runId = `${new Date().toISOString().replace(/[:.]/gu, "-")}-${randomUUID().slice(0, 8)}`;
  const startedAt = new Date().toISOString();
  const logLines = [];
  const log = (message) => {
    const safe = redactPrivateMaterial(message, [keysDir]);
    logLines.push(`[${new Date().toISOString()}] ${safe}`);
    process.stdout.write(`[wsl-lab] ${safe}\n`);
  };
  const checks = [];
  const record = async (name, fn) => {
    const started = Date.now();
    try {
      const detail = await fn();
      checks.push({
        name,
        ok: true,
        ms: Date.now() - started,
        ...(detail !== undefined ? { detail } : {}),
      });
      log(`check ok ${name} (${Date.now() - started}ms)`);
      return detail;
    } catch (error) {
      checks.push({
        name,
        ok: false,
        ms: Date.now() - started,
        error: redactPrivateMaterial(String(error instanceof Error ? error.message : error), [
          keysDir,
        ]),
      });
      throw error;
    }
  };

  const distros = [];
  const ownedImported = [];
  let firewallRuleName = null;

  const writeEvidence = (failure) => {
    const lab = {
      schema: LAB_SCHEMA,
      runId,
      startedAt,
      finishedAt: new Date().toISOString(),
      host: { platform: process.platform, wslVersion: "" },
      mode: options.mode,
      modeChanged: false,
      evidenceDir,
      stateDir,
      distros,
      sshd: { configured: false, ports: {} },
      firewall: { ruleName: firewallRuleName, ruleAdded: firewallRuleName !== null },
      reachabilityPort: options.reachabilityPort,
      checks,
      ...(failure !== undefined ? { failure } : {}),
    };
    writeJson(join(evidenceDir, "lab.json"), lab);
    writeFileSync(join(evidenceDir, "lab.log"), `${logLines.join("\n")}\n`, "utf8");
    return lab;
  };

  const rollbackImported = async () => {
    for (const name of ownedImported) {
      log(`rollback: unregistering ${name}`);
      try {
        await runWsl(["--unregister", name], { timeoutMs: UNREGISTER_TIMEOUT_MS });
      } catch (error) {
        log(`rollback: unregister ${name} failed (best effort): ${String(error)}`);
      }
    }
  };

  // The manifest is persisted as soon as anything cleanup must own exists —
  // before the mode change, not only on success — so a provision failure can
  // never leave the host's .wslconfig altered with nothing to restore from.
  const persistManifest = (networking) => {
    writeJson(join(stateDir, "run-manifest.json"), {
      schema: LAB_SCHEMA,
      runId,
      mode: options.mode,
      modeChanged: networking?.changed ?? false,
      wslconfigBackupPath:
        networking && existsSync(networking.backupPath) ? networking.backupPath : null,
      distros: distros.map((distro) => ({
        name: distro.name,
        importedByThisRun: distro.importedByThisRun,
        installDir: distro.installDir,
      })),
      firewallRuleName,
      evidenceDir,
    });
  };

  try {
    // 1. WSL presence + version evidence.
    let wslVersion = "";
    await record("wsl-present", async () => {
      try {
        const version = await runWsl(["--version"], {
          timeoutMs: 60_000,
          allowExitCodes: [0, WSL_NO_DISTROS_EXIT],
        });
        wslVersion = decodeWslOutput(version.stdout).split(/\r?\n/u)[0]?.trim() ?? "";
      } catch {
        throw new LabError(
          TYPED_EXIT_CODES.WSL_MISSING,
          "wsl.exe could not be executed; WSL2 must be installed on this host",
        );
      }
      log(`wsl: ${wslVersion}`);
      return { version: wslVersion };
    });

    // 2. Rootfs (cached in the state dir across runs).
    const rootfs = await record("rootfs-acquired", () => ensureRootfs(options, stateDir, log));

    // 3. Import (or reuse) both distros.
    const registered = await wslListDistros(log);
    const distroPlans = [
      { name: PRIMARY_DISTRO, role: "primary" },
      { name: SECONDARY_DISTRO, role: "secondary" },
    ];
    for (const plan of distroPlans) {
      assertDistroNameSafe(plan.name);
      const importedByThisRun = !hasDistro(registered, plan.name);
      const installDir = join(
        stateDir,
        "distros",
        Buffer.from(plan.name, "utf8").toString("hex").slice(0, 24),
      );
      if (importedByThisRun) {
        mkdirSync(installDir, { recursive: true });
        log(`distro "${plan.name}": importing from rootfs (this can take a few minutes)`);
        await record(`distro-imported:${plan.role}`, () =>
          importDistro(plan.name, installDir, rootfs.path),
        );
        ownedImported.push(plan.name);
      } else {
        log(`distro "${plan.name}": already registered; reusing (cleanup will not remove it)`);
      }
      distros.push({ name: plan.name, role: plan.role, importedByThisRun, installDir });
    }
    persistManifest(null);

    // 4. Networking mode (after imports; a mode change shuts WSL down once).
    const networking = await record(`mode-applied:${options.mode}`, () =>
      applyNetworkingMode(options.mode, log, (ownership) => persistManifest(ownership)),
    );
    persistManifest(networking);

    // 5. Per-distro validation: boot, Ubuntu 24.04, arch.
    for (const distro of distros) {
      await record(`os-release:${distro.role}`, async () => {
        const result = await runWsl(["-d", distro.name, "--exec", "cat", "/etc/os-release"], {
          timeoutMs: EXEC_TIMEOUT_MS,
        });
        const release = parseOsReleaseField(decodeWslOutput(result.stdout), "VERSION_ID");
        if (release === null || !release.startsWith("24.04")) {
          throw new LabError(
            TYPED_EXIT_CODES.PROVISION_FAILED,
            `distro "${distro.name}" is not Ubuntu 24.04 (VERSION_ID=${String(release)})`,
          );
        }
        distro.osRelease = release;
        return { osRelease: release };
      });
      await record(`arch:${distro.role}`, async () => {
        const result = await runWsl(["-d", distro.name, "--exec", "uname", "-m"], {
          timeoutMs: EXEC_TIMEOUT_MS,
        });
        const arch = decodeWslOutput(result.stdout).trim();
        if (arch !== "x86_64" && arch !== "aarch64") {
          throw new LabError(
            TYPED_EXIT_CODES.PROVISION_FAILED,
            `distro "${distro.name}" reported unexpected architecture "${arch}"`,
          );
        }
        distro.arch = arch === "x86_64" ? "x64" : "arm64";
        return { arch: distro.arch };
      });
    }

    // 6. The declared networking mode must actually be live.
    await record(`mode-live:${options.mode}`, async () => {
      const live = await probeDistroNetworkingMode(PRIMARY_DISTRO);
      if (live !== options.mode) {
        throw new LabError(
          TYPED_EXIT_CODES.PROVISION_FAILED,
          `distro reports networking mode "${live}" but the lab required "${options.mode}"`,
        );
      }
      return { live };
    });

    // 7. Guest→host ingress rule: only NAT needs it (mirrored reaches the host
    // over loopback). A failure here must fail the lab, not silently weaken it.
    if (options.mode === "nat" && options.guestIngress) {
      await record("firewall-rule-added", () => addFirewallRule(options.reachabilityPort, log));
      firewallRuleName = FIREWALL_RULE_NAME;
      persistManifest(networking);
    } else if (options.mode === "nat") {
      log("firewall: --no-guest-ingress given; the suite will refuse the NAT reachability check");
    }

    // 8. sshd with an ephemeral key, one port per distro (both distros bind
    // the same loopback relay in NAT and share ports in mirrored mode, so a
    // single port for both would collide).
    const sshd = { configured: false, ports: {} };
    if (options.withSshd) {
      for (const [index, distro] of distros.entries()) {
        const port = options.sshdPort + index;
        const configured = await record(`sshd-configured:${distro.role}`, () =>
          configureDistroSshd(distro.name, port, keysDir, log),
        );
        sshd.ports[distro.name] = port;
        if (index === 0) {
          sshd.port = configured.port;
          sshd.fingerprint = configured.fingerprint;
          sshd.keyFileName = configured.keyFileName;
        }
      }
      sshd.configured = true;
    }

    // 9. Evidence + manifest.
    const lab = writeEvidence();
    lab.modeChanged = networking.changed;
    lab.host.wslVersion = wslVersion;
    lab.sshd = sshd;
    writeJson(join(evidenceDir, "lab.json"), lab);
    persistManifest(networking);
    log(`lab ready: ${join(evidenceDir, "lab.json")}`);
    return lab;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeEvidence(redactPrivateMaterial(message, [keysDir]));
    await rollbackImported();
    throw error;
  }
}

// ── Shared write helper ─────────────────────────────────────────────────────

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
