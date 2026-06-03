import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Isolate from the real `~/.claude/projects` (this machine has live logs there)
// by pointing homedir at a temp dir; only the fixture below is read.
const osMock = vi.hoisted(() => ({ home: "" }));
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => osMock.home };
});

const { scanClaudeCost } = await import("./usageCostScanner");

const NOW = Date.now();

function writeSessionLog(home: string): void {
  const dir = join(home, ".claude", "projects", "proj1");
  mkdirSync(dir, { recursive: true });
  const line = JSON.stringify({
    type: "assistant",
    timestamp: new Date(NOW - 60_000).toISOString(),
    requestId: "req-1",
    message: {
      id: "msg-1",
      model: "claude-sonnet-4-5",
      usage: { input_tokens: 100, output_tokens: 50 },
    },
  });
  writeFileSync(join(dir, "session.jsonl"), `${line}\n`);
}

let savedConfigDir: string | undefined;

beforeEach(() => {
  osMock.home = mkdtempSync(join(tmpdir(), "lc-cost-"));
  savedConfigDir = process.env.CLAUDE_CONFIG_DIR;
  delete process.env.CLAUDE_CONFIG_DIR;
});

afterEach(() => {
  rmSync(osMock.home, { recursive: true, force: true });
  if (savedConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedConfigDir;
});

describe("scanClaudeCost", () => {
  it("estimates 30-day tokens/cost from recent Claude session logs", async () => {
    writeSessionLog(osMock.home);
    const scan = await scanClaudeCost(NOW);
    expect(scan.estimate).toBeDefined();
    expect(scan.estimate?.tokens.total).toBe(150);
    expect(scan.estimate?.cost.estimated).toBe(true);
    expect(scan.truncated).toBe(false);
  });

  it("memoizes on an unchanged log tree (same result object)", async () => {
    writeSessionLog(osMock.home);
    const first = await scanClaudeCost(NOW);
    const second = await scanClaudeCost(NOW);
    expect(second).toBe(first);
  });

  it("returns no estimate when there are no logs", async () => {
    const scan = await scanClaudeCost(NOW);
    expect(scan.estimate).toBeUndefined();
  });
});
