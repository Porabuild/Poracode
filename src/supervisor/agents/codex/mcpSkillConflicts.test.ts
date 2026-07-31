import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ResolvedMcpServer } from "@/shared/contracts";
import {
  buildCodexMcpSkillConflictArgsForPaths,
  serializeSkillConfigOverride,
} from "./mcpSkillConflicts";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function browserServer(): ResolvedMcpServer {
  return {
    id: "browser",
    name: "browser",
    timeoutMs: 30_000,
    transport: { type: "http", url: "http://127.0.0.1:9000/mcp", headers: {} },
  };
}

describe("Codex MCP skill conflicts", () => {
  it("serializes preserved skill settings and the Poracode-specific disable", () => {
    expect(
      serializeSkillConfigOverride([
        { path: "/skills/user/SKILL.md", enabled: true },
        {
          path: "C:\\Users\\demo\\.codex\\plugins\\browser\\SKILL.md",
          enabled: false,
        },
      ]),
    ).toBe(
      '[{ path = "/skills/user/SKILL.md", enabled = true }, { path = "C:\\\\Users\\\\demo\\\\.codex\\\\plugins\\\\browser\\\\SKILL.md", enabled = false }]',
    );
  });

  it("disables the ChatGPT browser skill only for a launch with Poracode browser MCP", () => {
    const codexHome = mkdtempSync(join(tmpdir(), "poracode-codex-skill-"));
    tempDirs.push(codexHome);
    const browserSkill = join(
      codexHome,
      "plugins",
      "cache",
      "openai-bundled",
      "browser",
      "1.2.3",
      "skills",
      "control-in-app-browser",
      "SKILL.md",
    );
    mkdirSync(join(browserSkill, ".."), { recursive: true });
    writeFileSync(browserSkill, "---\nname: control-in-app-browser\n---\n");
    const configPath = join(codexHome, "config.toml");
    writeFileSync(
      configPath,
      '[[skills.config]]\npath = "/skills/keep-disabled/SKILL.md"\nenabled = false\n',
    );

    const args = buildCodexMcpSkillConflictArgsForPaths([browserServer()], codexHome, codexHome, [
      configPath,
    ]);

    expect(args[0]).toBe("-c");
    expect(args[1]).toContain('path = "/skills/keep-disabled/SKILL.md", enabled = false');
    expect(args[1]).toContain(`path = ${JSON.stringify(browserSkill)}, enabled = false`);
  });

  it("does not alter skills when Poracode browser MCP is absent", () => {
    expect(buildCodexMcpSkillConflictArgsForPaths([], "/missing", "/missing", [])).toEqual([]);
  });
});
