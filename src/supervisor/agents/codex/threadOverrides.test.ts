import { describe, expect, it } from "vitest";
import type { ResolvedMcpServer } from "@/shared/contracts";
import { codexMcpTokenEnvVar } from "../userMcp";
import { buildCodexThreadOverrides } from "./threadOverrides";

describe("buildCodexThreadOverrides", () => {
  it.each([undefined, "", "auto_review"])(
    "resets the reviewer for full-access threads with saved reviewer %j",
    (approvalsReviewer) => {
      const overrides = buildCodexThreadOverrides({
        model: "gpt-5.6",
        approvalPolicy: "never",
        sandboxMode: "danger-full-access",
        ...(approvalsReviewer !== undefined ? { approvalsReviewer } : {}),
      });

      expect(overrides).toMatchObject({
        approvalPolicy: "never",
        approvalsReviewer: "user",
        sandbox: "danger-full-access",
      });
    },
  );

  it("scopes cwd and MCP configuration to the app-server thread", () => {
    const browser: ResolvedMcpServer = {
      id: "browser",
      name: "browser",
      timeoutMs: 30_000,
      transport: {
        type: "http",
        url: "http://127.0.0.1:9000/mcp?thread=local-thread",
        headers: { Authorization: "Bearer secret-token" },
      },
    };

    const overrides = buildCodexThreadOverrides(
      { model: "gpt-5.6", effort: "high" },
      {
        projectLocation: { kind: "windows", path: "C:\\repo" },
        mcpServers: [browser],
      },
    );

    expect(overrides.cwd).toBe("C:\\repo");
    expect(overrides.config).toMatchObject({
      model_reasoning_effort: "high",
      model_context_window: 400_000,
      model_auto_compact_token_limit: 380_000,
      "mcp_servers.browser": {
        url: "http://127.0.0.1:9000/mcp?thread=local-thread",
        bearer_token_env_var: codexMcpTokenEnvVar(browser),
        tool_timeout_sec: 30,
        startup_timeout_sec: 30,
      },
    });
    expect(JSON.stringify(overrides.config)).not.toContain("secret-token");
  });

  it("maps a selected context size to the window and 95% compact limit", () => {
    const overrides = buildCodexThreadOverrides({ model: "gpt-5.6-sol", contextSize: "1m" });

    expect(overrides.config).toMatchObject({
      model_context_window: 1_000_000,
      model_auto_compact_token_limit: 950_000,
    });
  });

  it("disables a colliding native server for starts, resumes and forks", () => {
    const overrides = buildCodexThreadOverrides(
      { model: "gpt-6.1-terra", effort: "max" },
      {
        nativeMcpNames: ["custom-admin"],
        mcpServers: [
          {
            id: "custom-admin",
            name: "custom-admin",
            timeoutMs: 30_000,
            transport: { type: "stdio", command: "node", args: ["proxy.mjs"], env: {} },
          },
        ],
      },
    );
    expect(overrides.config).toMatchObject({
      model_reasoning_effort: "max",
      "mcp_servers.custom-admin": { enabled: false },
    });
    expect(
      Object.entries(overrides.config ?? {}).find(([key]) =>
        key.startsWith("mcp_servers.poracode_"),
      )?.[1],
    ).toMatchObject({ command: "node" });
  });

  it("suppresses detected Codex desktop bundled sidecars per thread and preserves opt-in", () => {
    const detectedSidecars = {
      enabledPlugins: new Set([
        "codex-app-tools@openai-bundled",
        "unified-computer-use@openai-bundled",
        "computer-use@openai-bundled",
        "chrome@openai-bundled",
      ]),
      hasNodeRepl: true,
    };
    const suppressed = buildCodexThreadOverrides({ model: "gpt-5.6" }, { detectedSidecars });
    expect(suppressed.config).toMatchObject({
      "plugins.codex-app-tools@openai-bundled": { enabled: false },
      "plugins.unified-computer-use@openai-bundled": { enabled: false },
      "plugins.computer-use@openai-bundled": { enabled: false },
      "plugins.chrome@openai-bundled": { enabled: false },
      "mcp_servers.node_repl": { enabled: false },
    });

    const optedIn = buildCodexThreadOverrides(
      { model: "gpt-5.6" },
      {
        detectedSidecars,
        agentSettings: { allowBundledCuaSidecars: true },
      },
    );
    expect(optedIn.config).toMatchObject({
      "plugins.codex-app-tools@openai-bundled": { enabled: false },
    });
    expect(optedIn.config).not.toHaveProperty("plugins.unified-computer-use@openai-bundled");
    expect(optedIn.config).not.toHaveProperty("mcp_servers.node_repl");
  });
});
