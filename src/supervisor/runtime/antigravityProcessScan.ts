import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { windowsPowershellPath } from "./windowsPowershell";

/**
 * Process- and port-discovery for the Antigravity language server. `agy` runs
 * the LS in a child process on an OS-assigned loopback port with a self-signed
 * cert and (unlike the IDE) no CSRF token on the command line — so we walk the
 * `agy`/`antigravity`/`language_server` process trees, collect any CSRF tokens
 * seen, and map their pids to listening ports. Everything is best-effort and
 * fails safe (empty on any error); nothing is logged.
 */

const execFileAsync = promisify(execFile);

export interface ProcInfo {
  pid: number;
  ppid: number;
  /** Lower-cased process name + command line, for matching. */
  haystack: string;
  csrf: string | undefined;
}

/** Enumerate processes as `pid|ppid|name|commandLine`; empty on any failure. */
export async function listProcesses(): Promise<ProcInfo[]> {
  let lines: string[] = [];
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync(
        windowsPowershellPath(),
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId)|$($_.ParentProcessId)|$($_.Name)|$($_.CommandLine)" }',
        ],
        { timeout: 6_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      );
      lines = stdout.split(/\r?\n/);
    } else {
      const { stdout } = await execFileAsync("ps", ["-axww", "-o", "pid=,ppid=,args="], {
        timeout: 6_000,
        maxBuffer: 8 * 1024 * 1024,
      });
      // Reshape `pid ppid args...` into the same pipe-delimited form.
      lines = stdout.split(/\r?\n/).map((line) => {
        const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
        return m ? `${m[1]}|${m[2]}||${m[3]}` : "";
      });
    }
  } catch {
    return [];
  }

  const procs: ProcInfo[] = [];
  for (const line of lines) {
    const parts = line.split("|");
    if (parts.length < 4) continue;
    const pid = Number(parts[0]);
    const ppid = Number(parts[1]);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    const cmd = `${parts[2]} ${parts.slice(3).join("|")}`;
    const csrf = cmd.match(/csrf[_-]?token["' =:]+([A-Za-z0-9._-]+)/i)?.[1];
    procs.push({
      pid,
      ppid: Number.isFinite(ppid) ? ppid : 0,
      haystack: cmd.toLowerCase(),
      csrf,
    });
  }
  return procs;
}

/** Is this process an Antigravity LS host or a launcher whose tree contains one? */
export function isAntigravityRoot(proc: ProcInfo): boolean {
  // `agy` (the CLI), the IDE's `language_server` binary, or anything clearly
  // antigravity-branded. A bare csrf token alone isn't enough — other Codeium
  // products use the same flag.
  return (
    /(?:^|[\\/\s])agy(?:\.exe)?(?:\s|$|"|')/.test(proc.haystack) ||
    /language_server/.test(proc.haystack) ||
    /antigravity/.test(proc.haystack)
  );
}

/** Collect the matched roots plus every descendant pid, and any CSRF tokens seen. */
export function resolveTargets(procs: ProcInfo[]): { pids: Set<number>; csrfTokens: string[] } {
  const childrenByParent = new Map<number, ProcInfo[]>();
  for (const proc of procs) {
    const siblings = childrenByParent.get(proc.ppid) ?? [];
    siblings.push(proc);
    childrenByParent.set(proc.ppid, siblings);
  }

  const pids = new Set<number>();
  const csrfTokens = new Set<string>();
  const visit = (proc: ProcInfo): void => {
    if (pids.has(proc.pid)) return;
    pids.add(proc.pid);
    if (proc.csrf) csrfTokens.add(proc.csrf);
    for (const child of childrenByParent.get(proc.pid) ?? []) visit(child);
  };
  for (const proc of procs) {
    if (isAntigravityRoot(proc)) visit(proc);
  }
  return { pids, csrfTokens: [...csrfTokens] };
}

/** Map every listening loopback port to its owning pid; empty on any failure. */
export async function listListeningPorts(): Promise<{ pid: number; port: number }[]> {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync(
        windowsPowershellPath(),
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          'Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | ForEach-Object { "$($_.OwningProcess) $($_.LocalPort)" }',
        ],
        { timeout: 6_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
      );
      return parsePortLines(stdout);
    }
    const { stdout } = await execFileAsync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-FpPn"], {
      timeout: 6_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return parseLsof(stdout);
  } catch {
    return [];
  }
}

export function parsePortLines(stdout: string): { pid: number; port: number }[] {
  const out: { pid: number; port: number }[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s*$/);
    if (!m) continue;
    const pid = Number(m[1]);
    const port = Number(m[2]);
    if (pid > 0 && port > 0 && port <= 65535) out.push({ pid, port });
  }
  return out;
}

/** Parse `lsof -F` records (p<pid> ... n<addr:port>) into pid/port pairs. */
export function parseLsof(stdout: string): { pid: number; port: number }[] {
  const out: { pid: number; port: number }[] = [];
  let pid = 0;
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith("p")) {
      pid = Number(line.slice(1)) || 0;
    } else if (line.startsWith("n") && pid > 0) {
      const port = Number(line.match(/:(\d{2,5})$/)?.[1]);
      if (port > 0 && port <= 65535) out.push({ pid, port });
    }
  }
  return out;
}
