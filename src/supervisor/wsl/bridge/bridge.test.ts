import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * End-to-end tests for the in-distro bridge server. `bridge.mjs` uses
 * `node:path/posix` because it runs in a Linux distro in production — so
 * these tests must also execute on a POSIX host to exercise real paths.
 * On Windows dev machines the suite is skipped; CI in WSL / Linux runs it.
 */
const describeOnPosix = process.platform === "linux" ? describe : describe.skip;

const SECRET = "integration-test-secret";
const BRIDGE_SCRIPT = join(__dirname, "bridge.mjs");

interface RunningBridge {
  child: ChildProcess;
  baseUrl: string;
  dispose: () => Promise<void>;
}

async function startBridge(extraEnv: Record<string, string> = {}): Promise<RunningBridge> {
  const child = spawn(process.execPath, [BRIDGE_SCRIPT], {
    env: { ...process.env, PORACODE_HOOK_SECRET: SECRET, ...extraEnv },
    stdio: ["ignore", "pipe", "ignore"],
  });

  const baseUrl = await new Promise<string>((resolveUrl, reject) => {
    const rl = createInterface({ input: child.stdout! });
    const timer = setTimeout(() => reject(new Error("boot timed out")), 5_000);
    rl.on("line", (line) => {
      try {
        const msg = JSON.parse(line);
        if (msg.type === "boot" && typeof msg.port === "number") {
          clearTimeout(timer);
          resolveUrl(`http://127.0.0.1:${msg.port}`);
        }
      } catch {
        // ignore non-JSON
      }
    });
    child.once("exit", () => reject(new Error("bridge exited before boot")));
  });

  return {
    child,
    baseUrl,
    dispose: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null) return resolve();
        child.once("exit", () => resolve());
        child.kill();
      }),
  };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function listenLocalServer(server: Server, preferredHost: string): Promise<string> {
  return new Promise((resolve, reject) => {
    function listen(host: string) {
      server.once("error", (error: NodeJS.ErrnoException) => {
        if (host === preferredHost && error.code === "EADDRNOTAVAIL") {
          listen("0.0.0.0");
          return;
        }
        reject(error);
      });
      server.listen(0, host, () => {
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("unexpected address");
        resolve(`http://${host}:${address.port}`);
      });
    }
    listen(preferredHost);
  });
}

async function post(url: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  return { status: response.status, body: parsed };
}

describe("bridge.mjs Browser MCP proxy", () => {
  let upstream: Server;
  let upstreamBaseUrl: string;
  let bridge: RunningBridge;
  let received:
    | {
        url: string | undefined;
        authorization: string | undefined;
        sessionId: string | undefined;
        body: string;
      }
    | undefined;

  beforeEach(async () => {
    received = undefined;
    upstream = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        received = {
          url: req.url,
          authorization: req.headers.authorization,
          sessionId:
            typeof req.headers["mcp-session-id"] === "string"
              ? req.headers["mcp-session-id"]
              : undefined,
          body: Buffer.concat(chunks).toString("utf8"),
        };
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.setHeader("mcp-session-id", "upstream-session");
        res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }));
      });
    });
    upstreamBaseUrl = await listenLocalServer(upstream, "0.0.0.0");
    bridge = await startBridge({
      PORACODE_BROWSER_MCP_URL: upstreamBaseUrl,
      PORACODE_BROWSER_MCP_TOKEN: "upstream-token",
    });
  });

  afterEach(async () => {
    await bridge.dispose();
    await closeServer(upstream);
  });

  it("serves a WSL-local MCP endpoint that proxies to the host browser MCP", async () => {
    const response = await fetch(`${bridge.baseUrl}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${SECRET}`,
        "content-type": "application/json",
        "mcp-session-id": "agent-session",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("mcp-session-id")).toBe("upstream-session");
    await expect(response.json()).resolves.toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { ok: true },
    });
    expect(received).toEqual({
      url: "/mcp",
      authorization: "Bearer upstream-token",
      sessionId: "agent-session",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
  });

  it("reaches a loopback-only upstream even when a default gateway exists (mirrored networking)", async () => {
    // In mirrored WSL networking the default gateway is the LAN router, not
    // the host; the proxy must not force-rewrite 127.0.0.1 to it.
    const loopbackUpstream = createServer((_req, res) => {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: 7, result: { via: "loopback" } }));
    });
    const loopbackBaseUrl = await listenLocalServer(loopbackUpstream, "127.0.0.1");
    const loopbackBridge = await startBridge({
      PORACODE_BROWSER_MCP_URL: loopbackBaseUrl,
      PORACODE_BROWSER_MCP_TOKEN: "upstream-token",
    });

    try {
      const response = await fetch(`${loopbackBridge.baseUrl}/mcp`, {
        method: "POST",
        headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "initialize", params: {} }),
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        jsonrpc: "2.0",
        id: 7,
        result: { via: "loopback" },
      });
    } finally {
      await loopbackBridge.dispose();
      await closeServer(loopbackUpstream);
    }
  });

  it("matches the host MCP endpoint when clients probe SSE with GET", async () => {
    const response = await fetch(`${bridge.baseUrl}/mcp`, {
      method: "GET",
      headers: { authorization: `Bearer ${SECRET}` },
    });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(received).toBeUndefined();
  });
});

