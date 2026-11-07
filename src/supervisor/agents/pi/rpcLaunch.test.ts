import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation, RuntimeEvent } from "@/shared/contracts";
import { clearExecutablePathCache, primeExecutablePathCache, quotePosixShellArg } from "../base";
import * as binaryResolver from "../binaryResolver";
import { clearAgentBinaryPathCache, primeAgentBinaryPath } from "../binaryResolver";
import { PiRpcSession } from "./rpcSession";

const source = `
const fs = require("node:fs");
const readline = require("node:readline");
fs.writeFileSync(process.env.PI_LAUNCH_RECORD, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), pid: process.pid, shellEnv: process.env.PI_LAUNCH_SHELL_ENV }));
const send = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const { id, type, message } = JSON.parse(line);
  send({ id, type: "response", success: true, data: type === "get_state" ? { sessionId: "launch-session" } : {} });
  if (type === "prompt") {
    send({ type: "agent_start" });
    send({ type: "message_start" });
    send({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: message } });
    if (message === "HOLD_FOR_STOP") return;
    send({ type: "message_end" });
    send({ type: "agent_settled" });
  }
  if (type === "abort") send({ type: "agent_settled" });
});
`;

describe("Pi structured process launch", () => {
  let root: string | undefined;
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    clearAgentBinaryPathCache();
    clearExecutablePathCache();
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  it.runIf(process.platform !== "win32").each(["cold", "detected after probe expiry"])(
    "launches POSIX RPC with a %s cache when Pi is absent from the host PATH",
    async (cacheState) => {
      root = mkdtempSync(join(tmpdir(), "pi rpc login ' "));
      const loginBin = join(root, "login-bin");
      const project = join(root, "project");
      mkdirSync(loginBin);
      mkdirSync(project);
      const executable = join(loginBin, "pi");
      writeFileSync(executable, `#!/usr/bin/env node\n${source}`, { mode: 0o700 });
      symlinkSync(process.execPath, join(loginBin, "node"));
      const shell = join(root, "login-shell");
      writeFileSync(
        shell,
        `#!/bin/sh
export PATH=${quotePosixShellArg(`${loginBin}:/usr/bin:/bin`)}
export PI_LAUNCH_SHELL_ENV=from-login
for arg; do script="$arg"; done
exec /bin/sh -c "$script"
`,
        { mode: 0o700 },
      );
      const recordPath = join(root, "launch.json");
      vi.stubEnv("PI_LAUNCH_RECORD", recordPath);
      vi.stubEnv("PATH", "/usr/bin:/bin");
      vi.stubEnv("SHELL", shell);
      const location: ProjectLocation = { kind: "posix", path: project };
      if (cacheState === "cold") {
        // Keep a Pi in the machine's well-known dirs from hiding a cold cache.
        vi.spyOn(binaryResolver, "resolveAgentBinaryPath").mockReturnValue(undefined);
      } else {
        await primeExecutablePathCache(["pi"]);
        vi.spyOn(Date, "now").mockReturnValue(Date.now() + 61_000);
        // A valid detected executable must not require another shell lookup.
        vi.stubEnv("SHELL", join(root, "unused-shell"));
      }
      expect(binaryResolver.resolveAgentBinaryPath(location, "pi")).toBe(
        cacheState === "cold" ? undefined : executable,
      );
      const config = { model: "fixture/space 'quotes' & $(should-not-run) 雪", effort: "off" };
      const session = await PiRpcSession.create({
        threadId: "posix-launch-test",
        projectLocation: location,
        config,
        presentationMode: "gui",
      });
      const events: RuntimeEvent[] = [];
      session.setListener({
        onClose() {},
        onError() {},
        onUpdate() {},
        onRuntimeEvent: (event) => events.push(event),
      });
      let pid = 0;
      try {
        expect(await session.openThread()).toBe("launch-session");
        const record = JSON.parse(readFileSync(recordPath, "utf8")) as {
          args: string[];
          cwd: string;
          pid: number;
          shellEnv?: string;
        };
        pid = record.pid;
        expect(record).toMatchObject({
          args: ["--mode", "rpc", "--approve", "--model", config.model, "--thinking", "off"],
          cwd: realpathSync(project),
          shellEnv: "from-login",
        });
        await session.startTurn("POSIX_RPC_DISPATCHED", config);
        expect(events).toContainEqual(
          expect.objectContaining({ type: "content.delta", delta: "POSIX_RPC_DISPATCHED" }),
        );
      } finally {
        await session.dispose();
      }
      expect(() => process.kill(pid, 0)).toThrow("ESRCH");
    },
  );

  it.runIf(process.platform === "win32").each([false, true])(
    "launches the resolved npm pi.cmd with adjacent node.exe=%s and piped JSONL",
    async (adjacentNode) => {
      root = mkdtempSync(join(tmpdir(), "pi rpc & (shim) ' %PATH% ! "));
      const script = join(root, "node_modules", "@fixture", "pi", "cli.cjs");
      mkdirSync(dirname(script), { recursive: true });
      writeFileSync(script, source);
      const shim = join(root, "pi.cmd");
      // npm's generated launcher shape; exercise the cached resolved .cmd path.
      writeFileSync(
        shim,
        '@ECHO off\r\nSET dp0=%~dp0\r\n"node" "%dp0%\\node_modules\\@fixture\\pi\\cli.cjs" %*\r\n',
      );
      if (adjacentNode) copyFileSync(process.execPath, join(root, "node.exe"));
      primeAgentBinaryPath("windows", "pi", shim);
      const recordPath = join(root, "launch.json");
      vi.stubEnv("PI_LAUNCH_RECORD", recordPath);
      const marker = join(root, "injected.txt");
      const model = `fixture/space & echo injected > "${marker}" | < ^ %PATH% ! $(whoami) ' 雪`;
      const config = { model, effort: "off" };
      const session = await PiRpcSession.create({
        threadId: "launch-test",
        projectLocation: { kind: "windows", path: root },
        config,
        presentationMode: "gui",
      });
      const events: RuntimeEvent[] = [];
      session.setListener({
        onClose() {},
        onError() {},
        onUpdate() {},
        onRuntimeEvent: (event) => events.push(event),
      });
      let pid = 0;
      try {
        expect(await session.openThread()).toBe("launch-session");
        const record = JSON.parse(readFileSync(recordPath, "utf8")) as {
          args: string[];
          cwd: string;
          pid: number;
        };
        pid = record.pid;
        expect(record.args).toEqual([
          "--mode",
          "rpc",
          "--approve",
          "--model",
          model,
          "--thinking",
          "off",
        ]);
        expect(record.cwd).toBe(root);
        const prompts = ["FIRST & | < > ^ %PATH% ! $(whoami) ' 雪", "FOLLOW_UP\nwith a newline"];
        for (const prompt of prompts) await session.startTurn(prompt, config);
        expect(
          events.filter((event) => event.type === "content.delta").map((event) => event.delta),
        ).toEqual(prompts);
        const stoppedTurn = session.startTurn("HOLD_FOR_STOP", config);
        await expect
          .poll(() =>
            events.some(
              (event) => event.type === "content.delta" && event.delta === "HOLD_FOR_STOP",
            ),
          )
          .toBe(true);
        await session.interruptTurn();
        await stoppedTurn;
        expect(events).toContainEqual(
          expect.objectContaining({ type: "turn.completed", state: "cancelled" }),
        );
        expect(await session.openThread()).toBe("launch-session");
        expect(existsSync(marker)).toBe(false);
      } finally {
        await session.dispose();
      }
      expect(() => process.kill(pid, 0)).toThrow("ESRCH");
    },
  );

  it("keeps the WSL structured-chat boundary", async () => {
    const projectLocation: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/tmp/pi",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\tmp\\pi",
    };
    await expect(
      PiRpcSession.create({
        threadId: "wsl-test",
        projectLocation,
        config: { model: "fixture/model" },
        presentationMode: "gui",
      }),
    ).rejects.toThrow("use Pi terminal mode in WSL");
  });
});
