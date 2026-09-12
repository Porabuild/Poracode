import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "smol-toml";
import { expect, it } from "vitest";
import { grokNativeMcpConfig } from "./nativeMcp";
import { NativeMcpInstallation } from "../../mcp/nativeSetup/installation";
import type { McpServer } from "@/shared/contracts";
const server: McpServer = {
  id: "proof",
  name: "proof",
  enabled: true,
  description: "",
  timeoutMs: 45000,
  transport: { type: "stdio", command: "node", args: ["server.mjs"], env: { FIXTURE: "value" } },
};
it("writes Grok native entries, preserves user TOML, and refuses edited owned blocks", () => {
  mkdirSync("tmp/native-mcp-tests", { recursive: true });
  const root = mkdtempSync("tmp/native-mcp-tests/grok-");
  try {
    const config = grokNativeMcpConfig(join(root, "config.toml"));
    writeFileSync(config.path, '# keep this\n[models]\ndefault = "my-model"\n');
    const installation = new NativeMcpInstallation(config, root);
    installation.apply(installation.snapshot().revision, { proof: config.entry(server) }, []);
    const text = readFileSync(config.path, "utf8");
    const data = parse(text);
    expect(data.mcp_servers).toEqual({
      proof: {
        command: "node",
        args: ["server.mjs"],
        env: { FIXTURE: "value" },
        startup_timeout_sec: 45,
        tool_timeout_sec: 45,
      },
    });
    expect(text).toContain('# keep this\n[models]\ndefault = "my-model"');
    writeFileSync(config.path, text.replace('command = "node"', '# my comment\ncommand = "node"'));
    expect(installation.snapshot().modified).toEqual(["proof"]);
    expect(() => installation.apply(installation.snapshot().revision, {}, ["proof"])).toThrow(
      /not owned/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it("refuses unsupported Grok restrictions rather than dropping them", () => {
  expect(() => grokNativeMcpConfig().entry({ ...server, disabledTools: ["write"] })).toThrow(
    /restrictions/u,
  );
});
