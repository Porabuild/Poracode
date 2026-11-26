import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  InitializeResponse,
  PromptResponse,
  SessionNotification,
} from "@agentclientprotocol/sdk/unstable";
import { describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import type { AgentAdapter } from "../base";
import type { AcpUtilitySessionContext } from "../acp/probe";
import {
  parseAntigravityAcpUsageReport,
  readAntigravityAcpUsage,
  type AntigravityAcpUsageDeps,
  type AntigravityAcpUsageRuntime,
} from "./antigravityAcpUsage";

const NOW = 1_717_000_000_000;
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const MARKDOWN = `### Quota Limits
- **Gemini Models**
  *(Models within this group: Gemini Flash, Gemini Pro)*
  - **Weekly Limit Remaining:** 91% remaining (resets Oct 02, 2026, 08:22 UTC)
  - **Five Hour Limit Remaining:** 100% remaining (resets Sep 30, 2026, 10:00 UTC)
- **Claude and GPT models**
  - **Weekly Limit Remaining:** 75% remaining (resets Oct 03, 2026, 12:00 UTC)
- **Gemini 4 Argon**
  - **Weekly Limit Remaining:** 53% remaining (resets Oct 04, 2026, 09:00 UTC)
`;

const POSIX = { kind: "posix" as const, path: "/work/project" };

function status(overrides: Partial<AgentStatus> = {}): AgentStatus {
  return {
    kind: "antigravity",
    label: "Antigravity",
    installed: true,
    authState: "authenticated",
    acpSessionEstablished: true,
    capabilities: {},
    executablePath: "/opt/agy",
    runtimeVariants: {
      acp: {
        presentationMode: "gui",
        installed: true,
        authState: "authenticated",
        authUsesProviderLogin: true,
        capabilities: {},
      },
    },
    ...overrides,
  } as unknown as AgentStatus;
}

function runtime(statusValue = status()): AntigravityAcpUsageRuntime {
  return {
    status: statusValue,
    adapter: {
      buildAcpAuthCommand: async () => ({
        command: "agy_acp_server",
        args: [],
      }),
    } as unknown as AgentAdapter,
  };
}

function initialize(name: string, version: string): InitializeResponse {
  return { protocolVersion: 1, agentInfo: { name, version } } as InitializeResponse;
}

interface ProbeFixture {
  name?: string;
  version?: string;
  commands?: { id: string }[];
  chunks?: string[];
  impostorChunks?: string[];
  stopReason?: PromptResponse["stopReason"];
  usage?: PromptResponse["usage"];
  failPrompt?: boolean;
  cleanupEnv?: Record<string, string>;
}

function probeFixture(fixture: ProbeFixture = {}, prompts: string[] = []) {
  return vi.fn<AntigravityAcpUsageDeps["probe"]>(async (_command, _args, _cwd, options) => {
    const utility = options?.utilitySession;
    if (!utility) return undefined;
    const init = initialize(fixture.name ?? "antigravity-acp", fixture.version ?? "1.5.2");
    if (utility.qualifies?.(init) === false) return {};
    const result = await utility.run({
      connection: {} as AcpUtilitySessionContext["connection"],
      initialize: init,
      sessionId: SESSION_ID,
      ...(fixture.commands
        ? {
            slashCommands: fixture.commands as unknown as NonNullable<
              AcpUtilitySessionContext["slashCommands"]
            >,
          }
        : {}),
      command: { command: "agy_acp_server", args: [] },
      prompt: async (text) => {
        prompts.push(text);
        if (fixture.failPrompt) throw new Error("logged out");
        for (const chunk of fixture.impostorChunks ?? []) {
          utility.onSessionUpdate?.({
            sessionId: "impostor-session",
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: chunk },
            },
          } as SessionNotification);
        }
        for (const chunk of fixture.chunks ?? []) {
          utility.onSessionUpdate?.({
            sessionId: SESSION_ID,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: chunk },
            },
          } as SessionNotification);
        }
        return {
          stopReason: fixture.stopReason ?? "end_turn",
          ...(fixture.usage ? { usage: fixture.usage } : {}),
        } as PromptResponse;
      },
    });
    if (fixture.cleanupEnv) {
      await utility.cleanupAfterProcess?.({
        sessionId: SESSION_ID,
        command: { command: "agy_acp_server", args: [], env: fixture.cleanupEnv },
      });
    }
    return result === undefined ? {} : { utilityResult: result };
  });
}

