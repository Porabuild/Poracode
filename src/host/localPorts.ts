import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { connect } from "node:net";
import { basename } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { z } from "zod";
import type { CloseLocalPortPayload, LocalPortInfo } from "@/shared/ipc";
import { windowsSystemTool } from "@/shared/windowsSystemTool";

const runFile = promisify(execFile);
const commandOptions = {
  encoding: "utf8",
  windowsHide: true,
  timeout: 15_000,
  maxBuffer: 4 * 1024 * 1024,
} as const;

const windowsPortSchema = z.array(
  z.object({
    port: z.number().int().min(1).max(65535),
    address: z.string().min(1),
    pid: z.number().int().nonnegative(),
    processName: z.string().nullable(),
    processStartedAt: z.string().nullable(),
    processPath: z.string().nullable(),
    needsProbe: z.boolean(),
  }),
);

// One OS snapshot, including process creation time so a stale row cannot kill
// a different process that has since acquired the same PID and port.
const windowsScan = `
$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$processes = @{}
Get-Process | ForEach-Object { $processes[[int]$_.Id] = $_ }
$listeners = @(Get-NetTCPConnection | Where-Object {
  $state = $_.CimInstanceProperties['State'].Value
  $_.RemotePort -eq 0 -and ($state -eq 2 -or $state -eq 0)
})
$rows = @($listeners | ForEach-Object {
  $owner = $processes[[int]$_.OwningProcess]
  $started = $null
  $path = $null
  if ($owner) {
    try { $started = $owner.StartTime.ToUniversalTime().Ticks.ToString() } catch {}
    try { $path = $owner.Path } catch {}
  }
  [pscustomobject]@{
    port = [int]$_.LocalPort
    address = $_.LocalAddress
    pid = [int]$_.OwningProcess
    processName = $(if ($owner) { $owner.ProcessName } else { $null })
    processStartedAt = $started
    processPath = $path
    needsProbe = $_.CimInstanceProperties['State'].Value -eq 0
  }
})
ConvertTo-Json -InputObject $rows -Compress
`;

interface Listener {
  port: number;
  address: string;
  pid: number | null;
}

interface Owner {
  name: string;
  startedAt: string | null;
  path: string;
}

