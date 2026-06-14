import { PassThrough } from "node:stream";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type {
  Query,
  SDKMessage,
  SpawnedProcess,
  SpawnOptions,
} from "@anthropic-ai/claude-agent-sdk";

const mockSdk = vi.hoisted(() => ({
  query: vi.fn<(input: unknown) => Query>(),
}));

const mockChildProcess = vi.hoisted(() => ({
  spawn:
    vi.fn<(command: string, args: string[], options: Record<string, unknown>) => SpawnedProcess>(),
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: mockSdk.query,
}));

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    spawn: mockChildProcess.spawn,
  };
});

import {
  claudeCapabilitiesFromCliVersion,
  probeClaudeCapabilities,
  win32PathToWslMount,
} from "./probe";
import { spawnClaudeProbeProcess } from "./sdkProbeProcess";

function epipeError(): NodeJS.ErrnoException {
  return Object.assign(new Error("write EPIPE"), { code: "EPIPE", syscall: "write" });
}

function ebadfError(): NodeJS.ErrnoException {
  return Object.assign(new Error("write EBADF"), { code: "EBADF", syscall: "write" });
}

function makeSpawnedProcess(): SpawnedProcess {
  return {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    killed: false,
    exitCode: null,
    kill: vi.fn<() => boolean>().mockReturnValue(true),
    on() {},
    once() {},
    off() {},
  } as unknown as SpawnedProcess;
}

function createProbeQuery(): Query {
  let closed = false;
  return {
    async next(): Promise<IteratorResult<SDKMessage>> {
      if (closed) return { done: true, value: undefined };
      return { done: true, value: undefined };
    },
    async return(): Promise<IteratorResult<SDKMessage>> {
      closed = true;
      return { done: true, value: undefined };
    },
    async throw(error?: unknown): Promise<IteratorResult<SDKMessage>> {
      throw error;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
    interrupt: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    setPermissionMode: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    setModel: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    setMaxThinkingTokens: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    applyFlagSettings: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    initializationResult: vi.fn<() => Promise<unknown>>().mockResolvedValue({
      commands: [{ name: "help", description: "Show help" }],
    }),
    supportedCommands: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    supportedModels: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
    getContextUsage: vi.fn<() => Promise<unknown>>().mockResolvedValue({}),
    close: vi.fn<() => void>(() => {
      closed = true;
    }),
  } as unknown as Query;
}

beforeEach(() => {
  mockSdk.query.mockReset();
  mockChildProcess.spawn.mockReset();
  mockChildProcess.spawn.mockImplementation(() => makeSpawnedProcess());
});

describe("claudeCapabilitiesFromCliVersion", () => {
  it("hides Fable 5, Opus 4.7, and Opus 4.8 when CLI is below 2.1.111", () => {
    const p = claudeCapabilitiesFromCliVersion("2.1.110");
    expect(p?.models?.map((m) => m.id)).not.toContain("claude-fable-5");
    expect(p?.models?.map((m) => m.id)).not.toContain("claude-opus-4-7");
    expect(p?.models?.map((m) => m.id)).not.toContain("claude-opus-4-8");
    expect(p?.modelContextSizes && "claude-fable-5" in p.modelContextSizes).toBe(false);
    expect(p?.modelEfforts && "claude-opus-4-7" in p.modelEfforts).toBe(false);
    expect(p?.models?.map((m) => m.id)).toContain("claude-opus-4-6");
  });

  it("hides Fable 5 and Opus 4.8 when CLI supports Opus 4.7 but not Opus 4.8", () => {
    const p = claudeCapabilitiesFromCliVersion("2.1.153");
    expect(p?.models?.map((m) => m.id)).toContain("claude-opus-4-7");
    expect(p?.models?.map((m) => m.id)).toContain("claude-opus-4-6");
    expect(p?.models?.map((m) => m.id)).not.toContain("claude-fable-5");
    expect(p?.models?.map((m) => m.id)).not.toContain("claude-opus-4-8");
  });

  it("hides only Fable 5 when CLI supports Opus 4.8 but not Fable 5", () => {
    const p = claudeCapabilitiesFromCliVersion("2.1.169");
    expect(p?.models?.map((m) => m.id)).toContain("claude-opus-4-8");
    expect(p?.models?.map((m) => m.id)).toContain("claude-opus-4-7");
    expect(p?.models?.map((m) => m.id)).not.toContain("claude-fable-5");
    expect(p?.modelEfforts && "claude-fable-5" in p.modelEfforts).toBe(false);
    expect(p?.modelContextSizes && "claude-fable-5" in p.modelContextSizes).toBe(false);
  });

  it("returns undefined when CLI supports Fable 5", () => {
    expect(claudeCapabilitiesFromCliVersion("2.1.170")).toBeUndefined();
    expect(claudeCapabilitiesFromCliVersion("3.0.0")).toBeUndefined();
  });

  it("returns undefined when version is missing or unparsable", () => {
    expect(claudeCapabilitiesFromCliVersion(undefined)).toBeUndefined();
    expect(claudeCapabilitiesFromCliVersion("")).toBeUndefined();
    expect(claudeCapabilitiesFromCliVersion("not-a-semver")).toBeUndefined();
  });
});

describe("win32PathToWslMount", () => {
  it("maps drive letters to /mnt", () => {
    expect(win32PathToWslMount("C:\\Users\\x\\app\\worker.mjs")).toBe(
      "/mnt/c/Users/x/app/worker.mjs",
    );
  });

  it("maps wsl.localhost UNC paths", () => {
    expect(win32PathToWslMount("//wsl.localhost/Ubuntu/home/u/w.mjs")).toBe("/home/u/w.mjs");
  });
});

describe("Claude SDK probe process handling", () => {
  it("contains probe-owned stdin EPIPE from the Claude SDK child", async () => {
    mockSdk.query.mockImplementation((input: unknown) => {
      const params = input as {
        options?: {
          spawnClaudeCodeProcess?: (options: SpawnOptions) => SpawnedProcess;
        };
      };
      const spawnForProbe = params.options?.spawnClaudeCodeProcess;
      expect(spawnForProbe).toEqual(expect.any(Function));

      const child = spawnForProbe!({
        command: "claude",
        args: ["--sdk-mcp-server"],
        cwd: "/tmp",
        env: {},
        signal: new AbortController().signal,
      });
      expect(() => child.stdin.emit("error", epipeError())).not.toThrow();

      return createProbeQuery();
    });

    const result = await probeClaudeCapabilities({
      location: { kind: "posix", path: "/tmp" },
      executablePath: "claude",
      version: "2.1.154",
    });

    expect(result?.slashCommands).toEqual([
      { id: "help", label: "help — Show help", description: "Show help" },
    ]);
    expect(mockChildProcess.spawn).toHaveBeenCalledWith(
      "claude",
      ["--sdk-mcp-server"],
      expect.objectContaining({
        cwd: "/tmp",
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      }),
    );
  });

  it("does not hide unrelated probe stdin errors", () => {
    const child = spawnClaudeProbeProcess({
      command: "claude",
      args: ["--sdk-mcp-server"],
      cwd: "/tmp",
      env: {},
      signal: new AbortController().signal,
    });

    expect(() => child.stdin.emit("error", ebadfError())).toThrow("write EBADF");
  });
});
