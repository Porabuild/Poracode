import { execFileSync, spawn as spawnChild } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Poracode no longer bundles the Pi SDK; terminal + RPC modes drive the user's
// installed `pi`. These CLI-process checks run against that binary and skip when
// it is not present.
function resolveSystemPi(): string | undefined {
  try {
    const resolved = execFileSync("which", ["pi"], { encoding: "utf8" }).trim();
    return resolved.length > 0 ? resolved : undefined;
  } catch {
    return undefined;
  }
}

const SYSTEM_PI = resolveSystemPi();

interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function runPi(
  executable: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  keepStdinOpen = false,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawnChild(executable, args, { cwd, env });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new Error(`Pi CLI timed out for: ${args.join(" ")}\nstdout: ${stdout}\nstderr: ${stderr}`),
      );
    }, 10_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    if (!keepStdinOpen) child.stdin.end();
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode: exitCode ?? -1 });
    });
  });
}

function tclWord(value: string): string {
  return `{${value.replaceAll("\\", "\\\\").replaceAll("}", "\\}")}}`;
}

function openAiChunk(content: string, finishReason: string | null = null): string {
  return JSON.stringify({
    id: "chatcmpl-pi-cli-test",
    object: "chat.completion.chunk",
    created: 1,
    model: "fixture-model",
    choices: [{ index: 0, delta: content ? { content } : {}, finish_reason: finishReason }],
  });
}

describe.runIf(process.platform === "darwin" && SYSTEM_PI !== undefined)("Pi CLI process", () => {
  let root: string;
  let agentDir: string;
  let projectDir: string;
  let server: Server;
  let executable: string;
  let env: NodeJS.ProcessEnv;
  let requestBodies: string[];

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "poracode-pi-cli-"));
    agentDir = join(root, "agent");
    projectDir = join(root, "project");
    executable = SYSTEM_PI as string;
    requestBodies = [];

    server = createServer((request, response) => {
      void (async () => {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        requestBodies.push(Buffer.concat(chunks).toString("utf8"));
        response.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
        });
        response.write(`data: ${openAiChunk("CLI_RESPONSE")}\n\n`);
        response.write(`data: ${openAiChunk("", "stop")}\n\n`);
        response.end("data: [DONE]\n\n");
      })().catch((error: unknown) => response.destroy(error as Error));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Fixture server did not bind.");

    mkdirSync(agentDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(join(projectDir, ".pi", "skills", "fixture-skill"), { recursive: true });
    writeFileSync(join(agentDir, "auth.json"), "{}\n");
    writeFileSync(
      join(agentDir, "models.json"),
      JSON.stringify({
        providers: {
          fixture: {
            baseUrl: `http://127.0.0.1:${address.port}/v1`,
            api: "openai-completions",
            apiKey: "fixture-key",
            models: [
              {
                id: "fixture-model",
                name: "Fixture Model",
                reasoning: false,
                contextWindow: 32_000,
                maxTokens: 1_024,
              },
            ],
          },
        },
      }),
    );
    writeFileSync(
      join(projectDir, ".pi", "skills", "fixture-skill", "SKILL.md"),
      "---\nname: fixture-skill\ndescription: CLI fixture skill\n---\nInclude CLI_SKILL_DELIVERED.\n",
    );
    env = {
      ...process.env,
      CI: "1",
      NO_COLOR: "1",
      PI_CODING_AGENT_DIR: agentDir,
      TERM: "xterm-256color",
    };
    delete env.FORCE_COLOR;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  });

  it("runs print, JSON, skill, resume, and interactive PTY workflows", async () => {
    const common = [
      "--approve",
      "--offline",
      "--model",
      "fixture/fixture-model",
      "--thinking",
      "off",
      "--no-tools",
      "--no-extensions",
      "--no-prompt-templates",
    ] as const;

    const printed = await runPi(
      executable,
      [...common, "--no-skills", "--no-session", "-p", "PRINT_CHECK"],
      projectDir,
      env,
    ).catch((error: unknown) => {
      throw new Error(`${String(error)}\nrequests: ${JSON.stringify(requestBodies)}`);
    });
    expect(printed).toMatchObject({ exitCode: 0, stderr: "" });
    expect(printed.stdout).toContain("CLI_RESPONSE");
    expect(requestBodies.at(-1)).toContain("PRINT_CHECK");

    const json = await runPi(
      executable,
      [...common, "--no-skills", "--no-session", "--mode", "json", "-p", "JSON_CHECK"],
      projectDir,
      env,
    );
    expect(json.exitCode).toBe(0);
    expect(json.stdout).toContain('"type":"message_update"');
    expect(json.stdout).toContain("CLI_RESPONSE");

    const skill = await runPi(
      executable,
      [...common, "--no-session", "-p", "/skill:fixture-skill"],
      projectDir,
      env,
    );
    expect(skill.exitCode).toBe(0);
    expect(requestBodies.at(-1)).toContain("CLI_SKILL_DELIVERED");

    const sessionId = "00000000-0000-4000-8000-000000000001";
    const firstTurn = await runPi(
      executable,
      [...common, "--no-skills", "--session-id", sessionId, "-p", "FIRST_TURN"],
      projectDir,
      env,
    );
    expect(firstTurn.exitCode).toBe(0);
    const resumed = await runPi(
      executable,
      [...common, "--no-skills", "--session", sessionId, "-p", "SECOND_TURN"],
      projectDir,
      env,
    );
    expect(resumed.exitCode).toBe(0);
    expect(requestBodies.at(-1)).toContain("FIRST_TURN");
    expect(requestBodies.at(-1)).toContain("SECOND_TURN");

    const expectCommand = [executable, ...common, "--no-skills", "--no-session"]
      .map(tclWord)
      .join(" ");
    const terminal = await runPi(
      "/usr/bin/expect",
      [
        "-c",
        `set timeout 8
spawn ${expectCommand}
expect {
  -re {Press ctrl\\+o} {}
  timeout { exit 123 }
}
send -- "PTY_CHECK\\r"
expect {
  -re {CLI_RESPONSE} { send -- "\\004"; exp_continue }
  eof {}
  timeout { exit 124 }
}`,
      ],
      projectDir,
      env,
      true,
    );
    if (terminal.exitCode !== 0) throw new Error(JSON.stringify(terminal));
    expect(requestBodies.at(-1)).toContain("PTY_CHECK");
  }, 60_000);
});