function parseAddress(value: string): Pick<Listener, "port" | "address"> | null {
  const split = value.lastIndexOf(":");
  if (split < 0) return null;
  const port = Number(value.slice(split + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  const address = value.slice(0, split).replace(/^\[|\]$/g, "");
  return address ? { port, address } : null;
}

export function parseLsofListeners(output: string): Listener[] {
  const listeners: Listener[] = [];
  let pid: number | null = null;
  for (const line of output.split(/\r?\n/)) {
    if (/^p\d+$/.test(line)) pid = Number(line.slice(1));
    if (!line.startsWith("n")) continue;
    const address = parseAddress(line.slice(1));
    if (address) listeners.push({ ...address, pid });
  }
  return listeners;
}

export function parseSsListeners(output: string): Listener[] {
  return output.split(/\r?\n/).flatMap((line) => {
    const columns = line.trim().split(/\s+/);
    if (columns[0] !== "LISTEN") return [];
    const address = parseAddress(columns[3] ?? "");
    if (!address) return [];
    const pids = [...line.matchAll(/pid=(\d+)/g)].map((match) => Number(match[1]));
    return [...new Set(pids.length ? pids : [null])].map((pid) => ({ ...address, pid }));
  });
}

export function parseProcessOwners(output: string): Map<number, Owner> {
  const owners = new Map<number, Owner>();
  for (const line of output.split(/\r?\n/)) {
    // LC_ALL=C pins ps's five-field lstart format, including padded day numbers.
    const match = /^\s*(\d+)\s+(\S+\s+\S+\s+\d+\s+\S+\s+\d+)\s+(.+)$/.exec(line);
    if (!match) continue;
    const path = match[3]!.trim();
    owners.set(Number(match[1]), {
      name: basename(path),
      path,
      startedAt: match[2]!.replace(/\s+/g, " "),
    });
  }
  return owners;
}

function toPort(listener: Listener, owner: Owner | undefined): LocalPortInfo {
  const host =
    listener.address === "*" || listener.address === "0.0.0.0"
      ? "127.0.0.1"
      : listener.address === "::"
        ? "::1"
        : listener.address;
  const ownExecutable =
    Boolean(process.versions.electron) &&
    (owner?.path.toLowerCase() === process.execPath.toLowerCase() ||
      owner?.name.toLowerCase() === basename(process.execPath).toLowerCase());
  const url = `http://${host.includes(":") ? `[${host}]` : host}:${listener.port}`;
  return {
    ...listener,
    url: URL.canParse(url) ? url : null,
    processName: owner?.name || null,
    processStartedAt: owner?.startedAt || null,
    canClose: Boolean(
      listener.pid &&
      listener.pid > 4 &&
      listener.pid !== process.pid &&
      owner?.startedAt &&
      !ownExecutable,
    ),
  };
}

// Some Windows builds return state 0 for live listeners, which breaks both
// netstat and GetActiveTcpListeners. Confirm those unclassified endpoints by
// connecting without sending data; a bound but non-listening socket is omitted.
function acceptsConnection(port: LocalPortInfo): Promise<boolean> {
  return new Promise((resolve) => {
    const host =
      port.address === "0.0.0.0" ? "127.0.0.1" : port.address === "::" ? "::1" : port.address;
    const socket = connect({ host, port: port.port });
    const finish = (listening: boolean) => {
      socket.destroy();
      resolve(listening);
    };
    socket.setTimeout(500, () => finish(false));
    socket.once("error", () => finish(false));
    socket.once("connect", () => finish(true));
  });
}

export async function listLocalPorts(): Promise<{ ports: LocalPortInfo[] }> {
  let ports: LocalPortInfo[];
  if (process.platform === "win32") {
    const { stdout } = await runFile(
      windowsSystemTool("powershell"),
      ["-NoProfile", "-NonInteractive", "-Command", windowsScan],
      commandOptions,
    );
    const candidates = await Promise.all(
      windowsPortSchema.parse(JSON.parse(stdout)).map(async (row) => {
        const port = toPort(
          { port: row.port, address: row.address, pid: row.pid || null },
          row.processName
            ? {
                name: row.processName,
                startedAt: row.processStartedAt,
                path: row.processPath ?? "",
              }
            : undefined,
        );
        return row.needsProbe && !(await acceptsConnection(port)) ? null : port;
      }),
    );
    ports = candidates.filter((port): port is LocalPortInfo => port !== null);
  } else {
    const options = { ...commandOptions, env: { ...process.env, LC_ALL: "C" } };
    const [listeners, processes] = await Promise.all([
      process.platform === "darwin"
        ? runFile("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"], options).catch(
            (error: unknown) => {
              // lsof's empty match is exit 1; other failures must remain visible.
              if (
                error &&
                typeof error === "object" &&
                "code" in error &&
                error.code === 1 &&
                "stdout" in error &&
                error.stdout === "" &&
                "stderr" in error &&
                error.stderr === ""
              )
                return { stdout: "" };
              throw error;
            },
          )
        : runFile("ss", ["-H", "-ltnp"], options),
      runFile("ps", ["-axo", "pid=,lstart=,comm="], options),
    ]);
    const owners = parseProcessOwners(processes.stdout);
    const sockets =
      process.platform === "darwin"
        ? parseLsofListeners(listeners.stdout)
        : parseSsListeners(listeners.stdout);
    if (process.platform === "linux") {
      await Promise.all(
        [...new Set(sockets.map((socket) => socket.pid))].map(async (pid) => {
          const owner = pid ? owners.get(pid) : undefined;
          if (!owner) return;
          owner.startedAt = null;
          try {
            const stat = await readFile(`/proc/${pid}/stat`, "utf8");
            const end = stat.lastIndexOf(")");
            const startTicks =
              end < 0
                ? undefined
                : stat
                    .slice(end + 2)
                    .trim()
                    .split(/\s+/)[19];
            if (startTicks && /^\d+$/.test(startTicks)) owner.startedAt = startTicks;
          } catch {
            /* A vanished or unreadable owner remains non-closable. */
          }
        }),
      );
    }
    ports = sockets.map((listener) =>
      toPort(listener, listener.pid ? owners.get(listener.pid) : undefined),
    );
  }
  const unique = new Map(ports.map((port) => [`${port.address}:${port.port}:${port.pid}`, port]));
  return {
    ports: [...unique.values()].sort(
      (a, b) =>
        a.port - b.port || a.address.localeCompare(b.address) || (a.pid ?? 0) - (b.pid ?? 0),
    ),
  };
}

export async function closeLocalPort(payload: CloseLocalPortPayload): Promise<{ closed: boolean }> {
  const matches = (port: LocalPortInfo) =>
    port.port === payload.port &&
    port.address === payload.address &&
    port.pid === payload.pid &&
    port.processStartedAt === payload.processStartedAt;
  const current = (await listLocalPorts()).ports.find(matches);
  if (!current?.canClose) return { closed: false };
  process.kill(payload.pid, "SIGTERM");
  // SIGTERM may be handled asynchronously or ignored. Only report success once
  // the selected listener is actually gone; never escalate to a forced kill.
  for (let attempt = 0; attempt < 3; attempt++) {
    await delay(250);
    if (!(await listLocalPorts()).ports.some(matches)) return { closed: true };
  }
  return { closed: false };
}
