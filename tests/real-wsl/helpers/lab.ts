// Fail-closed gating for the real-WSL qualification suite.
//
// `PORACODE_WSL_LAB=1` opts a host into the suite (CI sets it after running
// scripts/ci-windows-wsl-lab.mjs provision). Ordinary local runs — including
// every macOS developer machine — skip the suite entirely. But once the flag
// is set, nothing may degrade a skip into a pass:
//
// - a non-Windows host, a missing manifest, a schema-drifted manifest, or a
//   manifest recording a failed provision all fail the suite;
// - NAT mode requires the lab's guest-ingress firewall rule, because without
//   it the host-reachability check would test nothing;
// - an unreachable wsl.exe fails instead of skipping.
//
// Parsing/validation of the manifest lives in scripts/ci-windows-wsl-lab.mjs
// so the writer and the reader share one implementation.

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  decodeWslOutput,
  parseDistroList,
  validateLabJson,
  type LabJson,
} from "../../../scripts/ci-windows-wsl-lab.mjs";

export const REAL_WSL_ENV = "PORACODE_WSL_LAB";
export const REAL_WSL_LAB_JSON_ENV = "PORACODE_WSL_LAB_JSON";

/** `execFile` pinned to the Buffer-output overload (wsl.exe bytes, not text). */
const execFileBufferAsync = promisify(execFile) as (
  file: string,
  args: string[],
  options: {
    encoding: "buffer";
    timeout?: number;
    windowsHide?: boolean;
    killSignal?: NodeJS.Signals;
    input?: string | Buffer;
  },
) => Promise<{ stdout: Buffer; stderr: Buffer }>;

/** Minimal shape of vitest's per-test context this helper needs. */
export interface SkippableTestContext {
  skip: (note?: string) => void;
}

export interface RealWslGate {
  /** False only when the opt-in env flag is absent (ordinary local run). */
  enabled: boolean;
  /** Present when `enabled` is false: the note the tests skip with. */
  skipReason?: string;
  lab?: LabJson;
  labPath?: string;
  evidenceDir?: string;
  primary?: string;
  secondary?: string;
}

function defaultLabPath(): string {
  return join(fileURLToPath(new URL("../../../.tmp/windows-wsl-lab/lab.json", import.meta.url)));
}

function distroByRole(lab: LabJson, role: "primary" | "secondary"): string {
  const distro = lab.distros.find((entry) => entry.role === role);
  if (!distro) throw new Error(`lab manifest has no ${role} distro`);
  return distro.name;
}

/**
 * Resolve the suite gate. Never skips on a broken lab: an enabled-but-broken
 * environment throws with the exact reason, so a qualification run cannot go
 * green because its lab was half-provisioned.
 */
export function resolveRealWslGate(env: NodeJS.ProcessEnv = process.env): RealWslGate {
  if (env[REAL_WSL_ENV] !== "1") {
    return {
      enabled: false,
      skipReason: `set ${REAL_WSL_ENV}=1 (and provision via scripts/ci-windows-wsl-lab.mjs) to run the real-WSL suite`,
    };
  }
  if (process.platform !== "win32") {
    throw new Error(
      `${REAL_WSL_ENV}=1 was requested on ${process.platform}; the real-WSL suite can only fail or pass on win32, never skip there`,
    );
  }
  const labPath = env[REAL_WSL_LAB_JSON_ENV] ?? defaultLabPath();
  if (!existsSync(labPath)) {
    throw new Error(
      `${REAL_WSL_ENV}=1 but no lab manifest at ${labPath}; run ` +
        `scripts/ci-windows-wsl-lab.mjs provision first (or point ${REAL_WSL_LAB_JSON_ENV} at one)`,
    );
  }
  const lab = validateLabJson(JSON.parse(readFileSync(labPath, "utf8")) as unknown);
  if (lab.failure !== undefined) {
    throw new Error(`the lab provision failed; refusing to qualify against it: ${lab.failure}`);
  }
  if (lab.mode === "nat" && !lab.firewall.ruleAdded) {
    throw new Error(
      "the lab was provisioned in NAT mode without its guest-ingress firewall rule " +
        "(--no-guest-ingress); the host-reachability check would test nothing, so this run fails",
    );
  }
  return {
    enabled: true,
    lab,
    labPath,
    evidenceDir: dirname(labPath),
    primary: distroByRole(lab, "primary"),
    secondary: distroByRole(lab, "secondary"),
  };
}

