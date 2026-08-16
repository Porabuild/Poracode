import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LOOPBACK_HOST, STARTUP_TIMEOUT_MS } from "./constants.ts";
import { loadProtocolManifest } from "./manifest.ts";
import { detectServerNativeBinding } from "./paths.ts";
import { ProcessCleanup } from "./processCleanup.ts";
import { createLineRedactor, redactLogLine } from "./secrets.ts";
import type { HarnessBlocker, PairingControlResponse } from "./types.ts";

export interface HeadlessLaunch {
  child: ChildProcess;
  readonly baseDir: string;
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
  readonly hostPort: number;
  readonly entrypoint: string;
  readonly repoRoot: string;
  readonly env: NodeJS.ProcessEnv;
}

export function supportsProcessGroups(): boolean {
  return process.platform === "darwin" || process.platform === "linux";
}

export function seedGitFixture(baseDir: string): string {
  const fixtureDir = join(baseDir, "fixture-repo");
  mkdirSync(fixtureDir, { recursive: true });
  writeFileSync(join(fixtureDir, "README.md"), "native-e2e fixture\n", "utf8");
  spawnSync("git", ["-C", fixtureDir, "init"], { stdio: "ignore" });
  return fixtureDir;
}

export async function launchHeadlessServer(input: {
  readonly host: string;
  readonly port: number;
  readonly repoRoot: string;
  readonly entrypoint: string;
  readonly baseDir: string;
  readonly startupTimeoutMs?: number;
  readonly cleanup?: ProcessCleanup;
}): Promise<HeadlessLaunch> {
  const nativeBinding = detectServerNativeBinding(input.repoRoot);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORACODE_BASE_DIR: input.baseDir,
    PORACODE_REMOTE_ACCESS_HOST: input.host,
    PORACODE_REMOTE_ACCESS_PORT: String(input.port),
    PORACODE_REMOTE_ACCESS_ADVERTISED_HOST: input.host,
    PORACODE_APP_VERSION: "native-e2e",
    PORACODE_HEADLESS_SERVER: "1",
    PORACODE_IS_DEV: "0",
  };
  if (nativeBinding) env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBinding;

  const child = spawn(process.execPath, [input.entrypoint], {
    cwd: input.repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: supportsProcessGroups(),
  });
  input.cleanup?.trackChild(child);
  attachRedactedOutput(child);

  const httpBaseUrl = `http://${input.host}:${input.port}/`;
  const wsBaseUrl = `ws://${input.host}:${input.port}/`;
  await waitForEnvironment(httpBaseUrl, input.startupTimeoutMs ?? STARTUP_TIMEOUT_MS, child);
  return {
    child,
    baseDir: input.baseDir,
    httpBaseUrl,
    wsBaseUrl,
    hostPort: input.port,
    entrypoint: input.entrypoint,
    repoRoot: input.repoRoot,
    env,
  };
}

export async function requestPairingJson(
  entrypoint: string,
  baseDir: string,
  repoRoot: string,
  env: NodeJS.ProcessEnv,
): Promise<PairingControlResponse> {
  const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>(
    (resolve, reject) => {
      const child = spawn(process.execPath, [entrypoint, "pair", "--json"], {
        cwd: repoRoot,
        env: { ...env, PORACODE_BASE_DIR: baseDir },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.once("error", reject);
      child.once("exit", (code) => resolve({ stdout, stderr, code }));
    },
  );
  if (result.code !== 0) {
    throw new Error(
      `pair --json exited ${String(result.code)}: ${redactLogLine(result.stderr || result.stdout)}`,
    );
  }
  const parsed = JSON.parse(result.stdout.trim()) as { pairingUrl?: unknown };
  if (typeof parsed.pairingUrl !== "string" || parsed.pairingUrl.length === 0) {
    throw new Error("pair --json returned no pairingUrl.");
  }
  return {
    pairingUrl: parsed.pairingUrl,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
}

export function pairingTokenFromPairingUrl(pairingUrl: string): string | null {
  return new URLSearchParams(new URL(pairingUrl).hash.replace(/^#/, "")).get("token");
}

export async function exchangeAndAddProject(
  httpBaseUrl: string,
  credential: string,
  fixtureDir: string,
): Promise<HarnessBlocker | undefined> {
  const tokenResponse = await fetch(new URL("/oauth/token", httpBaseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grantType: "pairing-token",
      credential,
      scopes: ["session:read", "projects:manage"],
      client: { label: "native-e2e", deviceType: "desktop" },
    }),
  });
  if (!tokenResponse.ok) {
    return {
      code: "project-seed-unavailable",
      message: `Token exchange failed while seeding the git fixture (${String(tokenResponse.status)}).`,
    };
  }
  const token = (await tokenResponse.json()) as { accessToken?: unknown };
  if (typeof token.accessToken !== "string") {
    return {
      code: "project-seed-unavailable",
      message: "Token exchange did not return an access token for project seeding.",
    };
  }
  const add = await fetch(new URL("/api/projects/command", httpBaseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ kind: "add-existing", path: fixtureDir, name: "native-e2e-fixture" }),
  });
  if (!add.ok) {
    return {
      code: "project-seed-unavailable",
      message: `Public project add-existing failed (${String(add.status)}). The production CLI has no separate seed command.`,
    };
  }
  return undefined;
}

export async function waitForEnvironment(
  httpBaseUrl: string,
  timeoutMs: number,
  child: ChildProcess,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "environment endpoint never became ready";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Headless server exited ${String(child.exitCode)} during startup.`);
    }
    try {
      const response = await fetch(new URL("/.well-known/poracode/environment", httpBaseUrl));
      if (response.ok) {
        const body = (await response.json()) as { protocolVersion?: unknown };
        const expected = loadProtocolManifest().protocolVersion;
        if (body.protocolVersion === expected) return;
        lastError = `environment protocolVersion ${String(body.protocolVersion)} != ${String(expected)}`;
      } else {
        lastError = `environment HTTP ${String(response.status)}`;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for production environment: ${lastError}`);
}

export function attachRedactedOutput(child: ChildProcess): void {
  const write = (chunk: string) => {
    if (chunk.trim().length === 0) return;
    process.stderr.write(chunk);
  };
  const stdout = createLineRedactor(write);
  const stderr = createLineRedactor(write);
  child.stdout?.on("data", stdout);
  child.stderr?.on("data", stderr);
}

export async function stopHeadlessChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.killed) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      try {
        if (child.pid && supportsProcessGroups()) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        // gone
      }
      resolve();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      if (child.pid && supportsProcessGroups()) process.kill(-child.pid, "SIGTERM");
      else child.kill("SIGTERM");
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

export { LOOPBACK_HOST };
