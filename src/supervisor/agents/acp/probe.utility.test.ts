import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { probeAcpCapabilities, type AcpUtilitySession } from "./probe";

const FIXTURE = fileURLToPath(new URL("./fixtures/fake-acp-agent.mjs", import.meta.url));

describe("probeAcpCapabilities utility session", () => {
  it("runs after newSession, returns the utility result before model sweeps, and cleans up after exit", async () => {
    const cleanup = vi.fn<() => Promise<void>>(async () => {});
    const prompts: string[] = [];
    let observedChunks = 0;
    const utility: AcpUtilitySession = {
      qualifies: (initialize) => initialize.agentInfo?.name === "fake-acp-agent",
      onSessionUpdate: (notification) => {
        if (notification.update.sessionUpdate === "agent_message_chunk") observedChunks += 1;
      },
      run: async (context) => {
        prompts.push("/usage");
        const response = await context.prompt("/usage");
        return {
          stopReason: response.stopReason,
          commands: context.slashCommands?.map((command) => command.id),
        };
      },
      cleanupAfterProcess: cleanup,
    };

    const result = await probeAcpCapabilities(process.execPath, [FIXTURE], process.cwd(), {
      timeoutMs: 5_000,
      env: {
        FAKE_MODELS: "model-a",
        FAKE_SLASH_BATCHES: JSON.stringify([
          { delayMs: 0, commands: [{ name: "usage", description: "Show quota" }] },
        ]),
        FAKE_PROMPT_USAGE_UPDATES: JSON.stringify([]),
      },
      utilitySession: utility,
    });

    expect(prompts).toEqual(["/usage"]);
    expect(result?.utilityResult).toEqual({ stopReason: "end_turn", commands: ["usage"] });
    expect(result?.models).toBeUndefined();
    expect(observedChunks).toBe(0);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("fails closed before newSession when initialize does not qualify", async () => {
    const root = await mkdtemp(join(tmpdir(), "poracode-acp-utility-skip-"));
    const newMarker = join(root, "session-new.txt");
    try {
      const result = await probeAcpCapabilities(process.execPath, [FIXTURE], process.cwd(), {
        timeoutMs: 3_000,
        env: { FAKE_SESSION_NEW_MARKER: newMarker },
        utilitySession: {
          qualifies: () => false,
          run: async () => {
            throw new Error("utility must not run");
          },
        },
      });
      expect(result?.utilityResult).toBeUndefined();
      await expect(access(newMarker)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
