import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("MCP stdio cwd launcher", () => {
  it("preserves raw protocol traffic, cwd and env without limiting server capabilities", async () => {
    const root = mkdtempSync(join(tmpdir(), "poracode-stdio-test-"));
    roots.push(root);
    const script = `process.stdout.write(JSON.stringify({cwd:process.cwd(),env:process.env.FIXTURE,leaked:!!process.env.PORACODE_MCP_STDIO_CONFIG})+'\\n');process.stdin.pipe(process.stdout);`;
    const server = {
      transport: {
        type: "stdio",
        command: process.execPath,
        args: ["-e", script],
        cwd: root,
        env: { FIXTURE: "verified" },
      },
    };
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL("./mcpStdioWorker.ts", import.meta.url))],
      {
        env: {
          ...process.env,
          PORACODE_MCP_STDIO_CONFIG: Buffer.from(JSON.stringify({ version: 1, server })).toString(
            "base64url",
          ),
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    const traffic =
      '{"capabilities":{"tools":{},"resources":{},"prompts":{}}}\n{"method":"resources/list"}\n{"method":"prompts/get"}\n';
    child.stdin.end(traffic);
    try {
      const [code] = await once(child, "exit");
      expect(code).toBe(0);
      const output = Buffer.concat(chunks).toString("utf8");
      const lineEnd = output.indexOf("\n");
      expect(JSON.parse(output.slice(0, lineEnd))).toEqual({
        cwd: realpathSync(root),
        env: "verified",
        leaked: false,
      });
      expect(output.slice(lineEnd + 1)).toBe(traffic);
    } finally {
      child.kill("SIGKILL");
    }
  });

  it.skipIf(process.platform !== "win32")(
    "launches Windows command shims with quoted arguments",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "poracode-stdio-cmd-"));
      roots.push(root);
      writeFileSync(
        join(root, "server.cjs"),
        "process.stdout.write(JSON.stringify(process.argv.slice(2)))",
      );
      const shim = join(root, "fixture.cmd");
      writeFileSync(shim, `@echo off\r\n"${process.execPath}" "%~dp0server.cjs" %*\r\n`);
      const value = "value with spaces & parentheses (literal)";
      const server = {
        transport: { type: "stdio", command: shim, args: [value], cwd: root, env: {} },
      };
      const child = spawn(
        process.execPath,
        [fileURLToPath(new URL("./mcpStdioWorker.ts", import.meta.url))],
        {
          env: {
            ...process.env,
            PORACODE_MCP_STDIO_CONFIG: Buffer.from(JSON.stringify({ version: 1, server })).toString(
              "base64url",
            ),
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      const chunks: Buffer[] = [];
      child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
      try {
        const [code] = await once(child, "exit");
        expect(code).toBe(0);
        expect(JSON.parse(Buffer.concat(chunks).toString("utf8"))).toEqual([value]);
      } finally {
        child.kill("SIGKILL");
      }
    },
  );

  it("rejects an older launch envelope before executing its command", async () => {
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL("./mcpStdioWorker.ts", import.meta.url))],
      {
        env: {
          ...process.env,
          PORACODE_MCP_STDIO_CONFIG: Buffer.from(
            JSON.stringify({
              version: 0,
              server: { transport: { type: "stdio", command: "not-executed", args: [], env: {} } },
            }),
          ).toString("base64url"),
        },
        stdio: "ignore",
      },
    );
    const [code] = await once(child, "exit");
    expect(code).not.toBe(0);
  });
});
