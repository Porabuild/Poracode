import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { CursorSdkWorkerClient, CursorSdkWorkerRpcError } from "./sdkWorkerClient";
import type { CursorSdkWorkerEvent } from "./sdkWorkerProtocol";

const tempDirectories: string[] = [];
const children: ChildProcess[] = [];

afterEach(() => {
  for (const child of children.splice(0)) child.kill();
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Cursor SDK worker integration", () => {
  it("probes, creates, streams deltas/messages/results, and exposes stored messages", async () => {
    const harness = await createHarness();
    const probe = await harness.client.probe("probe-key");
    expect(probe).toEqual({
      models: [
        {
          id: "composer-test",
          displayName: "Composer Test",
          parameters: [{ id: "effort", values: [{ value: "high" }] }],
        },
      ],
      sdkVersion: "unknown",
      source: "explicit-entry",
    });

    await expect(
      harness.client.initialize({
        apiKey: "worker-secret",
        createOptions: {
          model: { id: "composer-test" },
          name: "Poracode test",
          local: {
            cwd: harness.directory,
            settingSources: ["project", "user", "plugins"],
            sandboxOptions: { enabled: true },
            autoReview: true,
            enableAgentRetries: false,
          },
          mcpServers: {
            test: { command: "test-mcp", args: ["--stdio"] },
          },
          mode: "plan",
        },
      }),
    ).resolves.toEqual({
      agentId: "agent-created",
      model: { id: "composer-test" },
    });

    const events: CursorSdkWorkerEvent[] = [];
    const unsubscribe = harness.client.onEvent((event) => events.push(event));
    const started = await harness.client.start({
      message: {
        text: "hello",
        images: [{ data: "aGVsbG8=", mimeType: "image/png" }],
      },
      options: {
        mode: "agent",
        model: { id: "composer-test", params: [{ id: "effort", value: "high" }] },
        local: { force: true },
      },
    });
    expect(started).toEqual({ runId: "run-1" });
    await waitFor(() => events.some((event) => event.type === "result"));
    unsubscribe();

    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["delta", "message", "result"]),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "delta",
        runId: "run-1",
        update: { type: "text-delta", text: "hello" },
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "delta",
        runId: "run-1",
        update: {
          type: "user-message-appended",
          userMessage: {
            type: "user_message",
            session_id: "fixture-session",
            text: "hello",
          },
        },
      }),
    );
    const echoedUserMessage = events.find(
      (event) => event.type === "delta" && event.update.type === "user-message-appended",
    );
    if (
      echoedUserMessage?.type !== "delta" ||
      echoedUserMessage.update.type !== "user-message-appended"
    ) {
      throw new Error("Expected the sanitized user-message-appended fixture event.");
    }
    expect(echoedUserMessage.update.userMessage).not.toHaveProperty("images");
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "message",
        runId: "run-1",
        message: expect.objectContaining({ type: "assistant" }),
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "result",
        runId: "run-1",
        result: expect.objectContaining({ id: "run-1", status: "finished", result: "done" }),
      }),
    );

    await harness.client.reload();
    await expect(harness.client.listMessages({ limit: 10, offset: 0 })).resolves.toEqual([
      expect.objectContaining({
        type: "assistant",
        message: { operations: ["reload"] },
      }),
    ]);
    await harness.client.dispose();
  });

  it("keeps reading commands while a stream is active so cancel can finish it", async () => {
    const harness = await createHarness();
    await harness.client.initialize({
      createOptions: {
        model: { id: "composer-test" },
        local: { cwd: harness.directory },
      },
    });
    const events: CursorSdkWorkerEvent[] = [];
    harness.client.onEvent((event) => events.push(event));
    const { runId } = await harness.client.start({ message: "hold" });
    await waitFor(() => events.some((event) => event.type === "message"));

    await expect(harness.client.cancel(runId)).resolves.toEqual({ cancelled: true });
    await waitFor(() => events.some((event) => event.type === "result"));
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "result",
        runId,
        result: expect.objectContaining({ status: "cancelled" }),
      }),
    );
    await expect(harness.client.cancel()).resolves.toEqual({ cancelled: false });
    await harness.client.dispose();
  });

  it("reports stream errors as run events and remains usable for a follow-up", async () => {
    const harness = await createHarness();
    await harness.client.initialize({
      createOptions: {
        model: { id: "composer-test" },
        local: { cwd: harness.directory },
      },
    });
    const events: CursorSdkWorkerEvent[] = [];
    harness.client.onEvent((event) => events.push(event));
    await harness.client.start({ message: "stream-error" });
    await waitFor(() => events.some((event) => event.type === "run-error"));
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "run-error",
        error: expect.objectContaining({ message: "synthetic stream failure" }),
      }),
    );

    await harness.client.start({ message: "follow-up" });
    await waitFor(() => events.filter((event) => event.type === "result").length === 1);
    await harness.client.dispose();
  });

  it("resumes an existing agent and rejects conflicting lifecycle requests", async () => {
    const harness = await createHarness();
    await expect(
      harness.client.initialize({
        resumeAgentId: "agent-existing",
        createOptions: {
          model: { id: "composer-test" },
          local: { cwd: harness.directory },
        },
      }),
    ).resolves.toEqual({
      agentId: "agent-existing",
      model: { id: "composer-test" },
    });
    await expect(
      harness.client.initialize({
        createOptions: {
          model: { id: "composer-test" },
          local: { cwd: harness.directory },
        },
      }),
    ).rejects.toMatchObject({ code: "already_initialized" });

    const { runId } = await harness.client.start({ message: "hold" });
    await expect(harness.client.start({ message: "second" })).rejects.toMatchObject({
      code: "agent_busy",
    });
    await expect(harness.client.cancel("different-run")).rejects.toMatchObject({
      code: "run_not_active",
    });
    await harness.client.cancel(runId);
    await harness.client.dispose();
  });

  it("redacts API keys from SDK errors", async () => {
    const harness = await createHarness();
    const error = await harness.client
      .initialize({
        apiKey: "do-not-leak-this-key",
        createOptions: {
          model: { id: "composer-test" },
          name: "throw",
          local: { cwd: harness.directory },
        },
      })
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(CursorSdkWorkerRpcError);
    expect((error as Error).message).toBe("rejected [REDACTED]");
    expect((error as Error).message).not.toContain("do-not-leak-this-key");
    await harness.client.dispose();
  });

  it("anchors argv at the verified external SDK entry for platform-helper discovery", async () => {
    const harness = await createHarness();

    await expect(harness.client.probe("argv-anchor")).resolves.toMatchObject({
      models: [{ id: harness.entryPath }],
    });

    await harness.client.dispose();
  });

  it("awaits the SDK async disposer before acknowledging graceful worker disposal", async () => {
    const harness = await createHarness();
    const markerPath = join(harness.directory, "async-disposed.txt");
    await harness.client.initialize({
      createOptions: {
        model: { id: "composer-test" },
        name: `dispose-marker:${markerPath}`,
        local: { cwd: harness.directory },
      },
    });

    await harness.client.dispose();

    expect(readFileSync(markerPath, "utf8")).toBe("async-disposed");
  });

  it("redacts MCP transport credentials echoed by create and send failures", async () => {
    const createHarnessResult = await createHarness();
    const createSecrets = {
      env: "mcp-stdio-env-secret-unique",
      header: "mcp-http-header-secret-unique",
      client: "mcp-oauth-client-secret-unique",
    };
    const createError = await createHarnessResult.client
      .initialize({
        createOptions: {
          model: { id: "composer-test" },
          name: "throw-mcp-secrets",
          local: { cwd: createHarnessResult.directory },
          mcpServers: secretMcpServers(createSecrets),
        },
      })
      .catch((reason: unknown) => reason);
    expect(createError).toBeInstanceOf(CursorSdkWorkerRpcError);
    expect((createError as Error).message).toContain("[REDACTED]");
    expect((createError as CursorSdkWorkerRpcError).code).toBe("[REDACTED]");
    for (const secret of Object.values(createSecrets)) {
      expect((createError as Error).message).not.toContain(secret);
    }
    await createHarnessResult.client.dispose();

    const sendHarnessResult = await createHarness();
    await sendHarnessResult.client.initialize({
      createOptions: {
        model: { id: "composer-test" },
        local: { cwd: sendHarnessResult.directory },
      },
    });
    const sendSecrets = {
      env: "send-stdio-env-secret-unique",
      header: "send-http-header-secret-unique",
      client: "send-oauth-client-secret-unique",
    };
    const sendError = await sendHarnessResult.client
      .start({
        message: "throw-mcp-secrets",
        options: { mcpServers: secretMcpServers(sendSecrets) },
      })
      .catch((reason: unknown) => reason);
    expect(sendError).toBeInstanceOf(CursorSdkWorkerRpcError);
    expect((sendError as Error).message).toContain("[REDACTED]");
    expect((sendError as CursorSdkWorkerRpcError).code).toBe("[REDACTED]");
    for (const secret of Object.values(sendSecrets)) {
      expect((sendError as Error).message).not.toContain(secret);
    }
    await sendHarnessResult.client.dispose();
  });

  it("redacts known credentials from normal run-result errors and codes", async () => {
    const harness = await createHarness();
    const apiKey = "result-api-key-secret-unique";
    const createSecrets = {
      env: "result-create-env-secret-unique",
      header: "result-create-header-secret-unique",
      client: "result-create-client-secret-unique",
    };
    const sendSecrets = {
      env: "result-send-env-secret-unique",
      header: "result-send-header-secret-unique",
      client: "result-send-client-secret-unique",
    };
    await harness.client.initialize({
      apiKey,
      createOptions: {
        model: { id: "composer-test" },
        local: { cwd: harness.directory },
        mcpServers: secretMcpServers(createSecrets),
      },
    });
    const events: CursorSdkWorkerEvent[] = [];
    harness.client.onEvent((event) => events.push(event));

    await harness.client.start({
      message: "result-error-secrets",
      options: { mcpServers: secretMcpServers(sendSecrets) },
    });
    await waitFor(() => events.some((event) => event.type === "result"));

    const event = events.find((candidate) => candidate.type === "result");
    expect(event).toMatchObject({
      type: "result",
      result: {
        status: "error",
        result: "ordinary result remains unchanged",
        error: {
          message: expect.stringContaining("[REDACTED]"),
          code: expect.stringContaining("[REDACTED]"),
        },
      },
    });
    const serialized = JSON.stringify(event);
    for (const secret of [apiKey, ...Object.values(createSecrets), ...Object.values(sendSecrets)]) {
      expect(serialized).not.toContain(secret);
    }
    await harness.client.dispose();
  });

  it("redacts known credentials from streamed provider payloads", async () => {
    const harness = await createHarness();
    const apiKey = "stream-api-key-secret-unique";
    const createSecrets = {
      env: "stream-create-env-secret-unique",
      header: "stream-create-header-secret-unique",
      client: "stream-create-client-secret-unique",
    };
    const sendSecrets = {
      env: "stream-send-env-secret-unique",
      header: "stream-send-header-secret-unique",
      client: "stream-send-client-secret-unique",
    };
    await harness.client.initialize({
      apiKey,
      createOptions: {
        model: { id: "composer-test" },
        local: { cwd: harness.directory },
        mcpServers: secretMcpServers(createSecrets),
      },
    });
    const events: CursorSdkWorkerEvent[] = [];
    harness.client.onEvent((event) => events.push(event));

    await harness.client.start({
      message: "stream-secrets",
      options: { mcpServers: secretMcpServers(sendSecrets) },
    });
    await waitFor(() => events.some((event) => event.type === "result"));

    const serialized = JSON.stringify(events);
    expect(serialized).toContain("[REDACTED]");
    for (const secret of [apiKey, ...Object.values(createSecrets), ...Object.values(sendSecrets)]) {
      expect(serialized).not.toContain(secret);
    }
    await harness.client.dispose();
  });

  it("normalizes authentication errors returned through normal run results", async () => {
    const harness = await createHarness();
    await harness.client.initialize({
      createOptions: {
        model: { id: "composer-test" },
        local: { cwd: harness.directory },
      },
    });
    const events: CursorSdkWorkerEvent[] = [];
    harness.client.onEvent((event) => events.push(event));

    await harness.client.start({ message: "result-auth-error" });
    await waitFor(() => events.some((event) => event.type === "result"));

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "result",
        result: expect.objectContaining({
          status: "error",
          error: {
            message: "Cursor rejected the configured SDK API key.",
            code: "auth_invalid",
          },
        }),
      }),
    );
    await harness.client.dispose();
  });

  it("resumes a deterministic local agent only when create reports an explicit duplicate", async () => {
    const duplicateHarness = await createHarness();
    await expect(
      duplicateHarness.client.initialize({
        createOptions: {
          agentId: "agent-deterministic-duplicate",
          model: { id: "composer-test" },
          local: { cwd: duplicateHarness.directory },
        },
      }),
    ).resolves.toMatchObject({
      agentId: "agent-deterministic-duplicate",
      recoveredExisting: true,
    });
    await duplicateHarness.client.dispose();

    const authHarness = await createHarness();
    const authError = await authHarness.client
      .initialize({
        createOptions: {
          agentId: "agent-deterministic-auth-failure",
          model: { id: "composer-test" },
          local: { cwd: authHarness.directory },
        },
      })
      .catch((reason: unknown) => reason);
    expect(authError).toMatchObject({
      code: "auth_invalid",
      message: "Cursor rejected the configured SDK API key.",
    });
    await authHarness.client.dispose();
  });

  it("normalizes Cursor authentication failures to the stable auth diagnostic", async () => {
    const harness = await createHarness();
    const error = await harness.client.probe("invalid-key").catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(CursorSdkWorkerRpcError);
    expect(error).toMatchObject({
      code: "auth_invalid",
      message: "Cursor rejected the configured SDK API key.",
    });
    await harness.client.dispose();
  });
});

