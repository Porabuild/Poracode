import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCodexAdapter } from ".";
import { parseCodexConfigDefaults, readCodexConfigDefaults } from "./configDefaults";

const dirs: string[] = [];

async function homeWith(config?: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "codex-config-defaults-"));
  dirs.push(dir);
  if (config !== undefined) await writeFile(join(dir, "config.toml"), config);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("parseCodexConfigDefaults", () => {
  it("reads sub-agent, plan-mode and parent values", () => {
    expect(
      parseCodexConfigDefaults(`
model = "gpt-6.1-sol"
model_reasoning_effort = "high"
plan_mode_reasoning_effort = "xhigh"

[agents]
max_concurrent_threads_per_session = 8
default_subagent_model = "gpt-6-luna"
default_subagent_reasoning_effort = "max"
`),
    ).toEqual({
      parentModel: "gpt-6.1-sol",
      parentReasoningEffort: "high",
      planModeReasoningEffort: "xhigh",
      maxSubagents: "8",
      subagentModel: "gpt-6-luna",
      subagentReasoningEffort: "max",
    });
  });

  it("accepts the max_threads alias", () => {
    expect(parseCodexConfigDefaults("[agents]\nmax_threads = 10\n")).toEqual({
      maxSubagents: "10",
    });
  });

  it("skips empty or wrongly typed values", () => {
    expect(
      parseCodexConfigDefaults(
        'model = ""\nmodel_reasoning_effort = 3\n[agents]\nmax_threads = "x"\n',
      ),
    ).toEqual({});
  });
});

describe("readCodexConfigDefaults", () => {
  it("returns an empty record when config.toml does not exist", async () => {
    expect(await readCodexConfigDefaults(await homeWith())).toEqual({});
  });

  it("returns an empty record for invalid TOML", async () => {
    expect(await readCodexConfigDefaults(await homeWith("model = = ["))).toEqual({});
  });

  it("reads the file from the given Codex home", async () => {
    expect(await readCodexConfigDefaults(await homeWith('model = "gpt-6-luna"\n'))).toEqual({
      parentModel: "gpt-6-luna",
    });
  });
});

describe("createCodexAdapter readConfigDefaults", () => {
  it("reads the profile's own Codex home, not the global one", async () => {
    const home = await homeWith('model = "gpt-6-luna"\n');
    const adapter = createCodexAdapter({ homeDir: home });

    expect(await adapter.readConfigDefaults?.()).toEqual({ parentModel: "gpt-6-luna" });
  });
});
