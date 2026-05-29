import { describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { manifestUncPath, parseWorkflowManifest, readWorkflowRun } from "./transcriptReader";

function makeManifest(overrides: Record<string, unknown> = {}): unknown {
  return {
    runId: "wf_5478fde3-ae0",
    taskId: "wiaaqsf20",
    workflowName: "test-todo-app",
    summary: "Test the vanilla-JS todo app: review across dimensions, adversarially verify",
    status: "completed",
    startTime: 1780004861033,
    durationMs: 105862,
    totalTokens: 497435,
    totalToolCalls: 58,
    agentCount: 27,
    defaultModel: "claude-opus-4-8[1m]",
    scriptPath: "/tmp/scripts/x.js",
    phases: [
      { title: "Review", detail: "one agent per test dimension" },
      { title: "Verify", detail: "adversarially confirm each finding is real" },
      { title: "Synthesize", detail: "merge into a single test report" },
    ],
    workflowProgress: [
      { type: "workflow_phase", index: 1, title: "Review" },
      { type: "workflow_phase", index: 2, title: "Verify" },
      { type: "workflow_phase", index: 3, title: "Synthesize" },
      {
        type: "workflow_agent",
        index: 1,
        label: "review:functional",
        phaseIndex: 1,
        phaseTitle: "Review",
        agentId: "a9856bef19e02cdf4",
        model: "claude-opus-4-8[1m]",
        state: "done",
        startedAt: 1780004861063,
        durationMs: 21956,
        tokens: 19034,
        toolCalls: 2,
        lastToolName: "StructuredOutput",
        promptPreview: "Read /home/x/todo-app/index.html.",
        resultPreview: '{"findings":[]}',
      },
      {
        type: "workflow_agent",
        index: 2,
        label: "verify:security:191",
        phaseIndex: 2,
        phaseTitle: "Verify",
        agentId: "a0317209e3a61c4ed",
        model: "claude-opus-4-8[1m]",
        state: "done",
        durationMs: 17000,
        tokens: 21500,
        toolCalls: 2,
      },
    ],
    ...overrides,
  };
}

describe("parseWorkflowManifest", () => {
  it("folds workflow_progress into phases with their agents", () => {
    const run = parseWorkflowManifest(makeManifest());
    expect(run.runId).toBe("wf_5478fde3-ae0");
    expect(run.workflowName).toBe("test-todo-app");
    expect(run.status).toBe("completed");
    expect(run.agentCount).toBe(27);
    expect(run.totalTokens).toBe(497435);
    expect(run.defaultModel).toBe("claude-opus-4-8[1m]");

    expect(run.phases).toHaveLength(3);
    expect(run.phases[0]?.title).toBe("Review");
    expect(run.phases[0]?.detail).toBe("one agent per test dimension");
    expect(run.phases[0]?.agents).toHaveLength(1);
    expect(run.phases[0]?.agents[0]?.label).toBe("review:functional");
    expect(run.phases[0]?.agents[0]?.tokens).toBe(19034);
    expect(run.phases[1]?.agents[0]?.label).toBe("verify:security:191");
    expect(run.phases[2]?.agents).toEqual([]);
    expect(run.unphasedAgents).toEqual([]);
  });

  it("creates phases on demand for events that have no matching declared phase", () => {
    const run = parseWorkflowManifest(
      makeManifest({
        phases: [],
        workflowProgress: [
          { type: "workflow_phase", title: "Discover" },
          {
            type: "workflow_agent",
            label: "discover:1",
            agentId: "a1",
            phaseTitle: "Discover",
          },
        ],
      }),
    );
    expect(run.phases.map((p) => p.title)).toEqual(["Discover"]);
    expect(run.phases[0]?.agents[0]?.label).toBe("discover:1");
  });

  it("buckets agents with no matching phase into unphasedAgents", () => {
    const run = parseWorkflowManifest(
      makeManifest({
        phases: [{ title: "Review" }],
        workflowProgress: [
          {
            type: "workflow_agent",
            label: "orphan:1",
            agentId: "a-orphan",
            phaseTitle: "Missing",
          },
        ],
      }),
    );
    expect(run.unphasedAgents).toHaveLength(1);
    expect(run.unphasedAgents[0]?.label).toBe("orphan:1");
    expect(run.phases[0]?.agents).toEqual([]);
  });

  it("defaults agentCount to the number of agents found when not declared", () => {
    const run = parseWorkflowManifest(makeManifest({ agentCount: undefined }));
    expect(run.agentCount).toBe(2);
  });

  it("falls back to status='unknown' for unexpected status strings", () => {
    const run = parseWorkflowManifest(makeManifest({ status: "weird" }));
    expect(run.status).toBe("unknown");
  });

  it("skips malformed progress records without throwing", () => {
    const run = parseWorkflowManifest(
      makeManifest({
        workflowProgress: [
          null,
          { type: "workflow_agent" },
          { type: "workflow_agent", label: "no-id" },
          { type: "workflow_phase" },
          { type: "workflow_phase", title: "OnlyPhase" },
          { type: "workflow_agent", label: "valid", agentId: "a1", phaseTitle: "OnlyPhase" },
        ],
      }),
    );
    const onlyPhase = run.phases.find((p) => p.title === "OnlyPhase");
    expect(onlyPhase?.agents).toHaveLength(1);
    expect(onlyPhase?.agents[0]?.label).toBe("valid");
  });

  it("rejects non-object input loudly", () => {
    expect(() => parseWorkflowManifest(null)).toThrow(/not an object/i);
    expect(() => parseWorkflowManifest("oops")).toThrow(/not an object/i);
  });
});

describe("readWorkflowRun transcript-dir fallback", () => {
  it("prefers journal.jsonl when present — counts done vs in-flight from `started`/`result` events", async () => {
    const root = mkdtempSync(join(tmpdir(), "wf-test-"));
    const sessionDir = join(root, "session");
    const transcriptDir = join(sessionDir, "subagents", "workflows", "wf_test");
    await mkdir(transcriptDir, { recursive: true });
    // Three agents started, one finished.
    const journal = [
      JSON.stringify({ type: "started", agentId: "a1" }),
      JSON.stringify({ type: "started", agentId: "a2" }),
      JSON.stringify({ type: "started", agentId: "a3" }),
      JSON.stringify({ type: "result", agentId: "a1", result: { ok: true } }),
      "", // blank line, must be skipped
      "not-json-junk", // malformed line, must be skipped
    ].join("\n");
    await writeFile(join(transcriptDir, "journal.jsonl"), journal);
    // .meta.json files exist but should be IGNORED when the journal is present.
    await writeFile(join(transcriptDir, "agent-a1.meta.json"), "{}");

    const manifestPath = join(sessionDir, "workflows", "wf_test.json");
    const run = await readWorkflowRun({
      manifestPath,
      transcriptDir,
      location: { kind: "posix", path: root },
    });
    expect(run?.status).toBe("running");
    expect(run?.agentCount).toBe(3);
    const byId = new Map(run!.unphasedAgents.map((a) => [a.agentId, a.state]));
    expect(byId.get("a1")).toBe("done");
    expect(byId.get("a2")).toBe("running");
    expect(byId.get("a3")).toBe("running");
  });

  it("synthesizes a running run from agent-*.meta.json files when the manifest is missing", async () => {
    const root = mkdtempSync(join(tmpdir(), "wf-test-"));
    const sessionDir = join(root, "session");
    const transcriptDir = join(sessionDir, "subagents", "workflows", "wf_test");
    await mkdir(transcriptDir, { recursive: true });
    await writeFile(join(transcriptDir, "agent-a1.meta.json"), '{"agentType":"workflow-subagent"}');
    await writeFile(join(transcriptDir, "agent-a2.meta.json"), '{"agentType":"workflow-subagent"}');
    // A non-meta file should not be counted.
    await writeFile(join(transcriptDir, "agent-a1.jsonl"), "");

    const manifestPath = join(sessionDir, "workflows", "wf_test.json");
    const run = await readWorkflowRun({
      manifestPath,
      transcriptDir,
      location: { kind: "posix", path: root },
    });
    expect(run).not.toBeNull();
    expect(run?.status).toBe("running");
    expect(run?.agentCount).toBe(2);
    expect(run?.unphasedAgents.map((a) => a.agentId).sort()).toEqual(["a1", "a2"]);
    expect(run?.unphasedAgents.every((a) => a.state === "running")).toBe(true);
  });

  it("returns null when both the manifest and transcript dir are missing", async () => {
    const root = mkdtempSync(join(tmpdir(), "wf-test-"));
    const run = await readWorkflowRun({
      manifestPath: join(root, "workflows", "missing.json"),
      transcriptDir: join(root, "subagents", "workflows", "missing"),
      location: { kind: "posix", path: root },
    });
    expect(run).toBeNull();
  });

  it("uses transcript-dir fallback only when the manifest is missing — does not override a present manifest", async () => {
    const root = mkdtempSync(join(tmpdir(), "wf-test-"));
    const sessionDir = join(root, "session");
    const workflowsDir = join(sessionDir, "workflows");
    const transcriptDir = join(sessionDir, "subagents", "workflows", "wf_real");
    await mkdir(workflowsDir, { recursive: true });
    await mkdir(transcriptDir, { recursive: true });
    await writeFile(
      join(workflowsDir, "wf_real.json"),
      JSON.stringify({
        runId: "wf_real",
        status: "running",
        agentCount: 5,
        phases: [],
        workflowProgress: [],
      }),
    );
    await writeFile(join(transcriptDir, "agent-x.meta.json"), "{}");

    const run = await readWorkflowRun({
      manifestPath: join(workflowsDir, "wf_real.json"),
      transcriptDir,
      location: { kind: "posix", path: root },
    });
    expect(run?.agentCount).toBe(5);
    expect(run?.unphasedAgents).toEqual([]);
  });
});

describe("manifestUncPath", () => {
  it("derives a UNC path inside the same WSL distro for paths outside the project root", () => {
    const result = manifestUncPath(
      "\\\\wsl.localhost\\Ubuntu\\home\\me\\proj",
      "/home/me/proj",
      "/home/me/.claude/projects/p/sess/workflows/wf_X.json",
    );
    expect(result).toBe(
      "\\\\wsl.localhost\\Ubuntu\\home\\me\\.claude\\projects\\p\\sess\\workflows\\wf_X.json",
    );
  });

  it("works with the older \\\\wsl$ prefix", () => {
    const result = manifestUncPath(
      "\\\\wsl$\\Ubuntu\\home\\me\\proj",
      "/home/me/proj",
      "/home/me/.claude/x.json",
    );
    expect(result).toBe("\\\\wsl$\\Ubuntu\\home\\me\\.claude\\x.json");
  });

  it("throws when uncPath does not end with the linuxPath tail", () => {
    expect(() =>
      manifestUncPath("\\\\wsl.localhost\\Ubuntu\\other", "/home/me/proj", "/x.json"),
    ).toThrow(/does not end with/i);
  });

  it("throws on non-absolute target paths", () => {
    expect(() =>
      manifestUncPath(
        "\\\\wsl.localhost\\Ubuntu\\home\\me\\proj",
        "/home/me/proj",
        "relative/x.json",
      ),
    ).toThrow(/absolute linux path/i);
  });
});
