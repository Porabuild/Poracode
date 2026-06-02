import { execFile } from "node:child_process";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { promisify } from "node:util";
import {
  antigravityPoolWindows,
  type AntigravityModelQuota,
  type UsageSnapshot,
} from "@lightcode/agents-usage";

const execFileAsync = promisify(execFile);

/**
 * Antigravity usage from its local language server (LS-only by design).
 *
 * While `agy` (or the Antigravity IDE) is running it hosts a local language
 * server — a Connect-RPC service reachable on a loopback port — whose
 * `GetUserStatus` reports per-model quota for the full set (Gemini + Claude +
 * GPT-OSS). When the LS is not reachable the snapshot is auth-missing: there is
 * no live session. We deliberately do NOT fall back to `agy`'s Cloud Code
 * surface — it reports a different backend's quota (Gemini-only, with different
 * reset windows and counts), so mixing it in would flip the panel to
 * inconsistent numbers as `agy` starts and stops.
 *
 * Discovery is messier than the IDE-only case: `agy` runs the server in a child
 * process and (unlike the IDE) puts no CSRF token on the command line, listening
 * on an OS-assigned port with a self-signed cert. So we resolve ports from the
 * OS by walking the `agy`/`antigravity`/`language_server` process trees, probe
 * both http and https, and send the CSRF token only when one is present on a
 * matched process. Everything is best-effort and fails safe; nothing is logged.
 */

const SERVICE = "exa.language_server_pb.LanguageServerService";
const GET_USER_STATUS = `/${SERVICE}/GetUserStatus`;
const GET_COMMAND_MODEL_CONFIGS = `/${SERVICE}/GetCommandModelConfigs`;
// The metadata the LS expects; the values are cosmetic but must be present.
const REQUEST_BODY = JSON.stringify({
  metadata: {
    ideName: "antigravity",
    extensionName: "antigravity",
    ideVersion: "unknown",
    locale: "en",
  },
});

interface ProcInfo {
  pid: number;
  ppid: number;
  /** Lower-cased process name + command line, for matching. */
  haystack: string;
  csrf: string | undefined;
}

