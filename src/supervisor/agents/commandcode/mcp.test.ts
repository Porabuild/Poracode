import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedMcpServer } from "@/shared/contracts";
import { createCommandCodeAdapter } from "./index";
import { commandCodeMcpLaunch } from "./mcp";
import { SkillsService } from "../../skills/SkillsService";
import { deployFilesToWslTempBase } from "../../wsl/wslDeploy";
import { toWslUncPath } from "@/shared/wsl";

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return { ...fs, rmSync: vi.fn<typeof fs.rmSync>(fs.rmSync) };
});

vi.mock("../../wsl/wslDeploy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../wsl/wslDeploy")>()),
  deployFilesToWslTempBase: vi.fn<typeof deployFilesToWslTempBase>(),
}));

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "poracode-commandcode-test-"));
  roots.push(root);
  writeFileSync(join(root, "commandcode-mcp-mod.mjs"), "export default function () {}\n");
  vi.stubEnv("PORACODE_WSL_HELPERS_DIR", root);
  return root;
}
const server: ResolvedMcpServer = {
  id: "plugin:tools:local",
  name: "tools.local",
  timeoutMs: 1000,
  transport: {
    type: "stdio",
    command: "node",
    args: ["server.mjs"],
    env: { KEY: "private" },
    cwd: "/plugin",
  },
};

describe("Command Code launch integrations", () => {
  it("passes independent MCP configurations on launch and resume without persisting secrets", () => {
    const root = fixture();
    const adapter = createCommandCodeAdapter();
    const location = { kind: "posix" as const, path: root };
    const fresh = adapter.buildLaunchArgv(location, { model: "" }, "hello", undefined, {
      mcpServers: [server],
    });
    const resumed = adapter.buildResumeArgv(
      location,
      { model: "" },
      "next",
      {
        discoveredAt: "2026-09-10T00:00:00Z",
        providerSessionId: "f49dfcc8-1cd8-43ef-8203-0e51dfe72e75",
      },
      { mcpServers: [{ ...server, name: "other" }] },
    );
    expect(adapter.capabilities.mcpScope?.terminal).toBe("launch");
    for (const launch of [fresh, resumed]) {
      expect(launch.args.slice(0, 2)).toEqual(["--mod", join(root, "commandcode-mcp-mod.mjs")]);
      expect(launch.args.join(" ")).not.toContain("private");
    }
    expect(resumed.args).toContain("--resume");
    const decode = (value: string) => JSON.parse(Buffer.from(value, "base64url").toString());
    expect(decode(fresh.env!.PORACODE_COMMANDCODE_MCP!)).toEqual({ version: 1, servers: [server] });
    expect(decode(resumed.env!.PORACODE_COMMANDCODE_MCP!).servers[0].name).toBe("other");
    expect(readFileSync(join(root, "commandcode-mcp-mod.mjs"), "utf8")).not.toContain("private");
    expect(commandCodeMcpLaunch(location)).toEqual({ args: [] });
  });

  it("stages independent WSL launches, returns Linux paths and cleans up their own directories", () => {
    fixture();
    vi.mocked(deployFilesToWslTempBase).mockImplementation((_distro, name) => ({
      linuxBaseDir: `/tmp/${name}`,
    }));
    const location = {
      kind: "wsl" as const,
      distro: "Ubuntu",
      linuxPath: "/workspace",
      uncPath: toWslUncPath("Ubuntu", "/workspace"),
    };
    const first = commandCodeMcpLaunch(location, [server]);
    const second = commandCodeMcpLaunch(location, [server]);
    expect(first.args[1]).toMatch(/^\/tmp\/poracode-commandcode-[\w-]+\/commandcode-mcp-mod\.mjs$/);
    expect(first.args[1]).not.toBe(second.args[1]);
    expect(first.env).toEqual(second.env);
    const remove = vi
      .mocked(rmSync)
      .mockClear()
      .mockImplementationOnce(() => undefined);
    first.cleanup!();
    expect(remove).toHaveBeenCalledExactlyOnceWith(
      toWslUncPath("Ubuntu", first.args[1]!.replace("/commandcode-mcp-mod.mjs", "")),
      { recursive: true, force: true },
    );
    vi.mocked(deployFilesToWslTempBase).mockReturnValue(null);
    expect(() => commandCodeMcpLaunch(location, [server])).toThrow("could not be deployed to WSL");
  });

  it("fails explicitly if MCPs are selected but the shipped mod is absent", () => {
    vi.stubEnv("PORACODE_WSL_HELPERS_DIR", "/missing");
    expect(() => commandCodeMcpLaunch({ kind: "posix", path: "/project" }, [server])).toThrow(
      "is unavailable",
    );
  });

  it("keeps native skill invocations and rewrites external plugin skills to readable paths", async () => {
    const root = fixture();
    const project = join(root, "project");
    mkdirSync(project);
    const adapter = createCommandCodeAdapter();
    const service = new SkillsService({
      adapters: new Map([["commandcode", adapter]]),
      homeDirectory: () => root,
      env: {},
    });
    const native = {
      kind: "skill" as const,
      name: "native",
      path: join(project, ".agents/skills/native/SKILL.md"),
      invocation: "/native",
      provider: "agents",
      scope: "project" as const,
    };
    const external = {
      ...native,
      name: "plugin-skill",
      invocation: "/plugin-skill",
      path: join(root, "plugin/skills/proof/SKILL.md"),
    };
    const result = await service.rewriteTerminalSkillSegments({
      agentKind: "commandcode",
      projectLocation: { kind: "posix", path: project },
      segments: [native, external],
    });
    expect(result[0]).toEqual(native);
    expect(result[1]).toEqual({
      kind: "text",
      content: `Use the "plugin-skill" agent skill: read ${external.path} and follow its instructions.`,
    });
  });
});
