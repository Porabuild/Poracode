#!/usr/bin/env node
/**
 * CI lab for real Windows/WSL qualification: provisions and validates two WSL2
 * distros, optionally configures an in-distro sshd with an ephemeral key, and
 * emits a redacted lab manifest that `tests/real-wsl/` consumes.
 *
 * Modes:
 *   node scripts/ci-windows-wsl-lab.mjs provision --mode <nat|mirrored> [--with-sshd] \
 *        [--out <evidenceDir>] [--state <stateDir>]
 *   node scripts/ci-windows-wsl-lab.mjs cleanup --state <stateDir>
 *
 * Safety rules enforced throughout:
 * - No shell interpolation anywhere: every subprocess is spawned with an argv
 *   array (`shell: false`), and in-distro scripting goes through a constant
 *   POSIX script on stdin whose data arrives as positional parameters, never
 *   inside the script text.
 * - Every subprocess is bounded by a deadline; on expiry the Windows process
 *   tree is killed via `taskkill /T /F` (itself bounded), and a hard fallback
 *   rejects even if the killed process never reaps.
 * - The private key never enters a log line, a captured subprocess output
 *   snippet, or the evidence JSON: outputs are scrubbed through
 *   `redactPrivateMaterial` and the evidence stores fingerprints only.
 * - Cleanup unregisters only distros this run imported (recorded in the run
 *   manifest) and restores `.wslconfig` from its persistent backup.
 *
 * The lab manifest schema is `poracode-windows-wsl-lab/1`. The implementation
 * lives in the modules under `scripts/windows-wsl-lab/`; this entrypoint
 * re-exports the public surface and hosts `main`.
 */

import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { cleanup } from "./windows-wsl-lab/cleanup.mjs";
import { TYPED_EXIT_CODES } from "./windows-wsl-lab/constants.mjs";
import { LabError } from "./windows-wsl-lab/errors.mjs";
import { parseArgv, redactPrivateMaterial } from "./windows-wsl-lab/pure.mjs";
import { provision } from "./windows-wsl-lab/provision.mjs";

export {
  DEFAULT_REACHABILITY_PORT,
  DEFAULT_SSHD_PORT,
  FIREWALL_RULE_NAME,
  LAB_SCHEMA,
  MAX_ROOTFS_BYTES,
  PRIMARY_DISTRO,
  ROOTFS_CACHE_NAME,
  SECONDARY_DISTRO,
  TYPED_EXIT_CODES,
  UBUNTU_24_04_ROOTFS_URL,
  WSLCONFIG_BACKUP_NAME,
} from "./windows-wsl-lab/constants.mjs";
export { LabError, SubprocessError, UsageError } from "./windows-wsl-lab/errors.mjs";
export {
  assertDistroNameSafe,
  buildWslconfig,
  computeTaskkillArgs,
  decodeWslOutput,
  hasDistro,
  normalizeNetworkingMode,
  parseArgv,
  parseDistroList,
  parseOsReleaseField,
  redactPrivateMaterial,
  validateLabJson,
} from "./windows-wsl-lab/pure.mjs";
export { runBounded } from "./windows-wsl-lab/subprocess.mjs";
export {
  SSHD_CONFIGURE_SCRIPT,
  SSHD_INSTALL_SCRIPT,
  buildSshProbeArgs,
  isPublicKeyLine,
} from "./windows-wsl-lab/sshd.mjs";

export async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgv(argv);
  } catch (error) {
    process.stderr.write(`[wsl-lab] ${error instanceof Error ? error.message : String(error)}\n`);
    return TYPED_EXIT_CODES.USAGE;
  }
  if (options.command === "help") {
    process.stdout.write(
      "usage:\n" +
        "  node scripts/ci-windows-wsl-lab.mjs provision --mode <nat|mirrored> [--with-sshd]\n" +
        "       [--out <evidenceDir>] [--state <stateDir>] [--rootfs <path|url>]\n" +
        "       [--rootfs-sha256 <hex>] [--sshd-port <n>] [--reachability-port <n>]\n" +
        "       [--no-guest-ingress]\n" +
        "  node scripts/ci-windows-wsl-lab.mjs cleanup --state <stateDir>\n",
    );
    return TYPED_EXIT_CODES.OK;
  }
  try {
    if (options.command === "provision") await provision(options);
    else await cleanup(options);
    return TYPED_EXIT_CODES.OK;
  } catch (error) {
    const code = error instanceof LabError ? error.code : TYPED_EXIT_CODES.PROVISION_FAILED;
    const keysDir = join(resolve(options.state), "keys");
    const message = redactPrivateMaterial(error instanceof Error ? error.message : String(error), [
      keysDir,
    ]);
    process.stderr.write(`[wsl-lab] ${options.command} failed: ${message}\n`);
    return code;
  }
}

if (process.argv[1] !== undefined) {
  try {
    if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
      const exitCode = await main();
      process.exit(exitCode);
    }
  } catch {
    // argv[1] may not resolve to a file (e.g. under `node --test`); fall through.
  }
}
