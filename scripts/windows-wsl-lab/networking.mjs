import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  EXEC_TIMEOUT_MS,
  FIREWALL_RULE_NAME,
  SHUTDOWN_TIMEOUT_MS,
  TYPED_EXIT_CODES,
  WSLCONFIG_BACKUP_NAME,
} from "./constants.mjs";
import { LabError } from "./errors.mjs";
import { buildWslconfig, decodeWslOutput, normalizeNetworkingMode } from "./pure.mjs";
import { runBounded, runWsl, systemCommand } from "./subprocess.mjs";

// ── Networking mode ownership ───────────────────────────────────────────────

export function wslconfigPath() {
  const home = process.env.USERPROFILE ?? process.env.HOME;
  if (!home) throw new LabError(TYPED_EXIT_CODES.PROVISION_FAILED, "cannot resolve USERPROFILE");
  return join(home, ".wslconfig");
}

export async function applyNetworkingMode(mode, log, onOwnership = () => undefined) {
  const configPath = wslconfigPath();
  const backupPath = join(dirname(configPath), WSLCONFIG_BACKUP_NAME);
  const existing = existsSync(configPath) ? readFileSync(configPath, "utf8") : null;
  const plan = buildWslconfig(mode, existing);

  if (plan.changed) {
    // The backup is persistent (next to the config, not in the state dir) so
    // repeated lab runs can never lose the host's original settings.
    if (!existsSync(backupPath)) {
      writeFileSync(backupPath, existing ?? "");
      log(`.wslconfig: original backed up to ${WSLCONFIG_BACKUP_NAME}`);
    }
    // Persist cleanup ownership before the first host mutation. If the write
    // or following WSL shutdown fails, the workflow's always-run cleanup can
    // still restore the original file.
    onOwnership({ changed: true, backupPath });
    if (plan.content === null) rmSync(configPath, { force: true });
    else writeFileSync(configPath, plan.content);
    log(`.wslconfig: wrote ${mode} mode; shutting WSL down to apply`);
    await runWsl(["--shutdown"], { timeoutMs: SHUTDOWN_TIMEOUT_MS });
  } else {
    log(`.wslconfig: already in ${mode} mode (no change)`);
  }
  return { changed: plan.changed, backupPath };
}

export async function probeDistroNetworkingMode(distro) {
  // wslinfo exists on WSL >= 2.0; --exec keeps this shell-free.
  try {
    const result = await runWsl(["-d", distro, "--exec", "wslinfo", "--networking-mode"], {
      timeoutMs: EXEC_TIMEOUT_MS,
    });
    return normalizeNetworkingMode(decodeWslOutput(result.stdout));
  } catch {
    try {
      const result = await runWsl(["-d", distro, "--exec", "ip", "route", "show", "default"], {
        timeoutMs: EXEC_TIMEOUT_MS,
      });
      return decodeWslOutput(result.stdout).includes("default via") ? "nat" : "unknown";
    } catch {
      return "unknown";
    }
  }
}

// ── Firewall (NAT guest→host ingress only) ──────────────────────────────────

export async function addFirewallRule(port, log) {
  await runBounded(
    systemCommand("netsh.exe"),
    [
      "advfirewall",
      "firewall",
      "add",
      "rule",
      `name=${FIREWALL_RULE_NAME}`,
      "dir=in",
      "action=allow",
      "protocol=TCP",
      `localport=${port}`,
    ],
    { timeoutMs: 60_000, label: "netsh advfirewall add rule" },
  );
  log(`firewall: allowed inbound TCP ${port} (${FIREWALL_RULE_NAME})`);
}

export async function removeFirewallRule(log) {
  try {
    await runBounded(
      systemCommand("netsh.exe"),
      ["advfirewall", "firewall", "delete", "rule", `name=${FIREWALL_RULE_NAME}`],
      { timeoutMs: 60_000, label: "netsh advfirewall delete rule" },
    );
    log("firewall: lab rule removed");
  } catch (error) {
    log(`firewall: rule removal failed (best effort): ${String(error)}`);
  }
}