/** Enumerate processes as `pid|ppid|name|commandLine`; empty on any failure. */
async function listProcesses(): Promise<ProcInfo[]> {
  let lines: string[] = [];
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync(
        "powershell.exe",
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
function isAntigravityRoot(proc: ProcInfo): boolean {
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
function resolveTargets(procs: ProcInfo[]): { pids: Set<number>; csrfTokens: string[] } {
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
async function listListeningPorts(): Promise<{ pid: number; port: number }[]> {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync(
        "powershell.exe",
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

function parsePortLines(stdout: string): { pid: number; port: number }[] {
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
function parseLsof(stdout: string): { pid: number; port: number }[] {
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

/** POST to the LS on one port, trying https (self-signed) then http, with each CSRF candidate. */
async function queryLs(
  port: number,
  path: string,
  csrfTokens: string[],
): Promise<unknown | undefined> {
  // `agy` needs no token, so try none first; the IDE needs its per-session one.
  const csrfCandidates = [undefined, ...csrfTokens];
  for (const scheme of ["https", "http"] as const) {
    for (const csrf of csrfCandidates) {
      const body = await postJson(scheme, port, path, csrf);
      if (body !== undefined) return body;
    }
  }
  return undefined;
}

/** A single localhost JSON POST; resolves `undefined` on any non-2xx/error. */
function postJson(
  scheme: "http" | "https",
  port: number,
  path: string,
  csrf: string | undefined,
): Promise<unknown | undefined> {
  return new Promise((resolve) => {
    const requester = scheme === "https" ? httpsRequest : httpRequest;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Connect-Protocol-Version": "1",
      "Content-Length": String(Buffer.byteLength(REQUEST_BODY)),
      ...(csrf ? { "x-codeium-csrf-token": csrf } : {}),
    };
    const req = requester(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers,
        timeout: 5_000,
        // Self-signed cert; this only ever talks to loopback.
        ...(scheme === "https" ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          res.resume();
          resolve(undefined);
          return;
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data) as unknown);
          } catch {
            resolve(undefined);
          }
        });
      },
    );
    req.on("error", () => resolve(undefined));
    req.on("timeout", () => {
      req.destroy();
      resolve(undefined);
    });
    req.write(REQUEST_BODY);
    req.end();
  });
}

/** Pull the plan name out of a GetUserStatus body (userTier wins over the legacy planInfo). */
function planFromUserStatus(body: unknown): string | undefined {
  const status = (body as { userStatus?: Record<string, unknown> } | null | undefined)?.userStatus;
  if (!status || typeof status !== "object") return undefined;
  const userTier = (status as { userTier?: { name?: unknown } }).userTier;
  if (userTier && typeof userTier.name === "string" && userTier.name.trim())
    return userTier.name.trim();
  const planName = (status as { planStatus?: { planInfo?: { planName?: unknown } } }).planStatus
    ?.planInfo?.planName;
  return typeof planName === "string" && planName.trim() ? planName.trim() : undefined;
}

/**
 * Walk the LS response for `clientModelConfigs` entries — objects carrying a
 * string `label` next to `quotaInfo.remainingFraction`. Pooled downstream into
 * Gemini Pro / Gemini Flash / Claude windows.
 */
function modelsFromBody(body: unknown): AntigravityModelQuota[] {
  const models: AntigravityModelQuota[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const quota =
      obj.quotaInfo && typeof obj.quotaInfo === "object"
        ? (obj.quotaInfo as Record<string, unknown>)
        : undefined;
    if (
      typeof obj.label === "string" &&
      obj.label.trim() &&
      quota &&
      typeof quota.remainingFraction === "number" &&
      Number.isFinite(quota.remainingFraction)
    ) {
      const reset = typeof quota.resetTime === "string" ? Date.parse(quota.resetTime) : NaN;
      models.push({
        label: obj.label,
        remainingFraction: quota.remainingFraction,
        resetsAt: Number.isFinite(reset) ? reset : undefined,
      });
    }
    for (const value of Object.values(obj)) visit(value);
  };
  visit(body);
  return models;
}

/** Probe the running language server; undefined when none is reachable. */
async function scanLanguageServer(nowMs: number): Promise<UsageSnapshot | undefined> {
  const { pids, csrfTokens } = resolveTargets(await listProcesses());
  if (pids.size === 0) return undefined;
  const ports = (await listListeningPorts())
    .filter((entry) => pids.has(entry.pid))
    .map((entry) => entry.port);
  for (const port of [...new Set(ports)]) {
    let body = await queryLs(port, GET_USER_STATUS, csrfTokens);
    let models = body !== undefined ? modelsFromBody(body) : [];
    if (body !== undefined && models.length === 0) {
      // GetUserStatus answered but carried no quota — try the configs endpoint.
      const configs = await queryLs(port, GET_COMMAND_MODEL_CONFIGS, csrfTokens);
      if (configs !== undefined) {
        body = configs;
        models = modelsFromBody(configs);
      }
    }
    const windows = antigravityPoolWindows(models);
    if (windows.length > 0) {
      const plan = planFromUserStatus(body);
      return {
        providerId: "antigravity",
        status: "ok",
        windows,
        fetchedAt: nowMs,
        ...(plan ? { plan } : {}),
      };
    }
  }
  return undefined;
}

/** Build the Antigravity usage snapshot from its local language server. */
export async function scanAntigravityUsage(nowMs: number): Promise<UsageSnapshot> {
  const ls = await scanLanguageServer(nowMs).catch(() => undefined);
  if (ls && ls.windows.length > 0) return ls;
  // No reachable LS: `agy`/the IDE isn't running. The user may well be signed
  // in, so this is "start the app", not "sign in".
  return { providerId: "antigravity", status: "app-not-running", windows: [], fetchedAt: nowMs };
}
