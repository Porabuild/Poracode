import { spawnSync } from "node:child_process";

function parsePort(value) {
  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Expected a TCP port between 1 and 65535, received: ${value}`);
  }

  return port;
}

function parsePorts(values) {
  if (values.length === 0) {
    throw new Error("Expected a TCP port or port range");
  }

  return values.flatMap((value) => {
    const range = value.split("-");
    if (range.length === 1) {
      return [parsePort(value)];
    }
    if (range.length !== 2) {
      throw new Error(`Expected a TCP port or port range, received: ${value}`);
    }

    const start = parsePort(range[0]);
    const end = parsePort(range[1]);
    if (start > end) {
      throw new Error(`Expected an ascending TCP port range, received: ${value}`);
    }

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });
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

function findListeningPidsWindows(ports) {
  const script = [
    `$ports = @(${ports.join(",")})`,
    "$connections = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | " +
      "Where-Object { $_.LocalPort -in $ports }",
    "if (-not $connections) { exit 0 }",
    "$connections | Select-Object -ExpandProperty OwningProcess -Unique",
  ].join("; ");

  const output = run(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    "Failed to inspect ports",
  );

  return output
    .split(/\r?\n/)
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function findListeningPidsUnix(ports) {
  const portArguments = ports.map((port) => `-iTCP:${port}`).join(" ");
  const output = run(
    "bash",
    ["-lc", `lsof -nP ${portArguments} -sTCP:LISTEN -t 2>/dev/null || true`],
    "Failed to inspect ports",
  );

  return output
    .split(/\r?\n/)
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function findListeningPids(ports) {
  if (process.platform === "win32") {
    return findListeningPidsWindows(ports);
  }

  return findListeningPidsUnix(ports);
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPortsFree(ports, timeoutMs = 5000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (findListeningPids(ports).length === 0) {
      return;
    }

    await sleep(200);
  }

  throw new Error(`Port range still in use after ${timeoutMs}ms`);
}

try {
  const ports = parsePorts(process.argv.slice(2));
  const pids = findListeningPids(ports);
  const portLabel =
    ports.length === 1 ? `Port ${ports[0]}` : `Ports ${process.argv.slice(2).join(", ")}`;
  const verb = ports.length === 1 ? "is" : "are";

  if (pids.length === 0) {
    console.log(`[poracode] ${portLabel} ${verb} already free`);
    process.exit(0);
  }

  console.log(
    `[poracode] Reclaiming ${portLabel.toLowerCase()} from PID${pids.length === 1 ? "" : "s"} ${pids.join(", ")}`,
  );

  for (const pid of pids) {
    killPid(pid);
  }

  await waitForPortsFree(ports);
  console.log(`[poracode] ${portLabel} ${verb} now free`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