describeOnPosix("bridge.mjs fs endpoints", () => {
  let bridge: RunningBridge;
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = mkdtempSync(join(tmpdir(), "lc-bridge-root-"));
    mkdirSync(join(projectRoot, "src"));
    writeFileSync(join(projectRoot, "README.md"), "hi");
    writeFileSync(join(projectRoot, "src", "index.ts"), "// x");
    bridge = await startBridge();
  });

  afterEach(async () => {
    await bridge.dispose();
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("readdir lists files and directories", async () => {
    const { status, body } = await post(`${bridge.baseUrl}/v1/fs/readdir`, {
      projectRoot: projectRoot,
      path: projectRoot,
    });
    expect(status).toBe(200);
    const envelope = body as { ok: boolean; data: { entries: { name: string; type: string }[] } };
    expect(envelope.ok).toBe(true);
    const names = envelope.data.entries.map((e) => e.name).sort();
    expect(names).toEqual(["README.md", "src"]);
  });

  it("readdir with includeChildCount marks empty dirs", async () => {
    mkdirSync(join(projectRoot, "empty"));
    const { body } = await post(`${bridge.baseUrl}/v1/fs/readdir`, {
      projectRoot: projectRoot,
      path: projectRoot,
      includeChildCount: true,
    });
    const envelope = body as {
      data: { entries: { name: string; type: string; hasChildren?: boolean }[] };
    };
    const empty = envelope.data.entries.find((e) => e.name === "empty");
    const src = envelope.data.entries.find((e) => e.name === "src");
    expect(empty?.hasChildren).toBe(false);
    expect(src?.hasChildren).toBe(true);
  });

  it("readdir rejects paths that escape the project root", async () => {
    const { status, body } = await post(`${bridge.baseUrl}/v1/fs/readdir`, {
      projectRoot: projectRoot,
      path: "/etc",
    });
    expect(status).toBe(400);
    const envelope = body as { ok: boolean; code: string };
    expect(envelope.ok).toBe(false);
    expect(envelope.code).toBe("ESCAPE");
  });

  it("rejects unauthorized requests", async () => {
    const response = await fetch(`${bridge.baseUrl}/v1/fs/readdir`, {
      method: "POST",
      headers: { authorization: "Bearer WRONG", "content-type": "application/json" },
      body: JSON.stringify({ projectRoot, path: projectRoot }),
    });
    expect(response.status).toBe(401);
  });

  it("stat returns batched stats with Node-style error codes", async () => {
    const { body } = await post(`${bridge.baseUrl}/v1/fs/stat`, {
      projectRoot: projectRoot,
      paths: [join(projectRoot, "README.md"), join(projectRoot, "missing.txt")],
    });
    const envelope = body as {
      data: {
        stats: { path: string; exists: boolean; isFile?: boolean; code?: string }[];
      };
    };
    expect(envelope.data.stats).toHaveLength(2);
    expect(envelope.data.stats[0]?.exists).toBe(true);
    expect(envelope.data.stats[0]?.isFile).toBe(true);
    expect(envelope.data.stats[1]?.exists).toBe(false);
    expect(envelope.data.stats[1]?.code).toBe("ENOENT");
  });

  it("find walks the tree, skips ignored dirs, and caps at maxEntries", async () => {
    mkdirSync(join(projectRoot, "node_modules"));
    writeFileSync(join(projectRoot, "node_modules", "a.js"), "");
    const { body } = await post(`${bridge.baseUrl}/v1/fs/find`, {
      projectRoot: projectRoot,
      maxEntries: 100,
      ignore: ["node_modules", ".git"],
    });
    const envelope = body as {
      data: { entries: { path: string; name: string; type: string }[]; truncated: boolean };
    };
    const paths = envelope.data.entries.map((e) => e.path).sort();
    expect(paths).toContain("README.md");
    expect(paths).toContain("src");
    expect(paths).toContain("src/index.ts");
    expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
    expect(envelope.data.truncated).toBe(false);
  });

  it("find retains newest matching files across the full tree, evicting the oldest", async () => {
    mkdirSync(join(projectRoot, "old"));
    mkdirSync(join(projectRoot, "mid"));
    mkdirSync(join(projectRoot, "new"));
    const oldPath = join(projectRoot, "old", "session.jsonl");
    const midPath = join(projectRoot, "mid", "session.jsonl");
    const newPath = join(projectRoot, "new", "session.jsonl");
    writeFileSync(oldPath, "old");
    writeFileSync(midPath, "mid");
    writeFileSync(newPath, "new");
    utimesSync(oldPath, new Date(1_000), new Date(1_000));
    utimesSync(midPath, new Date(1_500), new Date(1_500));
    utimesSync(newPath, new Date(2_000), new Date(2_000));

    const { body } = await post(`${bridge.baseUrl}/v1/fs/find`, {
      projectRoot,
      maxEntries: 2,
      fileName: "session.jsonl",
      newestFirst: true,
    });
    const envelope = body as {
      data: {
        entries: { path: string; name: string; type: string; mtimeMs?: number }[];
        truncated: boolean;
      };
    };
    expect(envelope.data.entries).toEqual([
      { path: "new/session.jsonl", name: "session.jsonl", type: "file", mtimeMs: 2_000 },
      { path: "mid/session.jsonl", name: "session.jsonl", type: "file", mtimeMs: 1_500 },
    ]);
    expect(envelope.data.truncated).toBe(true);
  });

  it("classifies symlinks and their target kind", async () => {
    try {
      symlinkSync(join(projectRoot, "src"), join(projectRoot, "src-link"));
    } catch {
      // Symlink creation can require admin on Windows — skip the assertion if
      // the kernel refused to make the link rather than flake the test suite.
      return;
    }
    const { body } = await post(`${bridge.baseUrl}/v1/fs/readdir`, {
      projectRoot: projectRoot,
      path: projectRoot,
    });
    const envelope = body as {
      data: { entries: { name: string; type: string; isDirectoryLink?: boolean }[] };
    };
    const link = envelope.data.entries.find((e) => e.name === "src-link");
    expect(link?.type).toBe("symlink");
    expect(link?.isDirectoryLink).toBe(true);
  });

  it("creates git checkpoint snapshots inside the bridge process", async () => {
    git(projectRoot, "init");
    git(projectRoot, "config", "user.email", "test@example.com");
    git(projectRoot, "config", "user.name", "Poracode Test");
    git(projectRoot, "add", "README.md");
    git(projectRoot, "commit", "-m", "init");
    writeFileSync(join(projectRoot, "README.md"), "after");
    writeFileSync(join(projectRoot, "new.txt"), "new");

    const metadata = {
      threadId: "thread-1",
      checkpointItemId: "user-1",
      capturedAt: "2026-05-16T00:00:00.000Z",
      ref: "refs/poracode/checkpoints/dGhyZWFkLTE/dXNlci0x",
      // Finalized checkpoints can carry a large changed-file manifest. Keep it
      // above common argv limits to prove commit-tree receives it over stdin.
      changedFiles: [{ path: `generated/${"x".repeat(300_000)}.txt` }],
    };
    const { status, body } = await post(`${bridge.baseUrl}/v1/git/checkpoint-snapshot`, {
      projectRoot,
      ref: metadata.ref,
      metadata,
    });

    expect(status).toBe(200);
    const envelope = body as { ok: boolean; data: { commit: string } };
    expect(envelope.ok).toBe(true);
    const commit = envelope.data.commit;
    expect(git(projectRoot, "rev-parse", "--verify", metadata.ref).trim()).toBe(commit);
    git(projectRoot, "read-tree", "--reset", "-u", metadata.ref);
    expect(readFileSync(join(projectRoot, "README.md"), "utf8")).toBe("after");
    expect(readFileSync(join(projectRoot, "new.txt"), "utf8")).toBe("new");
    expect(
      readdirSync(join(projectRoot, ".git")).some((name) => name.startsWith("index.poracode-")),
    ).toBe(false);
  });

  it("falls back to a Poracode identity when the repository has no git identity", async () => {
    git(projectRoot, "init");
    // Fresh distros can have no user.name/user.email in any config scope.
    // Route the bridge's own global/system config at nonexistent files so it
    // sees exactly that, instead of inheriting the host's real identity.
    const identityBridge = await startBridge({
      GIT_CONFIG_GLOBAL: join(projectRoot, "absent-global-config"),
      GIT_CONFIG_SYSTEM: join(projectRoot, "absent-system-config"),
      GIT_CONFIG_NOSYSTEM: "1",
    });
    try {
      const metadata = {
        threadId: "thread-1",
        checkpointItemId: "user-1",
        capturedAt: "2026-05-16T00:00:00.000Z",
        ref: "refs/poracode/checkpoints/dGhyZWFkLTE/dXNlci0x",
      };
      const { status, body } = await post(`${identityBridge.baseUrl}/v1/git/checkpoint-snapshot`, {
        projectRoot,
        ref: metadata.ref,
        metadata,
      });

      expect(status).toBe(200);
      const envelope = body as { ok: boolean; data: { commit: string } };
      expect(envelope.ok).toBe(true);
      expect(git(projectRoot, "log", "-1", "--format=%an <%ae>", envelope.data.commit).trim()).toBe(
        "Poracode <checkpoints@poracode.local>",
      );
    } finally {
      await identityBridge.dispose();
    }
  });

  it("runs structured git batches without a shell", async () => {
    git(projectRoot, "init");
    git(projectRoot, "config", "user.email", "test@example.com");
    git(projectRoot, "config", "user.name", "Poracode Test");

    const { status, body } = await post(`${bridge.baseUrl}/v1/git/batch`, {
      timeoutMs: 10_000,
      commands: [
        { cwd: projectRoot, args: ["rev-parse", "--is-inside-work-tree"] },
        { cwd: projectRoot, args: ["status", "--porcelain=v2", "-b"] },
      ],
    });

    expect(status).toBe(200);
    const envelope = body as {
      ok: boolean;
      data: { results: Array<{ ok: boolean; stdout: string; exitCode: number }> };
    };
    expect(envelope.ok).toBe(true);
    expect(envelope.data.results[0]).toMatchObject({ ok: true, stdout: "true\n", exitCode: 0 });
    expect(envelope.data.results[1]?.stdout).toContain("# branch.head");
  });

  it("runs structured process batches without a shell", async () => {
    const { status, body } = await post(`${bridge.baseUrl}/v1/process/batch`, {
      timeoutMs: 10_000,
      commands: [
        {
          command: process.execPath,
          cwd: projectRoot,
          args: ["-e", "process.stdout.write(process.cwd())"],
        },
      ],
    });

    expect(status).toBe(200);
    const envelope = body as {
      ok: boolean;
      data: { results: Array<{ ok: boolean; stdout: string; exitCode: number }> };
    };
    expect(envelope.ok).toBe(true);
    expect(envelope.data.results[0]).toMatchObject({
      ok: true,
      stdout: projectRoot,
      exitCode: 0,
    });
  });

  it("kills a timed-out process and its descendants", async () => {
    const script = [
      'const { spawn } = require("node:child_process");',
      'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" });',
      "process.stdout.write(String(child.pid));",
      "setInterval(() => {}, 1000);",
    ].join("\n");
    const { status, body } = await post(`${bridge.baseUrl}/v1/process/exec`, {
      command: process.execPath,
      cwd: projectRoot,
      args: ["-e", script],
      timeoutMs: 1_000,
    });
    const envelope = body as {
      ok: boolean;
      data: { ok: boolean; stdout: string; timedOut?: boolean };
    };
    const descendantPid = Number(envelope.data.stdout);

    try {
      expect(status).toBe(200);
      expect(envelope.ok).toBe(true);
      expect(envelope.data).toMatchObject({ ok: false, timedOut: true });
      expect(Number.isInteger(descendantPid)).toBe(true);
      await expect.poll(() => isProcessRunning(descendantPid), { timeout: 3_000 }).toBe(false);
    } finally {
      try {
        process.kill(descendantPid, "SIGKILL");
      } catch {
        // Already reaped by the bridge timeout.
      }
    }
  });

  it("kills a successful process command's remaining process group", async () => {
    const script = [
      'const { spawn } = require("node:child_process");',
      'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });',
      "child.unref();",
      "process.stdout.write(String(child.pid));",
    ].join("\n");
    const { status, body } = await post(`${bridge.baseUrl}/v1/process/exec`, {
      command: process.execPath,
      cwd: projectRoot,
      args: ["-e", script],
      timeoutMs: 5_000,
    });
    const envelope = body as {
      ok: boolean;
      data: { ok: boolean; stdout: string; exitCode: number };
    };
    const descendantPid = Number(envelope.data.stdout);

    try {
      expect(status).toBe(200);
      expect(envelope.ok).toBe(true);
      expect(envelope.data).toMatchObject({ ok: true, exitCode: 0 });
      expect(Number.isInteger(descendantPid)).toBe(true);
      await expect.poll(() => isProcessRunning(descendantPid), { timeout: 3_000 }).toBe(false);
    } finally {
      try {
        process.kill(descendantPid, "SIGKILL");
      } catch {
        // Already reaped by the bridge completion cleanup.
      }
    }
  });

  it("strips inherited Git control variables from process env", async () => {
    await bridge.dispose();
    bridge = await startBridge({ GIT_DIR: "/tmp/host-git-dir" });

    const { status, body } = await post(`${bridge.baseUrl}/v1/process/exec`, {
      command: "sh",
      cwd: projectRoot,
      args: ["-lc", 'printf "%s" "${GIT_DIR:-missing}"'],
      timeoutMs: 10_000,
    });

    expect(status).toBe(200);
    const envelope = body as {
      ok: boolean;
      data: { ok: boolean; stdout: string; exitCode: number };
    };
    expect(envelope.ok).toBe(true);
    expect(envelope.data).toMatchObject({ ok: true, stdout: "missing", exitCode: 0 });
  });

  it("runs login-env git execs without exposing the bridge secret to hooks", async () => {
    git(projectRoot, "init");
    git(projectRoot, "config", "user.email", "test@example.com");
    git(projectRoot, "config", "user.name", "Poracode Test");
    mkdirSync(join(projectRoot, ".githooks"));
    const hookPath = join(projectRoot, ".githooks", "pre-commit");
    writeFileSync(
      hookPath,
      [
        "#!/bin/sh",
        'printf "%s" "${PORACODE_HOOK_SECRET:-missing}" > "$PWD/hook-env.txt"',
        'printf ":%s" "${PORACODE_HOOK_PROTOCOL_VERSION:-missing}" >> "$PWD/hook-env.txt"',
        "",
      ].join("\n"),
    );
    chmodSync(hookPath, 0o755);
    git(projectRoot, "config", "core.hooksPath", ".githooks");
    writeFileSync(join(projectRoot, "README.md"), "after");
    git(projectRoot, "add", "README.md");

    const { status, body } = await post(`${bridge.baseUrl}/v1/git/exec`, {
      cwd: projectRoot,
      args: ["commit", "-m", "with hook"],
      loginEnv: true,
      timeoutMs: 10_000,
    });

    expect(status).toBe(200);
    const envelope = body as {
      ok: boolean;
      data: { ok: boolean; stdout: string; exitCode: number };
    };
    expect(envelope.ok).toBe(true);
    expect(envelope.data).toMatchObject({ ok: true, exitCode: 0 });
    expect(readFileSync(join(projectRoot, "hook-env.txt"), "utf8")).toBe("missing:missing");
  });
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}
