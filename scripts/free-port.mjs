import { spawnSync } from "node:child_process";

function parsePort(value) {
  const port = Number.parseInt(value ?? "", 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Expected a TCP port between 1 and 65535, received: ${value ?? "<missing>"}`);
  }

  return port;
}

function run(command, args, errorMessage) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: process.env,
  });

  if (result.error) {
    throw new Error(`${errorMessage}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    throw new Error(stderr ? `${errorMessage}: ${stderr}` : errorMessage);
  }

  return result.stdout.trim();
}

function findListeningPidsWindows(port) {
  const script = [
    "$connections = Get-NetTCPConnection -State Listen -LocalPort " +
      port +
      " -ErrorAction SilentlyContinue",
    "if (-not $connections) { exit 0 }",
    "$connections | Select-Object -ExpandProperty OwningProcess -Unique",
  ].join("; ");

  const output = run(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    `Failed to inspect port ${port}`,
  );

  return output
    .split(/\r?\n/)
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function findListeningPidsUnix(port) {
  const output = run(
    "bash",
    ["-lc", `lsof -nP -iTCP:${port} -sTCP:LISTEN -t 2>/dev/null || true`],
    `Failed to inspect port ${port}`,
  );

  return output
    .split(/\r?\n/)
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function findListeningPids(port) {
  if (process.platform === "win32") {
    return findListeningPidsWindows(port);
  }

  return findListeningPidsUnix(port);
}

function killPidWindows(pid) {
  run("taskkill.exe", ["/PID", String(pid), "/T", "/F"], `Failed to terminate PID ${pid}`);
}

function killPidUnix(pid) {
  const killResult = spawnSync("kill", ["-TERM", String(pid)], {
    encoding: "utf8",
    env: process.env,
  });

  if (killResult.error) {
    throw new Error(`Failed to terminate PID ${pid}: ${killResult.error.message}`);
  }

  if (killResult.status !== 0) {
    const stderr = killResult.stderr.trim();
    throw new Error(
      stderr ? `Failed to terminate PID ${pid}: ${stderr}` : `Failed to terminate PID ${pid}`,
    );
  }
}

function killPid(pid) {
  if (process.platform === "win32") {
    killPidWindows(pid);
    return;
  }

  killPidUnix(pid);
}

try {
  const port = parsePort(process.argv[2]);
  const pids = findListeningPids(port);

  if (pids.length === 0) {
    console.log(`[lightcode] Port ${port} is already free`);
    process.exit(0);
  }

  console.log(
    `[lightcode] Reclaiming port ${port} from PID${pids.length === 1 ? "" : "s"} ${pids.join(", ")}`,
  );

  for (const pid of pids) {
    killPid(pid);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
