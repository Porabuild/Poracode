import { spawn, type ChildProcess, type StdioOptions } from "node:child_process";
import { getWslCommand } from "../agents/base";

/**
 * Long-lived `wsl.exe` child whose stdout is parsed line by line. Used by:
 *   - `projectWatcher.spawnWslWatcher` — bash script invoking the parcel watcher
 *   - `WslBridgeServer` — `node bridge.mjs` listening inside the distro
 *
 * The helper is intentionally minimal: any "what command to run" decision
 * stays in the caller (it owns `argv`), and we only standardise the wsl.exe
 * wrapping, line splitting, and `WSLENV` plumbing.
 */
export interface WslLineChildOpts {
  distro: string;
  /** Optional `--cd <path>` (Linux-style path inside the distro). */
  cwd?: string;
  /**
   * Argv passed verbatim after `--`, e.g. `["bash", "-lc", "<script>"]` or
   * `["node", "/home/me/.poracode/bridge/bridge.mjs"]`.
   */
  argv: string[];
  /**
   * Env vars to expose inside the distro. Each key is added to `WSLENV` so
   * `wsl.exe` actually forwards it (Windows env vars are NOT auto-forwarded).
   * Values are set on the child's Windows-side env — wsl.exe reads them and
   * sets matching Linux env vars before exec.
   */
  env?: Record<string, string>;
  /** stderr piping mode; default `"ignore"` matches projectWatcher's behaviour. */
  stderr?: "ignore" | "pipe" | "inherit";
  stdin?: "ignore" | "pipe";
  /** Called per non-empty trimmed line of stdout. */
  onLine: (line: string) => void;
  /** Called for spawn errors and onLine throws. */
  onError?: (error: Error) => void;
}

/**
 * Spawn `wsl.exe -d <distro> [--cd <cwd>] -- <argv...>` and forward
 * newline-delimited stdout to `onLine`. Returns the underlying ChildProcess
 * so the caller can attach exit handlers and tear it down.
 */
export function spawnWslLineChild(opts: WslLineChildOpts): ChildProcess {
  const env: Record<string, string | undefined> = { ...process.env };

  if (opts.env && Object.keys(opts.env).length > 0) {
    let wslenv = env.WSLENV ?? "";
    const present = new Set(
      wslenv
        .split(":")
        .map((entry) => entry.replace(/\/.*/, ""))
        .filter((entry) => entry.length > 0),
    );
    for (const [key, value] of Object.entries(opts.env)) {
      env[key] = value;
      if (!present.has(key)) {
        wslenv = wslenv ? `${wslenv}:${key}` : key;
        present.add(key);
      }
    }
    env.WSLENV = wslenv;
  }

  const cwdArgs = opts.cwd ? ["--cd", opts.cwd] : [];
  const stdio: StdioOptions = [opts.stdin ?? "ignore", "pipe", opts.stderr ?? "ignore"];

  const child = spawn(getWslCommand(), ["-d", opts.distro, ...cwdArgs, "--", ...opts.argv], {
    stdio,
    windowsHide: true,
    env: env as NodeJS.ProcessEnv,
  });

  attachLineSplitter(child, opts);

  child.on("error", (error) => {
    opts.onError?.(error);
  });

  return child;
}

/**
 * Wire stdout to a per-line callback. Exposed for tests so they can drive
 * the splitter against a fake `child_process` stream without involving real
 * `wsl.exe`.
 */
export function attachLineSplitter(
  child: Pick<ChildProcess, "stdout">,
  opts: Pick<WslLineChildOpts, "onLine" | "onError">,
): void {
  if (!child.stdout) return;
  let buffer = "";
  child.stdout.on("data", (chunk: Buffer | string) => {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let nlIndex = buffer.indexOf("\n");
    while (nlIndex !== -1) {
      const raw = buffer.slice(0, nlIndex);
      buffer = buffer.slice(nlIndex + 1);
      const line = raw.replace(/\r$/, "").trim();
      if (line.length > 0) {
        try {
          opts.onLine(line);
        } catch (error) {
          opts.onError?.(error instanceof Error ? error : new Error(String(error)));
        }
      }
      nlIndex = buffer.indexOf("\n");
    }
  });
}
