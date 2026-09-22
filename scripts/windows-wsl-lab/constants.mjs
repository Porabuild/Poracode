// ── Distros, ports, defaults ────────────────────────────────────────────────

/** Primary lab distro: plain ASCII name (the "normal" case). */
export const PRIMARY_DISTRO = "poracode-ci-ubuntu-24-04";

/**
 * Secondary lab distro: spaces + Latin-1 accents + CJK, all BMP (no surrogate
 * pairs) so a single argv-encoding bug stays attributable. This is the name
 * shape real users create and the production `wsl.exe -d <name>` paths must
 * survive.
 */
export const SECONDARY_DISTRO = "Poracode CI Ünïcodé 日本語 24 04";

export const UBUNTU_24_04_ROOTFS_URL =
  "https://cloud-images.ubuntu.com/wsl/releases/24.04/current/ubuntu-noble-wsl-amd64-ubuntu24.04lts.rootfs.tar.gz";
export const ROOTFS_CACHE_NAME = "ubuntu-24.04-wsl-amd64.rootfs.tar.gz";
export const MAX_ROOTFS_BYTES = 3 * 1024 * 1024 * 1024;

export const DEFAULT_SSHD_PORT = 22022;
export const DEFAULT_REACHABILITY_PORT = 22333;
export const FIREWALL_RULE_NAME = "Poracode WSL lab guest ingress";
export const WSLCONFIG_BACKUP_NAME = ".wslconfig.poracode-lab-backup";

export const LAB_SCHEMA = "poracode-windows-wsl-lab/1";

/** Typed exit codes; infrastructure failure must not mimic a verdict failure. */
export const TYPED_EXIT_CODES = Object.freeze({
  OK: 0,
  NOT_WINDOWS: 2,
  WSL_MISSING: 3,
  PROVISION_FAILED: 4,
  CLEANUP_FAILED: 5,
  USAGE: 6,
});

/** Deadline for ordinary in-distro commands (cold boots land inside this). */
export const EXEC_TIMEOUT_MS = 120_000;
export const IMPORT_TIMEOUT_MS = 900_000;
export const UNREGISTER_TIMEOUT_MS = 120_000;
export const SHUTDOWN_TIMEOUT_MS = 90_000;
export const APT_TIMEOUT_MS = 900_000;
export const SSH_PROBE_TOTAL_MS = 120_000;
export const SSH_PROBE_INTERVAL_MS = 4_000;
export const ROOTFS_TIMEOUT_MS = 900_000;
export const KILL_TREE_TIMEOUT_MS = 15_000;
export const HARD_KILL_SLACK_MS = 5_000;
export const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;

/** wsl.exe management commands exit 0xFFFFFFFF (unsigned) on "no distros". */
export const WSL_NO_DISTROS_EXIT = 4294967295;