async function createHarness(): Promise<{
  directory: string;
  entryPath: string;
  client: CursorSdkWorkerClient;
}> {
  const directory = mkdtempSync(join(tmpdir(), "poracode-cursor-sdk-worker-"));
  tempDirectories.push(directory);
  const sdkRoot = join(directory, "fake-sdk");
  mkdirSync(sdkRoot, { recursive: true });
  const entryPath = join(sdkRoot, "index.mjs");
  writeFileSync(entryPath, FAKE_SDK_SOURCE, "utf8");

  const configuredWorkerPath = process.env.PORACODE_CURSOR_SDK_WORKER_TEST_PATH;
  const workerPath = configuredWorkerPath ?? join(directory, "cursor-sdk-worker.mjs");
  if (!configuredWorkerPath) {
    const workerSource = resolve(dirname(fileURLToPath(import.meta.url)), "sdkWorker.ts");
    const esbuildArgs = [
      "exec",
      "esbuild",
      workerSource,
      "--bundle",
      "--platform=node",
      "--format=esm",
      "--target=node24",
      `--outfile=${workerPath}`,
    ];
    execFileSync(
      process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "pnpm",
      process.platform === "win32" ? ["/d", "/s", "/c", "pnpm.cmd", ...esbuildArgs] : esbuildArgs,
      { stdio: "pipe" },
    );
  }
  const child = spawn(process.execPath, [workerPath], {
    cwd: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.."),
    env: { ...process.env, CURSOR_API_KEY: "inherited-test-key" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  children.push(child);
  const client = new CursorSdkWorkerClient(
    child,
    { entryPath, packageRoot: sdkRoot },
    directory,
    5_000,
  );
  await client.waitUntilReady(5_000);
  return { directory, entryPath, client };
}

function secretMcpServers(secrets: {
  env: string;
  header: string;
  client: string;
}): NonNullable<Parameters<CursorSdkWorkerClient["initialize"]>[0]["createOptions"]["mcpServers"]> {
  return {
    stdio: {
      command: "test-mcp",
      env: { MCP_PRIVATE_ENV: secrets.env },
    },
    http: {
      type: "http",
      url: "https://mcp.example.test",
      headers: { Authorization: `Bearer ${secrets.header}` },
      auth: {
        CLIENT_ID: "public-client-id",
        CLIENT_SECRET: secrets.client,
      },
    },
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for worker event.");
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
}

const FAKE_SDK_SOURCE = String.raw`
import { writeFile } from "node:fs/promises";

const operations = [];
let runCounter = 0;

class FakeRun {
  constructor(agentId, message, errorSecrets = []) {
    this.agentId = agentId;
    this.message = typeof message === "string" ? message : message.text;
    this.errorSecrets = errorSecrets;
    this.id = "run-" + (++runCounter);
    this.cancelled = false;
    this.release = undefined;
  }

  async *stream() {
    yield {
      type: "system",
      subtype: "init",
      agent_id: this.agentId,
      run_id: this.id,
      model: { id: "composer-test" },
    };
    if (this.message === "stream-error") throw new Error("synthetic stream failure");
    yield {
      type: "assistant",
      agent_id: this.agentId,
      run_id: this.id,
      message: {
        role: "assistant",
        content: [{
          type: "text",
          text: this.message === "stream-secrets"
            ? "provider output " + this.errorSecrets.join(" / ")
            : "response",
        }],
      },
    };
    if (this.message === "hold") {
      await new Promise((resolve) => {
        this.release = resolve;
      });
    }
    yield {
      type: "status",
      agent_id: this.agentId,
      run_id: this.id,
      status: this.cancelled ? "CANCELLED" : "FINISHED",
    };
  }

  async wait() {
    if (this.message === "result-error-secrets") {
      return {
        id: this.id,
        status: "error",
        result: "ordinary result remains unchanged",
        error: {
          message: "provider failure " + this.errorSecrets.join(" / "),
          code: "MCP_" + this.errorSecrets.join("_"),
        },
      };
    }
    if (this.message === "result-auth-error") {
      return {
        id: this.id,
        status: "error",
        error: { message: "Invalid User API Key", code: "BAD_USER_API_KEY" },
      };
    }
    return {
      id: this.id,
      status: this.cancelled ? "cancelled" : "finished",
      result: this.cancelled ? "partial" : "done",
      model: { id: "composer-test" },
      usage: {
        inputTokens: 1,
        outputTokens: 2,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    };
  }

  async cancel() {
    this.cancelled = true;
    this.release?.();
  }
}

class FakeAgent {
  constructor(agentId, options) {
    this.agentId = agentId;
    this.model = options.model;
    this.name = options.name;
    this.apiKey = options.apiKey;
    this.mcpServers = options.mcpServers;
  }

  async send(message, options = {}) {
    if (message === "throw-mcp-secrets") {
      throwMcpSecrets(options.mcpServers);
    }
    options.onDelta?.({ update: { type: "text-delta", text: "hello" } });
    if (typeof message === "object" && message?.images?.length) {
      options.onDelta?.({
        update: {
          type: "user-message-appended",
          userMessage: {
            type: "user_message",
            session_id: "fixture-session",
            text: message.text,
            images: message.images.map((image) => ({
              type: "base64",
              data: image.data,
            })),
          },
        },
      });
    }
    return new FakeRun(this.agentId, message, [
      this.apiKey,
      ...collectMcpSecrets(this.mcpServers),
      ...collectMcpSecrets(options.mcpServers),
    ].filter(Boolean));
  }

  async reload() {
    operations.push("reload");
  }

  close() {}

  async [Symbol.asyncDispose]() {
    if (!this.name?.startsWith("dispose-marker:")) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
    await writeFile(this.name.slice("dispose-marker:".length), "async-disposed", "utf8");
  }
}

export class Agent {
  static async create(options) {
    if (options.name === "throw") throw new Error("rejected " + options.apiKey);
    if (options.name === "throw-mcp-secrets") throwMcpSecrets(options.mcpServers);
    if (options.agentId === "agent-deterministic-duplicate") {
      throw new Error("Agent " + options.agentId + " already exists");
    }
    if (options.agentId === "agent-deterministic-auth-failure") {
      const error = new Error("create authentication failed");
      error.name = "AuthenticationError";
      error.code = "BAD_USER_API_KEY";
      throw error;
    }
    return new FakeAgent(options.agentId ?? "agent-created", options);
  }

  static async resume(agentId, options = {}) {
    if (agentId === "agent-deterministic-auth-failure") {
      throw new Error("authentication failures must not fall back to resume");
    }
    if (options.agentId !== undefined) {
      throw new Error("create-only agentId leaked into Agent.resume");
    }
    return new FakeAgent(agentId, options);
  }

  static messages = {
    async list(agentId) {
      return [{
        type: "assistant",
        uuid: "stored-message",
        agent_id: agentId,
        message: { operations: [...operations] },
      }];
    },
  };
}

export class Cursor {
  static models = {
    async list(options = {}) {
      if (options.apiKey === "argv-anchor") {
        return [{ id: process.argv[1], displayName: "argv anchor" }];
      }
      if (options.apiKey === "invalid-key") {
        const error = new Error("Invalid User API Key");
        error.name = "AuthenticationError";
        throw error;
      }
      return [{
        id: "composer-test",
        displayName: "Composer Test",
        parameters: [{ id: "effort", values: [{ value: "high" }] }],
      }];
    },
  };
}

function throwMcpSecrets(servers) {
  const error = new Error([
    servers.stdio.env.MCP_PRIVATE_ENV,
    servers.http.headers.Authorization,
    servers.http.auth.CLIENT_SECRET,
  ].join(" / "));
  error.code = servers.http.auth.CLIENT_SECRET;
  throw error;
}

function collectMcpSecrets(servers = {}) {
  const values = [];
  for (const server of Object.values(servers)) {
    if (server.env) values.push(...Object.values(server.env));
    if (server.headers) values.push(...Object.values(server.headers));
    if (server.auth?.CLIENT_SECRET) values.push(server.auth.CLIENT_SECRET);
  }
  return values;
}
`;