function wslPath(): string {
  const systemRoot = process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";
  return join(systemRoot, "System32", "wsl.exe");
}

export interface WslRunResult {
  stdout: string;
  stderr: string;
}

/**
 * Run `wsl.exe` with a flat argv and a hard deadline. Returns decoded UTF-8
 * output; wsl.exe management output (UTF-16LE) should go through
 * `decodeWslOutput` on the raw buffer instead.
 */
export async function runWslArgs(
  args: string[],
  options: { timeoutMs?: number; stdin?: string } = {},
): Promise<WslRunResult> {
  const { timeoutMs = 120_000, stdin } = options;
  const { stdout, stderr } = await execFileBufferAsync(wslPath(), args, {
    encoding: "buffer",
    timeout: timeoutMs,
    windowsHide: true,
    killSignal: "SIGKILL",
    ...(stdin !== undefined ? { input: stdin } : {}),
  });
  return { stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8") };
}

/** Run one argv inside a distro (`wsl -d <distro> --exec ...`, no shell). */
export async function runInDistro(
  distro: string,
  argv: string[],
  options: { timeoutMs?: number } = {},
): Promise<WslRunResult> {
  return runWslArgs(["-d", distro, "--exec", ...argv], options);
}

/** Terminate a distro; its next command cold-boots it. */
export async function terminateDistro(distro: string): Promise<void> {
  await runWslArgs(["--terminate", distro], { timeoutMs: 60_000 });
}

/**
 * List registered distro names, tolerating the 0xFFFFFFFF "no distros" exit
 * that older wsl.exe builds use.
 */
export async function listRegisteredDistros(): Promise<string[]> {
  try {
    const { stdout } = await execFileBufferAsync(wslPath(), ["--list", "--quiet"], {
      encoding: "buffer",
      timeout: 60_000,
      windowsHide: true,
    });
    return parseDistroList(decodeWslOutput(stdout));
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === 0xffffffff) return [];
    throw error;
  }
}

export interface TcpPayloadServer {
  port: number;
  connectionCount: () => number;
  close: () => Promise<void>;
}

/**
 * One-shot payload server for the guest→host reachability check. Binds
 * `0.0.0.0`: in NAT mode the guest arrives via the vEthernet gateway (never
 * loopback), in mirrored mode via loopback — both land here.
 */
export function startTcpPayloadServer(payload: string, port = 0): Promise<TcpPayloadServer> {
  let connections = 0;
  return new Promise((resolveServer, rejectServer) => {
    const server = net.createServer((socket) => {
      connections += 1;
      socket.end(payload);
    });
    server.once("error", rejectServer);
    server.listen(port, "0.0.0.0", () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address !== null ? address.port : 0;
      resolveServer({
        port: actualPort,
        connectionCount: () => connections,
        close: () => new Promise((resolveClose) => server.close(() => resolveClose())),
      });
    });
  });
}

/**
 * Guest-side TCP probe argv. bash's `/dev/tcp` needs no packages beyond the
 * base rootfs; the host IP and port ride as positional parameters so no data
 * is ever interpolated into the command text.
 */
export function guestTcpProbeArgs(ip: string, port: number): string[] {
  return [
    "timeout",
    "15",
    "bash",
    "-c",
    'exec 3<>/dev/tcp/"$1"/"$2" && head -c 64 <&3',
    "bash",
    ip,
    String(port),
  ];
}
