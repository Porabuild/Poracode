import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
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

async function startBridge(): Promise<RunningBridge> {
  const child = spawn(process.execPath, [BRIDGE_SCRIPT], {
    env: { ...process.env, LIGHTCODE_HOOK_SECRET: SECRET },
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
    git(projectRoot, "config", "user.name", "Lightcode Test");
    git(projectRoot, "add", "README.md");
    git(projectRoot, "commit", "-m", "init");
    writeFileSync(join(projectRoot, "README.md"), "after");
    writeFileSync(join(projectRoot, "new.txt"), "new");

    const metadata = {
      threadId: "thread-1",
      checkpointItemId: "user-1",
      capturedAt: "2026-05-16T00:00:00.000Z",
      ref: "refs/lightcode/checkpoints/dGhyZWFkLTE/dXNlci0x",
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
      readdirSync(join(projectRoot, ".git")).some((name) => name.startsWith("index.lightcode-")),
    ).toBe(false);
  });

  it("runs structured git batches without a shell", async () => {
    git(projectRoot, "init");
    git(projectRoot, "config", "user.email", "test@example.com");
    git(projectRoot, "config", "user.name", "Lightcode Test");

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

  it("runs login-env git execs without exposing the bridge secret to hooks", async () => {
    git(projectRoot, "init");
    git(projectRoot, "config", "user.email", "test@example.com");
    git(projectRoot, "config", "user.name", "Lightcode Test");
    mkdirSync(join(projectRoot, ".githooks"));
    const hookPath = join(projectRoot, ".githooks", "pre-commit");
    writeFileSync(
      hookPath,
      [
        "#!/bin/sh",
        'printf "%s" "${LIGHTCODE_HOOK_SECRET:-missing}" > "$PWD/hook-env.txt"',
        'printf ":%s" "${LIGHTCODE_HOOK_PROTOCOL_VERSION:-missing}" >> "$PWD/hook-env.txt"',
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
