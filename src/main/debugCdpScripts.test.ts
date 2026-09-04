import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type RequestListener, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "../..");
const cdpScript = join(repoRoot, ".agents/skills/interactive-testing/scripts/poracode-cdp.mjs");
const runnerScript = join(
  repoRoot,
  ".agents/skills/interactive-testing/scripts/run-poracode-smoke.mjs",
);
const integrationScript = join(
  repoRoot,
  ".agents/skills/interactive-testing/scripts/poracode-integration-smoke.mjs",
);
const debugSessionModulePath: string =
  "../../.agents/skills/interactive-testing/scripts/poracode-debug-session.mjs";
const cdpTargetModulePath: string =
  "../../.agents/skills/interactive-testing/scripts/poracode-cdp-target.mjs";
const debugSessionModule = import(debugSessionModulePath);
const cdpTargetModule = import(cdpTargetModulePath);

describe("managed CDP scripts", () => {
  it("sets Electron userData before the isolated Windows identity is resolved", async () => {
    const [runnerSource, devLaunchSource] = await Promise.all([
      readFile(runnerScript, "utf8"),
      readFile(join(repoRoot, "scripts/dev-launch.mjs"), "utf8"),
    ]);

    expect(runnerSource).toContain('PORACODE_CDP_USER_DATA_DIR: join(dataDir, "userData")');
    expect(devLaunchSource).toContain("`--user-data-dir=${cdpUserDataDir}`");
    expect(devLaunchSource).toContain("const app = spawn(electronPath");
    expect(devLaunchSource).toContain('windowsHide: process.platform === "win32"');
    expect(devLaunchSource).toContain('execSync("electronmon .", { stdio: "inherit", env })');
  });

  it("reports readiness from renderer and CDP state only", async () => {
    const { isCdpWindowReady } = await cdpTargetModule;
    const state = {
      windowKind: "main",
      readyState: "complete",
      rootChildren: 1,
      bodyTextLength: 100,
      devBridge: true,
      viteError: null,
      crashScreen: false,
    };

    expect(isCdpWindowReady(state, "main")).toBe(true);
    expect(isCdpWindowReady({ ...state, devBridge: false }, "main")).toBe(false);
  });

  it("requires an explicit independent-session opt-in for detached launch", async () => {
    const result = await runScript(cdpScript, ["launch"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("detached launch requires --new");
  });

  it("rejects detached launch roots inside the repository", async () => {
    const invalidRoot = join(repoRoot, "tmp", `invalid-detached-root-${process.pid}-${Date.now()}`);
    const result = await runScript(cdpScript, ["launch", "--new", "--root", invalidRoot]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("debug session root must be outside the repository");
    await expect(
      import("node:fs/promises").then(({ access }) => access(invalidRoot)),
    ).rejects.toThrow(/ENOENT/);
  });

  it("refuses to guess a missing half of an explicit connection", async () => {
    const result = await runScript(cdpScript, ["eval", "location.href", "--port", "45678"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("requires both PORACODE_CDP_PORT and PORACODE_APP_URL");
  });

  it("rejects a reachable Vite port as non-CDP without waiting", async () => {
    const server = await listen((request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<!doctype html><title>Vite</title>");
    });
    try {
      const port = addressPort(server);
      const started = Date.now();
      const result = await runScript(cdpScript, [
        "eval",
        "location.href",
        "--port",
        String(port),
        "--appUrl",
        `http://127.0.0.1:${port}/`,
      ]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("is reachable but is not a CDP endpoint");
      expect(Date.now() - started).toBeLessThan(1_000);
    } finally {
      await close(server);
    }
  });

  it("reports the available target when the app URL is wrong", async () => {
    const server = await listen((request, response) => {
      response.setHeader("content-type", "application/json");
      if (request.url === "/json/version") {
        response.end(
          JSON.stringify({
            Browser: "Chrome/test",
            webSocketDebuggerUrl: "ws://127.0.0.1/unused",
          }),
        );
        return;
      }
      response.end(
        JSON.stringify([
          {
            id: "main-target",
            type: "page",
            title: "Poracode",
            url: "http://127.0.0.1:3100/?poracodeDebugSession=correct",
            webSocketDebuggerUrl: "ws://127.0.0.1/unused",
          },
        ]),
      );
    });
    try {
      const port = addressPort(server);
      const result = await runScript(cdpScript, [
        "eval",
        "location.href",
        "--port",
        String(port),
        "--appUrl",
        "http://127.0.0.1:3100/?poracodeDebugSession=wrong",
      ]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("main-target:http://127.0.0.1:3100/");
      expect(result.stderr).toContain("do not substitute a Vite or stale CDP port");
    } finally {
      await close(server);
    }
  });

  it("refuses ambiguous active sessions instead of picking one", async () => {
    const smokeRoot = await mkdtemp(join(tmpdir(), "poracode-cdp-sessions-"));
    try {
      await writeSession(smokeRoot, "one", 41001);
      await writeSession(smokeRoot, "two", 41002);
      const result = await runScript(cdpScript, ["eval", "location.href"], {
        PORACODE_SMOKE_ROOT: smokeRoot,
      });

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("multiple active Poracode debug sessions");
      expect(result.stderr).toContain("--session <session.json>");
    } finally {
      await rm(smokeRoot, { recursive: true, force: true });
    }
  });

  it("rejects stopped explicit sessions", async () => {
    const smokeRoot = await mkdtemp(join(tmpdir(), "poracode-cdp-stopped-"));
    try {
      const sessionFile = await writeSession(smokeRoot, "stopped", 41003, "stopped");
      const result = await runScript(cdpScript, ["info", "--session", sessionFile]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("debug session is not active");
      expect(result.stderr).toContain("state stopped");
    } finally {
      await rm(smokeRoot, { recursive: true, force: true });
    }
  });

  it("rejects explicit sessions from another checkout or purpose", async () => {
    const smokeRoot = await mkdtemp(join(tmpdir(), "poracode-cdp-scope-"));
    try {
      const wrongCheckout = await writeSession(smokeRoot, "wrong-checkout", 41006, "ready", {
        repoRoot: join(repoRoot, "another-checkout"),
      });
      const checkoutResult = await runScript(cdpScript, ["info", "--session", wrongCheckout]);
      expect(checkoutResult.code).toBe(1);
      expect(checkoutResult.stderr).toContain("belongs to a different checkout");

      const wrongPurpose = await writeSession(smokeRoot, "wrong-purpose", 41007, "ready", {
        purpose: "smoke",
      });
      const purposeResult = await runScript(cdpScript, ["info", "--session", wrongPurpose]);
      expect(purposeResult.code).toBe(1);
      expect(purposeResult.stderr).toContain("requires a debug session");
    } finally {
      await rm(smokeRoot, { recursive: true, force: true });
    }
  });

  it("rejects a managed session whose isolation mode does not match", async () => {
    const smokeRoot = await mkdtemp(join(tmpdir(), "poracode-cdp-mode-"));
    try {
      const sessionFile = await writeSession(smokeRoot, "mock-session", 41004);
      const result = await runScript(integrationScript, [
        "run",
        "--mode",
        "real",
        "--session",
        sessionFile,
      ]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("session mode is mock");
      expect(result.stderr).toContain("requested real");

      const alternateRoot = join(smokeRoot, "should-not-launch");
      const launchResult = await runScript(
        runnerScript,
        ["--launch-only", "--mode", "real", "--root", alternateRoot],
        { PORACODE_SMOKE_ROOT: smokeRoot },
      );
      expect(launchResult.code).toBe(1);
      expect(launchResult.stderr).toContain("active debug session mode is mock");
      await expect(
        import("node:fs/promises").then(({ access }) => access(alternateRoot)),
      ).rejects.toThrow(/ENOENT/);
    } finally {
      await rm(smokeRoot, { recursive: true, force: true });
    }
  });

  it("does not claim an unresponsive ready session is reusable", async () => {
    const smokeRoot = await mkdtemp(join(tmpdir(), "poracode-cdp-unhealthy-"));
    try {
      await writeSession(smokeRoot, "unhealthy", 41005);
      const alternateRoot = join(smokeRoot, "should-not-launch");
      const result = await runScript(
        runnerScript,
        ["--launch-only", "--mode", "mock", "--root", alternateRoot],
        { PORACODE_SMOKE_ROOT: smokeRoot },
      );

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("active debug session is not healthy");
      expect(result.stderr).toContain("Stop its owning terminal before relaunching");
      await expect(
        import("node:fs/promises").then(({ access }) => access(alternateRoot)),
      ).rejects.toThrow(/ENOENT/);
    } finally {
      await rm(smokeRoot, { recursive: true, force: true });
    }
  });

  it("serializes launch reservations for the same checkout", async () => {
    const { acquireDebugLaunchLock } = await debugSessionModule;
    const release = await acquireDebugLaunchLock(repoRoot);
    try {
      await expect(acquireDebugLaunchLock(repoRoot)).rejects.toThrow(
        /another managed debug launcher is already reserving this checkout/,
      );
    } finally {
      await release();
    }
    const releaseAgain = await acquireDebugLaunchLock(repoRoot);
    await releaseAgain();
  });

  it("recovers an ownerless launch reservation after its creation grace period", async () => {
    const { acquireDebugLaunchLock } = await debugSessionModule;
    const lockRepo = join(tmpdir(), `poracode-ownerless-lock-${process.pid}-${Date.now()}`);
    const releaseOriginal = await acquireDebugLaunchLock(lockRepo);
    const lockKey = createHash("sha256")
      .update(process.platform === "win32" ? resolve(lockRepo).toLowerCase() : resolve(lockRepo))
      .digest("hex")
      .slice(0, 20);
    const lockDir = join(tmpdir(), "poracode-debug-launch-locks", lockKey);
    await rm(join(lockDir, "owner.json"));
    await new Promise((done) => setTimeout(done, 1_100));

    const recovered = acquireDebugLaunchLock(lockRepo);
    await expect(recovered).resolves.toBeTypeOf("function");
    const releaseRecovered = await recovered;
    await releaseRecovered();
    await releaseOriginal();
  });

  it("rejects session roots inside the repository before creating them", async () => {
    const invalidRoot = join(repoRoot, "tmp", `invalid-cdp-root-${process.pid}-${Date.now()}`);
    const result = await runScript(runnerScript, ["--launch-only", "--new", "--root", invalidRoot]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("debug session root must be outside the repository");
    await expect(
      import("node:fs/promises").then(({ access }) => access(invalidRoot)),
    ).rejects.toThrow(/ENOENT/);
  });
});

async function runScript(
  script: string,
  args: string[],
  env: Record<string, string> = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [script, ...args], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PORACODE_DEBUG_SESSION: "",
        PORACODE_CDP_PORT: "",
        PORACODE_APP_URL: "",
        ...env,
      },
      encoding: "utf8",
      windowsHide: process.platform === "win32",
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as Error & { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? failure.message,
    };
  }
}

async function writeSession(
  root: string,
  id: string,
  cdpPort: number,
  state = "ready",
  overrides: Record<string, unknown> = {},
) {
  const sessionRoot = join(root, id);
  const sessionFile = join(sessionRoot, "session.json");
  const { writeDebugSession } = await debugSessionModule;
  await writeDebugSession(sessionFile, {
    id,
    token: `${id}-token`,
    purpose: "debug",
    state,
    repoRoot,
    root: sessionRoot,
    appUrl: `http://127.0.0.1:3100/?poracodeDebugSession=${id}`,
    cdpPort,
    devServerPort: 3100,
    ownerPid: process.pid,
    mode: "mock",
    startedAt: new Date().toISOString(),
    ...overrides,
  });
  return sessionFile;
}

async function listen(handler: RequestListener): Promise<Server> {
  const server = createServer(handler);
  await new Promise<void>((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  return server;
}

function addressPort(server: Server): number {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server has no TCP address");
  return address.port;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
}

describe("dev port preparation", () => {
  it("parses listener owners independently of Windows display language", async () => {
    const modulePath: string = "../../scripts/free-port.mjs";
    const { parseListeningPidsWindows } = (await import(modulePath)) as {
      parseListeningPidsWindows: (output: string, ports: number[]) => number[];
    };
    const output = [
      "  TCP    0.0.0.0:3100       0.0.0.0:0       LISTENING    101",
      "  TCP    [::]:3100          [::]:0          ABHÖREN      101",
      "  TCP    127.0.0.1:3200     0.0.0.0:0       ABHÖREN      202",
      "  TCP    [::1]:3200         [::]:0          ÉCOUTE       303",
      "  TCP    127.0.0.1:3100     127.0.0.1:9000  ESTABLISHED  404",
      "  TCP    127.0.0.1:3300     0.0.0.0:0       LISTENING    505",
      "  UDP    0.0.0.0:3100       *:*                          606",
    ].join("\n");
    expect(parseListeningPidsWindows(output, [3100, 3200, 3100])).toEqual([101, 202, 303]);
  });

  it("accepts an unused port without reclaiming another process", async () => {
    const server = await listen((_request, response) => response.end());
    const port = addressPort(server);
    await close(server);
    const result = await execFileAsync(
      process.execPath,
      [join(repoRoot, "scripts/free-port.mjs"), String(port)],
      {
        env: { ...process.env, PORACODE_DEV_SERVER_REQUIRE_FREE: "1" },
        timeout: 10_000,
      },
    );
    expect(result.stdout).toContain("already free");
  });

  it("keeps an occupied port's server alive when reclaiming is forbidden", async () => {
    const server = await listen((_request, response) => response.end("alive"));
    const port = addressPort(server);
    try {
      await expect(
        execFileAsync(process.execPath, [join(repoRoot, "scripts/free-port.mjs"), String(port)], {
          env: { ...process.env, PORACODE_DEV_SERVER_REQUIRE_FREE: "1" },
          timeout: 10_000,
        }),
      ).rejects.toMatchObject({ stderr: expect.stringContaining("Refusing to reclaim") });
      expect(await (await fetch(`http://127.0.0.1:${port}`)).text()).toBe("alive");
    } finally {
      await close(server);
    }
  });
});
