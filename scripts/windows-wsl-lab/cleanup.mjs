import { copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import {
  SHUTDOWN_TIMEOUT_MS,
  TYPED_EXIT_CODES,
  UNREGISTER_TIMEOUT_MS,
  WSL_NO_DISTROS_EXIT,
} from "./constants.mjs";
import { LabError } from "./errors.mjs";
import { removeFirewallRule, wslconfigPath } from "./networking.mjs";
import { hasDistro } from "./pure.mjs";
import { runWsl, wslListDistros } from "./subprocess.mjs";

// ── Cleanup ─────────────────────────────────────────────────────────────────

export async function cleanup(options) {
  if (process.platform !== "win32") {
    throw new LabError(TYPED_EXIT_CODES.NOT_WINDOWS, "the Windows/WSL lab can only run on win32");
  }
  const stateDir = resolve(options.state);
  const manifestPath = join(stateDir, "run-manifest.json");
  if (!existsSync(manifestPath)) {
    throw new LabError(
      TYPED_EXIT_CODES.CLEANUP_FAILED,
      `no run manifest at ${manifestPath}; nothing this tool owns was found (refusing to guess)`,
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const log = (message) => process.stdout.write(`[wsl-lab:cleanup] ${message}\n`);

  let failed = 0;
  // Idempotence: a prior cleanup (or a provision rollback) may already have
  // removed a distro; a missing registration is a no-op, not a failure.
  let registered = null;
  try {
    registered = await wslListDistros(log);
  } catch {
    registered = null; // list unavailable — attempt unregisters anyway
  }
  // 1. Only distros this run imported are ever unregistered.
  for (const distro of manifest.distros ?? []) {
    if (!distro.importedByThisRun) {
      log(`distro "${distro.name}": not imported by this run; left untouched`);
      continue;
    }
    if (registered !== null && !hasDistro(registered, distro.name)) {
      log(`distro "${distro.name}": already unregistered`);
    } else {
      try {
        await runWsl(["--terminate", distro.name], {
          timeoutMs: UNREGISTER_TIMEOUT_MS,
          allowExitCodes: [0, WSL_NO_DISTROS_EXIT],
        });
        await runWsl(["--unregister", distro.name], { timeoutMs: UNREGISTER_TIMEOUT_MS });
        log(`distro "${distro.name}": unregistered`);
      } catch (error) {
        failed += 1;
        log(`distro "${distro.name}": unregister failed: ${String(error)}`);
      }
    }
    if (
      typeof distro.installDir === "string" &&
      isAbsolute(distro.installDir) &&
      existsSync(distro.installDir)
    ) {
      rmSync(distro.installDir, { recursive: true, force: true });
    }
  }

  // 2. Firewall rule this run added.
  if (manifest.firewallRuleName) await removeFirewallRule(log);

  // 3. Restore .wslconfig from its persistent backup (or delete ours).
  if (manifest.wslconfigBackupPath && existsSync(manifest.wslconfigBackupPath)) {
    const backup = manifest.wslconfigBackupPath;
    if (readFileSync(backup, "utf8").length === 0) {
      rmSync(wslconfigPath(), { force: true });
      log(".wslconfig: removed (host had none before the lab)");
    } else {
      copyFileSync(backup, wslconfigPath());
      log(".wslconfig: restored from backup");
    }
    rmSync(backup, { force: true });
    if (manifest.modeChanged) {
      try {
        await runWsl(["--shutdown"], { timeoutMs: SHUTDOWN_TIMEOUT_MS });
      } catch (error) {
        log(`wsl --shutdown after restore failed (best effort): ${String(error)}`);
      }
    }
  }

  // 4. State (keys, rootfs cache, distro disks) goes last.
  rmSync(stateDir, { recursive: true, force: true });
  log(`state removed: ${stateDir}`);

  if (failed > 0) {
    throw new LabError(
      TYPED_EXIT_CODES.CLEANUP_FAILED,
      `${failed} distro(s) could not be unregistered; remove them manually with wsl --unregister`,
    );
  }
}
