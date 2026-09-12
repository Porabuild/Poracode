import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createCursorAdapter } from "./index";
import type { ResolvedMcpServer } from "@/shared/contracts";
import { mergeCliHookExtraArgs } from "../../runtime/threadSession/cliHookArgs";

vi.mock("./session", () => ({ createCursorChatSync: () => undefined }));

const server: ResolvedMcpServer = {
  id: "fixture",
  name: "fixture",
  timeoutMs: 12000,
  transport: {
    type: "stdio",
    command: "node",
    args: ["server.mjs"],
    cwd: "/plugin",
    env: { FIXTURE: "private-value" },
  },
};

describe("cursor MCP launch", () => {
  it.each(["", "initial prompt"])(
    "keeps launch and resume configs isolated with prompt %j",
    (prompt) => {
      const adapter = createCursorAdapter();
      const location = { kind: "posix" as const, path: "/project" };
      const fresh = adapter.buildLaunchArgv(location, { model: "" }, prompt, undefined, {
        mcpServers: [server],
      });
      const resume = adapter.buildResumeArgv(
        location,
        { model: "" },
        prompt,
        { providerSessionId: "existing", discoveredAt: "2026-09-10T00:00:00Z" },
        { mcpServers: [{ ...server, name: "other" }] },
      );
      try {
        const paths = [fresh, resume].map(
          (launch) => launch.args[launch.args.indexOf("--plugin-dir") + 1]! + "/mcp.json",
        );
        expect(paths[0]).not.toBe(paths[1]);
        expect(JSON.parse(readFileSync(paths[0]!, "utf8")).mcpServers.fixture.env.FIXTURE).toBe(
          "private-value",
        );
        expect(JSON.parse(readFileSync(paths[1]!, "utf8")).mcpServers.other).toBeDefined();
        for (const launch of [fresh, resume]) {
          expect(launch.args.join(" ")).not.toContain("private-value");
          const withHooks = mergeCliHookExtraArgs(
            adapter,
            launch.args,
            ["--settings", "hooks.json"],
            prompt,
          );
          const delimiter = withHooks.indexOf("--");
          expect(withHooks.indexOf("--settings")).toBeLessThan(
            delimiter < 0 ? withHooks.length : delimiter,
          );
          expect(launch.args.includes(prompt)).toBe(Boolean(prompt));
        }
        fresh.cleanup?.();
        expect(existsSync(paths[0]!)).toBe(false);
        expect(existsSync(paths[1]!)).toBe(true);
        expect(adapter.capabilities.mcpScope?.terminal).toBe("launch");
        expect(
          adapter.buildLaunchArgv(location, { model: "" }, "", undefined, { mcpServers: [] }).args,
        ).not.toContain("--plugin-dir");
      } finally {
        fresh.cleanup?.();
        resume.cleanup?.();
      }
    },
  );
});
