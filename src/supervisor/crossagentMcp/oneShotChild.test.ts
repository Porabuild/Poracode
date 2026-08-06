import { describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import type { AgentAdapter, OneShotChildCommand } from "@/supervisor/agents/base";

// Pass the built command through unchanged so the driver spawns exactly what the
// provider's `buildSubagentOneShotCommand` returns (no shell/WSL wrapping). The
// WSL-aware wrapping itself lives in — and is tested by — `oneShotSpawn`.
vi.mock("@/supervisor/oneShotSpawn", () => ({
  buildOneShotSpec: (
    _location: ProjectLocation,
    command: string,
    args: string[],
    options?: { env?: Record<string, string> },
  ) => ({ command, args, ...(options?.env ? { env: options.env } : {}) }),
}));

const { runOneShotChild } = await import("./oneShotChild");

const PROJECT: ProjectLocation = { kind: "posix", path: "/tmp/project" };

/** Adapter whose one-shot command runs a node snippet with deterministic IO. */
function nodeAdapter(build: () => OneShotChildCommand | undefined): AgentAdapter {
  return {
    label: "Fake",
    buildSubagentOneShotCommand: build,
  } as unknown as AgentAdapter;
}

function run(adapter: AgentAdapter): Promise<{
  output: string;
  status: "completed" | "failed";
  errorMessage?: string;
}> {
  return new Promise((resolve) => {
    let output = "";
    runOneShotChild({
      adapter,
      projectLocation: PROJECT,
      model: "m",
      effort: undefined,
      prompt: "hi",
      onTextDelta: (delta) => {
        output += delta;
      },
      onSettle: ({ status, errorMessage }) =>
        resolve({ output, status, ...(errorMessage ? { errorMessage } : {}) }),
    });
  });
}

describe("runOneShotChild", () => {
  it("streams stdout and settles completed on exit 0", async () => {
    const adapter = nodeAdapter(() => ({
      command: process.execPath,
      args: ["-e", "process.stdout.write('hello '); process.stdout.write('world')"],
      stdin: "",
    }));
    const result = await run(adapter);
    expect(result.status).toBe("completed");
    expect(result.output).toBe("hello world");
  });

  it("settles failed with the stderr tail on a non-zero exit", async () => {
    const adapter = nodeAdapter(() => ({
      command: process.execPath,
      args: ["-e", "process.stderr.write('boom'); process.exit(3)"],
      stdin: "",
    }));
    const result = await run(adapter);
    expect(result.status).toBe("failed");
    expect(result.errorMessage).toContain("boom");
  });

  it("settles failed immediately when the provider returns no command", async () => {
    const adapter = nodeAdapter(() => undefined);
    const result = await run(adapter);
    expect(result.status).toBe("failed");
    expect(result.errorMessage).toContain("cannot be spawned");
  });

  it("cancel() terminates a long-running child", async () => {
    const adapter = nodeAdapter(() => ({
      command: process.execPath,
      // Sleep ~30s; cancel should kill it well before then.
      args: ["-e", "setTimeout(() => {}, 30000)"],
      stdin: "",
    }));
    const settled = new Promise<"completed" | "failed">((resolve) => {
      const handle = runOneShotChild({
        adapter,
        projectLocation: PROJECT,
        model: "m",
        effort: undefined,
        prompt: "hi",
        onTextDelta: () => {},
        onSettle: ({ status }) => resolve(status),
      });
      setTimeout(() => handle.cancel(), 50);
    });
    // A killed process never exits 0 → the driver reports a non-completed settle.
    expect(await settled).toBe("failed");
  });
});
