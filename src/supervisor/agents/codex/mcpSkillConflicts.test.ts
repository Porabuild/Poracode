import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation, ResolvedMcpServer } from "@/shared/contracts";
import { primeWslLaunchEnvironment } from "../base";
import {
  buildCodexMcpSkillConflictArgs,
  buildCodexMcpSkillConflictArgsForPaths,
  serializeSkillConfigOverride,
  type CodexSkillConflictIo,
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

  it("disables the ChatGPT browser skill only for a launch with Poracode browser MCP", async () => {
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

    const args = await buildCodexMcpSkillConflictArgsForPaths(
      [browserServer()],
      codexHome,
      codexHome,
      [configPath],
    );

    expect(args[0]).toBe("-c");
    expect(args[1]).toContain('path = "/skills/keep-disabled/SKILL.md", enabled = false');
    expect(args[1]).toContain(`path = ${JSON.stringify(browserSkill)}, enabled = false`);
  });

  it("does not alter skills when Poracode browser MCP is absent", async () => {
    await expect(
      buildCodexMcpSkillConflictArgsForPaths([], "/missing", "/missing", []),
    ).resolves.toEqual([]);
  });

  it("reads a WSL codex home through the staging worker, never the UNC share", async () => {
    const location: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/demo/project",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\project",
    };
    primeWslLaunchEnvironment("Ubuntu", { shellPath: "/bin/bash", home: "/home/demo" });

    const exists = vi.fn<(distro: string, path: string) => Promise<boolean>>(async () => true);
    const readDirectory = vi.fn<
      (
        distro: string,
        path: string,
      ) => Promise<{ exists: boolean; entries: { name: string; directory: boolean }[] }>
    >(async () => ({ exists: true, entries: [{ name: "1.2.3", directory: true }] }));
    const readTextFile = vi.fn<(distro: string, path: string) => Promise<string | null>>(
      async () => '[[skills.config]]\npath = "/keep/SKILL.md"\nenabled = false\n',
    );
    const staging = { pathExists: exists, readDirectory, readTextFile } as never;

    const args = await buildCodexMcpSkillConflictArgs(location, [browserServer()], { staging });

    expect(exists).toHaveBeenCalled();
    expect(readDirectory).toHaveBeenCalled();
    expect(readTextFile).toHaveBeenCalled();
    // Worker paths are the distro UNC paths, not host-local ones.
    for (const call of exists.mock.calls) {
      expect(call[1]).toContain("\\\\wsl.localhost\\Ubuntu\\");
    }
    expect(args[0]).toBe("-c");
    expect(args[1]).toContain('path = "/keep/SKILL.md", enabled = false');
    expect(args[1]).toContain(
      'path = "/home/demo/.codex/plugins/cache/openai-bundled/browser/1.2.3/skills/control-in-app-browser/SKILL.md", enabled = false',
    );
  });

  it("keeps local work moving while one distro's worker stalls", async () => {
    const releaseStalled = Promise.withResolvers<void>();
    let stalled = true;
    const io: CodexSkillConflictIo = {
      exists: async () => {
        if (stalled) await releaseStalled.promise;
        return true;
      },
      readDirectory: async () => [{ name: "1.2.3", directory: true }],
      readTextFile: async () => "",
    };
    const blocked = buildCodexMcpSkillConflictArgsForPaths(
      [browserServer()],
      "/home/demo/.codex",
      "/home/demo/.codex",
      ["/home/demo/.codex/config.toml"],
      io,
    );
    let localAdvanced = false;
    await new Promise<void>((resolve) => {
      setImmediate(() => {
        localAdvanced = true;
        resolve();
      });
    });

    stalled = false;
    const other = await buildCodexMcpSkillConflictArgsForPaths(
      [browserServer()],
      "/home/demo/.codex",
      "/home/demo/.codex",
      ["/home/demo/.codex/config.toml"],
      io,
    );

    expect(localAdvanced).toBe(true);
    expect(other[0]).toBe("-c");
    stalled = true;
    releaseStalled.resolve();
    await expect(blocked).resolves.toEqual(other);
  });
});
