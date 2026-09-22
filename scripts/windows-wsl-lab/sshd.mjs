import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  APT_TIMEOUT_MS,
  EXEC_TIMEOUT_MS,
  SSH_PROBE_INTERVAL_MS,
  SSH_PROBE_TOTAL_MS,
  TYPED_EXIT_CODES,
} from "./constants.mjs";
import { LabError } from "./errors.mjs";
import { decodeWslOutput } from "./pure.mjs";
import { runBounded, runWsl, systemCommand } from "./subprocess.mjs";

// ── In-distro constant scripts ──────────────────────────────────────────────
// Data reaches these scripts as positional parameters ($1, $2, ...) passed as
// wsl.exe argv after `--exec /bin/sh -s`. The script text itself is constant;
// nothing is ever interpolated into it. The doubled backslashes below are
// deliberate: the shell must receive literal `\n` inside its printf formats.

export const SSHD_INSTALL_SCRIPT = `set -eu
export DEBIAN_FRONTEND=noninteractive
if [ -x /usr/sbin/sshd ]; then
  printf 'sshd-already-installed\\n'
  exit 0
fi
apt-get update -qq
apt-get install -y -qq --no-install-recommends openssh-server
printf 'sshd-installed\\n'
`;

/** $1 = port (host-validated integer), $2 = authorized public key line. */
export const SSHD_CONFIGURE_SCRIPT = `set -eu
port="$1"
pubkey="$2"
umask 077
mkdir -p /root/.ssh
printf '%s\\n' "$pubkey" > /root/.ssh/authorized_keys
chmod 700 /root/.ssh
chmod 600 /root/.ssh/authorized_keys
mkdir -p /etc/ssh/sshd_config.d /run/sshd
printf 'Port %s\\nPubkeyAuthentication yes\\nPasswordAuthentication no\\nKbdInteractiveAuthentication no\\nX11Forwarding no\\n' "$port" > /etc/ssh/sshd_config.d/poracode-lab.conf
pkill -x sshd 2>/dev/null || true
if command -v service >/dev/null 2>&1; then
  service ssh restart >/dev/null 2>&1 || true
fi
/usr/sbin/sshd
printf 'sshd-configured port=%s\\n' "$port"
`;

/**
 * Build `ssh.exe` argv probing the in-distro sshd over loopback. The remote
 * command is a constant; the key path rides as its own argv element.
 */
export function buildSshProbeArgs({ keyPath, port, knownHostsPath }) {
  return [
    "-p",
    String(port),
    "-i",
    keyPath,
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    `UserKnownHostsFile=${knownHostsPath}`,
    "-o",
    "ConnectTimeout=8",
    "root@127.0.0.1",
    "printf",
    "sshd-ok",
  ];
}

/** Validated public-key line shape (charset allowlist; data stays positional). */
export function isPublicKeyLine(line) {
  return /^ssh-(ed25519|rsa) [A-Za-z0-9+/=]+ [A-Za-z0-9@._-]+$/u.test(line.trim());
}

// ── sshd configuration ──────────────────────────────────────────────────────

async function runInDistroScript(distro, script, positionalArgs, options = {}) {
  return runWsl(["-d", distro, "--exec", "/bin/sh", "-s", ...positionalArgs], {
    timeoutMs: EXEC_TIMEOUT_MS,
    stdin: script,
    ...options,
  });
}

export async function configureDistroSshd(distro, port, keysDir, log) {
  const sshKeygen = systemCommand("OpenSSH", "ssh-keygen.exe");
  const keyPath = join(keysDir, "id_ed25519");
  if (!existsSync(keyPath)) {
    await runBounded(
      sshKeygen,
      ["-t", "ed25519", "-N", "", "-f", keyPath, "-C", "poracode-wsl-lab"],
      { timeoutMs: 60_000, label: "ssh-keygen (lab keypair)" },
    );
    log("ssh: generated ephemeral keypair in the state dir (content never logged)");
  }
  const publicKey = readFileSync(`${keyPath}.pub`, "utf8").trim();
  if (!isPublicKeyLine(publicKey)) {
    throw new LabError(
      TYPED_EXIT_CODES.PROVISION_FAILED,
      "generated public key has an unexpected shape; refusing to install it",
    );
  }

  const install = await runInDistroScript(distro, SSHD_INSTALL_SCRIPT, [], {
    timeoutMs: APT_TIMEOUT_MS,
  });
  const installLine = decodeWslOutput(install.stdout).trim().split(/\r?\n/u).at(-1) ?? "";
  log(`ssh[${distro}]: ${installLine}`);

  await runInDistroScript(distro, SSHD_CONFIGURE_SCRIPT, [String(port), publicKey]);
  log(`ssh[${distro}]: sshd configured on port ${port} (key auth only)`);

  const fingerprint = await runBounded(sshKeygen, ["-lf", `${keyPath}.pub`], {
    timeoutMs: 30_000,
    label: "ssh-keygen -lf",
  });
  const fingerprintLine = decodeWslOutput(fingerprint.stdout).trim().split(/\r?\n/u)[0] ?? "";

  await probeSshd(port, keyPath, log);
  return { port, fingerprint: fingerprintLine, keyFileName: "id_ed25519" };
}

async function probeSshd(port, keyPath, log) {
  const knownHostsPath = join(dirname(keyPath), "known_hosts");
  const ssh = systemCommand("OpenSSH", "ssh.exe");
  const args = buildSshProbeArgs({ keyPath, port, knownHostsPath });
  const deadline = Date.now() + SSH_PROBE_TOTAL_MS;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      await runBounded(ssh, args, { timeoutMs: 15_000, label: "ssh probe" });
      log(`ssh: loopback probe on 127.0.0.1:${port} succeeded`);
      return;
    } catch (error) {
      lastError = String(error);
      await new Promise((resolveSleep) => setTimeout(resolveSleep, SSH_PROBE_INTERVAL_MS));
    }
  }
  throw new LabError(
    TYPED_EXIT_CODES.PROVISION_FAILED,
    `sshd on 127.0.0.1:${port} did not become reachable within ${SSH_PROBE_TOTAL_MS / 1000}s; last error: ${lastError}`,
  );
}
