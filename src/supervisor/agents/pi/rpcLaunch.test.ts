import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation, RuntimeEvent } from "@/shared/contracts";
import { clearAgentBinaryPathCache, primeAgentBinaryPath } from "../binaryResolver";
import { PiRpcSession } from "./rpcSession";

const source = `
const fs = require("node:fs");
const readline = require("node:readline");
fs.writeFileSync(process.env.PI_LAUNCH_RECORD, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), pid: process.pid }));
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
    vi.unstubAllEnvs();
    clearAgentBinaryPathCache();
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

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
