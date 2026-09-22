import { DEFAULT_REACHABILITY_PORT, DEFAULT_SSHD_PORT, LAB_SCHEMA } from "./constants.mjs";
import { UsageError } from "./errors.mjs";

// oxlint-disable-next-line no-control-regex -- rejecting control characters is the entire point
const CONTROL_CHARS_RE = new RegExp("[\\u0000-\\u001f\\u007f]", "u");

// ── Pure helpers (unit-tested; must stay free of side effects) ──────────────

/**
 * Decode wsl.exe management output. `wsl --list/--status/--version` emit
 * UTF-16LE (with or without BOM); in-distro command output is UTF-8. Detect
 * the UTF-16 shape by BOM or by NUL density in odd byte offsets.
 */
export function decodeWslOutput(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return stripBom(buffer.toString("utf16le"));
  }
  const scan = Math.min(buffer.length, 8192);
  let zeroOdd = 0;
  let oddTotal = 0;
  for (let i = 1; i < scan; i += 2) {
    oddTotal += 1;
    if (buffer[i] === 0) zeroOdd += 1;
  }
  if (oddTotal > 0 && zeroOdd / oddTotal >= 0.8) {
    return stripBom(buffer.toString("utf16le"));
  }
  return buffer.toString("utf8");
}

function stripBom(text) {
  return text
    .replace(/^\uFEFF/u, "")
    .split("\0")
    .join("");
}

/** Parse `wsl --list --quiet` output into distro names. */
export function parseDistroList(stdout) {
  return stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.endsWith(":"));
}

export function hasDistro(names, name) {
  const target = name.toLowerCase();
  return names.some((entry) => entry.toLowerCase() === target);
}

/**
 * A distro name is argv-safe when it contains no NUL/control characters —
 * spaces, accents, and CJK are exactly what this lab exists to exercise.
 */
export function assertDistroNameSafe(name) {
  if (name.length === 0 || name.length > 120) {
    throw new UsageError(`distro name must be 1-120 characters, got ${name.length}`);
  }
  if (/[\0\r\n]/u.test(name) || CONTROL_CHARS_RE.test(name)) {
    throw new UsageError("distro name must not contain NUL or control characters");
  }
}

/** "nat" | "mirrored" | "unknown" from a wslinfo/ip-route style probe output. */
export function normalizeNetworkingMode(raw) {
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim().toLowerCase();
    if (trimmed.length === 0) continue;
    if (trimmed === "mirrored") return "mirrored";
    if (trimmed === "nat" || trimmed === "default") return "nat";
    return "unknown";
  }
  return "unknown";
}

/** True when the .wslconfig content pins mirrored networking. */
function hasMirroredMode(content) {
  return /networkingMode\s*=\s*mirrored/u.test(content);
}

function stripModeLines(content) {
  return content
    .split(/\r?\n/u)
    .filter((line) => !/^\s*networkingMode\s*=/iu.test(line))
    .join("\n");
}

/**
 * Compute the `.wslconfig` write for a lab mode.
 *
 * - mirrored: the lab fully owns the file (the original is backed up next to
 *   it, persistently, before the first write).
 * - nat: only `networkingMode` keys are removed from the existing file; an
 *   absent file or a file without the key means no change (and no shutdown).
 */
export function buildWslconfig(mode, existing) {
  if (mode === "mirrored") {
    const alreadyMirrored = existing !== null && hasMirroredMode(existing);
    return {
      content: alreadyMirrored ? existing : "[wsl2]\nnetworkingMode=mirrored\n",
      changed: !alreadyMirrored,
    };
  }
  if (existing === null) return { content: null, changed: false };
  if (!/networkingMode\s*=/iu.test(existing)) return { content: existing, changed: false };
  const stripped = stripModeLines(existing)
    .replace(/\n{3,}/gu, "\n\n")
    .replace(/\s+$/u, "");
  // A stripped file that keeps only blank lines and the section header holds
  // no settings — the lab deletes it so WSL falls back to its own defaults.
  const holdsNoSettings = stripped
    .split(/\r?\n/u)
    .every((line) => line.trim().length === 0 || line.trim() === "[wsl2]");
  if (holdsNoSettings) return { content: null, changed: true };
  return { content: `${stripped}\n`, changed: true };
}

/** Parse a `KEY=value` os-release document. */
export function parseOsReleaseField(contents, field) {
  for (const line of contents.split(/\r?\n/u)) {
    const match = new RegExp(`^${field}="?(.*?)"?$`, "u").exec(line);
    if (match?.[1] !== undefined && match[1].length > 0) return match[1];
  }
  return null;
}