describe("parseAntigravityAcpUsageReport", () => {
  it("round-trips genuine native Quota Limits markdown through shared windows", () => {
    const snapshot = parseAntigravityAcpUsageReport(MARKDOWN, NOW);

    expect(
      snapshot?.windows.map((window) => [window.id, window.usedPercent, window.resetsAt]),
    ).toEqual([
      ["antigravity:gemini:session-5h", 0, Date.parse("Sep 30, 2026, 10:00 UTC")],
      ["antigravity:gemini:weekly", 9, Date.parse("Oct 02, 2026, 08:22 UTC")],
      ["antigravity:claude:weekly", 25, Date.parse("Oct 03, 2026, 12:00 UTC")],
      ["antigravity:gemini-4-argon:weekly", 47, Date.parse("Oct 04, 2026, 09:00 UTC")],
    ]);
  });

  it("accepts a measured percentage without inventing a reset time", () => {
    const snapshot = parseAntigravityAcpUsageReport(
      "### Quota Limits\n- **Gemini Models**\n  - **Weekly Limit Remaining:** 91% remaining",
      NOW,
    );
    expect(snapshot?.windows).toEqual([
      { id: "antigravity:gemini:weekly", label: "Gemini · Weekly", usedPercent: 9 },
    ]);
  });

  it("rejects unrelated prose, missing percentages, malformed resets, and empty sections", () => {
    expect(parseAntigravityAcpUsageReport("normal model answer", NOW)).toBeUndefined();
    expect(
      parseAntigravityAcpUsageReport(
        "### Quota Limits\n- **Gemini Models**\n  - **Weekly Limit Remaining:** unavailable",
        NOW,
      ),
    ).toBeUndefined();
    expect(
      parseAntigravityAcpUsageReport(
        "### Quota Limits\n- **Gemini Models**\n  - **Weekly Limit Remaining:** 91% remaining (resets never)",
        NOW,
      ),
    ).toBeUndefined();
  });
});

describe("readAntigravityAcpUsage", () => {
  it("runs one bare /usage prompt and normalizes the same-session chunks", async () => {
    const prompts: string[] = [];
    const controller = new AbortController();
    const probe = probeFixture({ chunks: [MARKDOWN], commands: [{ id: "usage" }] }, prompts);
    const result = await readAntigravityAcpUsage(runtime(), POSIX, NOW, {
      probe,
      signal: controller.signal,
    });

    expect(prompts).toEqual(["/usage"]);
    expect(probe.mock.calls[0]?.[3]?.signal).toBe(controller.signal);
    expect(result?.windows.map((window) => window.id)).toEqual([
      "antigravity:gemini:session-5h",
      "antigravity:gemini:weekly",
      "antigravity:claude:weekly",
      "antigravity:gemini-4-argon:weekly",
    ]);
    expect(probe.mock.calls[0]?.[3]).toMatchObject({
      fsTextCapability: false,
      terminalCapability: false,
    });
  });

  it("accepts 1.5.2 only when no command list was published and honors explicit exclusions", async () => {
    const accepted = await readAntigravityAcpUsage(runtime(), POSIX, NOW, {
      probe: probeFixture({ version: "1.5.2", chunks: [MARKDOWN] }),
    });
    expect(accepted?.status).toBe("ok");

    const explicitEmpty = await readAntigravityAcpUsage(runtime(), POSIX, NOW, {
      probe: probeFixture({ version: "1.5.2", chunks: [MARKDOWN], commands: [] }),
    });
    expect(explicitEmpty).toBeUndefined();

    const denied = await readAntigravityAcpUsage(runtime(), POSIX, NOW, {
      probe: probeFixture({ version: "1.5.1", chunks: [MARKDOWN], commands: [] }),
    });
    expect(denied).toBeUndefined();

    const advertised = await readAntigravityAcpUsage(runtime(), POSIX, NOW, {
      probe: probeFixture({
        version: "1.5.1",
        chunks: [MARKDOWN],
        commands: [{ id: "usage" }],
      }),
    });
    expect(advertised?.status).toBe("ok");
  });

  it("uses a Linux-neutral protocol cwd for WSL while keeping host spawn separate", async () => {
    const build = vi.fn<NonNullable<AgentAdapter["buildAcpAuthCommand"]>>(async () => ({
      command: "agy_acp_server",
      args: [],
    }));
    const wslRuntime: AntigravityAcpUsageRuntime = {
      status: status({ envKind: "wsl", envDistro: "Ubuntu", executablePath: undefined }),
      adapter: { buildAcpAuthCommand: build } as unknown as AgentAdapter,
    };
    const probe = probeFixture({ chunks: [MARKDOWN] });
    const snapshot = await readAntigravityAcpUsage(
      wslRuntime,
      {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/me/project",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\project",
      },
      NOW,
      {
        probe,
        resolveWslConversationsDir: () => "/home/me/.gemini/antigravity-acp/conversations",
      },
    );
    expect(snapshot?.status).toBe("ok");
    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({ envKind: "wsl", wslDistro: "Ubuntu" }),
    );
    expect(probe.mock.calls[0]?.[2]).toBe("/tmp");
    expect(probe.mock.calls[0]?.[3]?.processCwd).toBeUndefined();
  });

  it("skips WSL ACP before session/new without a known cleanup namespace", async () => {
    const probe = probeFixture({ chunks: [MARKDOWN] });
    const wslRuntime: AntigravityAcpUsageRuntime = {
      status: status({ envKind: "wsl", envDistro: "Ubuntu", executablePath: undefined }),
      adapter: {
        buildAcpAuthCommand: async () => ({ command: "agy_acp_server", args: [] }),
      } as unknown as AgentAdapter,
    };
    await expect(
      readAntigravityAcpUsage(
        wslRuntime,
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/home/me/project",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me\\project",
        },
        NOW,
        { probe, resolveWslConversationsDir: () => undefined },
      ),
    ).resolves.toBeUndefined();
    expect(probe).not.toHaveBeenCalled();
  });

  it("fences chunks to the utility session and caps accepted report text", async () => {
    const impostor = await readAntigravityAcpUsage(runtime(), POSIX, NOW, {
      probe: probeFixture({ impostorChunks: [MARKDOWN] }),
    });
    expect(impostor).toBeUndefined();

    const oversize = await readAntigravityAcpUsage(runtime(), POSIX, NOW, {
      probe: probeFixture({ chunks: ["x".repeat(128 * 1024 + 1)] }),
    });
    expect(oversize).toBeUndefined();
  });

  it("rejects positive prompt-response token accounting", async () => {
    const positive = await readAntigravityAcpUsage(runtime(), POSIX, NOW, {
      probe: probeFixture({
        chunks: [MARKDOWN],
        usage: { totalTokens: 1, inputTokens: 1, outputTokens: 0 },
      }),
    });
    expect(positive).toBeUndefined();

    const zero = await readAntigravityAcpUsage(runtime(), POSIX, NOW, {
      probe: probeFixture({
        chunks: [MARKDOWN],
        usage: { totalTokens: 0, inputTokens: 0, outputTokens: 0 },
      }),
    });
    expect(zero?.status).toBe("ok");
  });

  it("fails closed for a non-official agent or authenticated runtime", async () => {
    const prompts: string[] = [];
    const nonnative = await readAntigravityAcpUsage(runtime(), POSIX, NOW, {
      probe: probeFixture({ name: "other-acp", chunks: [MARKDOWN] }, prompts),
    });
    expect(nonnative).toBeUndefined();
    expect(prompts).toEqual([]);

    const unauthenticated = await readAntigravityAcpUsage(
      runtime(
        status({
          acpSessionEstablished: false,
          runtimeVariants: {
            acp: {
              presentationMode: "gui",
              installed: true,
              authState: "missing",
              authUsesProviderLogin: true,
              capabilities: {} as never,
            },
          },
        }),
      ),
      POSIX,
      NOW,
      { probe: probeFixture({ chunks: [MARKDOWN] }) },
    );
    expect(unauthenticated).toBeUndefined();
  });

  it("skips logged-out, timeout, cancelled, and malformed native responses", async () => {
    for (const fixture of [
      { chunks: [MARKDOWN], failPrompt: true },
      { chunks: [MARKDOWN], stopReason: "cancelled" as const },
      { chunks: ["### Quota Limits\n- **Gemini Models**\n  - **Weekly Limit Remaining:** soon"] },
    ]) {
      await expect(
        readAntigravityAcpUsage(runtime(), POSIX, NOW, { probe: probeFixture(fixture) }),
      ).resolves.toBeUndefined();
    }
  });

  it("removes only the exact newly created session files after process retirement", async () => {
    const root = await mkdtemp(join(tmpdir(), "poracode-agy-acp-cleanup-"));
    const conversations = join(root, "antigravity-acp", "conversations");
    await mkdir(conversations, { recursive: true });
    try {
      for (const suffix of [".db", ".db-shm", ".db-wal", ".meta"]) {
        await writeFile(join(conversations, `${SESSION_ID}${suffix}`), "owned");
      }
      await writeFile(join(conversations, "other-session.db"), "user");
      await writeFile(join(conversations, "not-a-uuid.meta"), "user");

      const probe = probeFixture({
        chunks: [MARKDOWN],
        cleanupEnv: { GEMINI_HOME: root },
      });
      await readAntigravityAcpUsage(runtime(), POSIX, NOW, { probe });

      expect((await readdir(conversations)).sort()).toEqual([
        "not-a-uuid.meta",
        "other-session.db",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