/**
 * Scrub private material from captured text before it is logged or archived:
 * whole OpenSSH private key blocks by shape, plus caller-supplied secrets.
 */
export function redactPrivateMaterial(text, secrets = []) {
  let redacted = text.replace(
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu,
    "[redacted-private-key]",
  );
  for (const secret of secrets) {
    if (secret.length > 0) redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted;
}

/** `taskkill` argv that kills a whole Windows process tree. */
export function computeTaskkillArgs(pid) {
  return ["/pid", String(pid), "/T", "/F"];
}

/**
 * Parse CLI argv for both commands. Throws UsageError on anything unexpected
 * so `main` never interprets garbage as a path or a mode.
 */
export function parseArgv(argv) {
  const [command, ...rest] = argv;
  if (command === "--help" || command === "-h") return { command: "help" };
  if (command !== "provision" && command !== "cleanup") {
    throw new UsageError('first argument must be "provision" or "cleanup"');
  }
  const options = {
    command,
    mode: "nat",
    withSshd: false,
    guestIngress: true,
    out: ".tmp/windows-wsl-lab",
    state: undefined,
    rootfs: undefined,
    rootfsSha256: undefined,
    sshdPort: DEFAULT_SSHD_PORT,
    reachabilityPort: DEFAULT_REACHABILITY_PORT,
  };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    const value = () => {
      i += 1;
      const next = rest[i];
      if (next === undefined) throw new UsageError(`flag ${flag} requires a value`);
      return next;
    };
    switch (flag) {
      case "--mode": {
        const mode = value();
        if (mode !== "nat" && mode !== "mirrored") {
          throw new UsageError(`--mode must be "nat" or "mirrored", got "${mode}"`);
        }
        options.mode = mode;
        break;
      }
      case "--with-sshd":
        options.withSshd = true;
        break;
      case "--no-guest-ingress":
        options.guestIngress = false;
        break;
      case "--out":
        options.out = value();
        break;
      case "--state":
        options.state = value();
        break;
      case "--rootfs":
        options.rootfs = value();
        break;
      case "--rootfs-sha256":
        options.rootfsSha256 = value();
        break;
      case "--sshd-port":
        options.sshdPort = parsePort(value(), flag);
        break;
      case "--reachability-port":
        options.reachabilityPort = parsePort(value(), flag);
        break;
      default:
        throw new UsageError(`unknown flag "${flag}"`);
    }
  }
  if (options.state === undefined) {
    options.state = `${options.out.replace(/[\\/]+$/u, "")}-state`;
  }
  return options;
}

function parsePort(raw, flag) {
  if (!/^\d{1,5}$/u.test(raw)) {
    throw new UsageError(`${flag} must be an integer port, got "${raw}"`);
  }
  const port = Number(raw);
  if (port < 1 || port > 65535) throw new UsageError(`${flag} must be within 1-65535`);
  return port;
}

/**
 * Validate the lab manifest the suite consumes. Throws on any shape drift so
 * a half-written or older-schema manifest can never silently drive the suite.
 */
export function validateLabJson(value) {
  if (typeof value !== "object" || value === null) throw new Error("lab JSON is not an object");
  if (value.schema !== LAB_SCHEMA) {
    throw new Error(
      `lab JSON schema mismatch: expected ${LAB_SCHEMA}, got ${String(value.schema)}`,
    );
  }
  if (value.mode !== "nat" && value.mode !== "mirrored") {
    throw new Error(`lab JSON mode must be "nat" or "mirrored", got ${String(value.mode)}`);
  }
  if (!Array.isArray(value.distros) || value.distros.length !== 2) {
    throw new Error("lab JSON must record exactly two distros");
  }
  for (const distro of value.distros) {
    if (typeof distro !== "object" || distro === null) {
      throw new Error("lab distro entry is not an object");
    }
    if (typeof distro.name !== "string" || distro.name.length === 0) {
      throw new Error("lab distro name is missing");
    }
    if (distro.role !== "primary" && distro.role !== "secondary") {
      throw new Error(`lab distro ${distro.name} has an invalid role`);
    }
    if (typeof distro.importedByThisRun !== "boolean") {
      throw new Error(`lab distro ${distro.name} is missing importedByThisRun`);
    }
  }
  if (
    typeof value.firewall !== "object" ||
    value.firewall === null ||
    typeof value.firewall.ruleAdded !== "boolean"
  ) {
    throw new Error("lab JSON firewall.ruleAdded must be a boolean");
  }
  if (
    !Number.isSafeInteger(value.reachabilityPort) ||
    value.reachabilityPort < 1 ||
    value.reachabilityPort > 65_535
  ) {
    throw new Error("lab JSON reachabilityPort must be an integer within 1-65535");
  }
  return value;
}
