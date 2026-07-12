import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import { sanitizeCommandCodeCwd } from "../agents/commandcode/sessionFiles";
import { ExternalMcpDiscoveryService } from "./ExternalMcpDiscoveryService";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "poracode-mcp-discovery-"));
  tempDirs.push(dir);
  return dir;
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function nativeProjectLocation(path: string): ProjectLocation {
  return process.platform === "win32" ? { kind: "windows", path } : { kind: "posix", path };
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("ExternalMcpDiscoveryService", () => {
  it("discovers supported user configs without resolving provider-owned auth", async () => {
    const home = makeTempDir();
    write(
      join(home, ".claude.json"),
      JSON.stringify({
        mcpServers: {
          browser: { type: "http", url: "https://example.test/mcp" },
          oauth_server: {
            type: "http",
            url: "https://oauth.example.test/mcp",
            oauth: { scopes: "read" },
          },
        },
      }),
    );
    write(
      join(home, ".codex", "config.toml"),
      [
        '[mcp_servers."codex-local"]',
        'command = "node"',
        'args = ["server.mjs"]',
        'env = { MODE = "read" }',
        "enabled = false",
        "tool_timeout_sec = 12",
        "",
        "[mcp_servers.codex_static]",
        'url = "https://codex.example.test/mcp"',
        'http_headers = { Authorization = "Bearer static" }',
        "",
        "[mcp_servers.codex_env_auth]",
        'url = "https://secret.example.test/mcp"',
        'bearer_token_env_var = "MCP_TOKEN"',
      ].join("\n"),
    );
    write(
      join(home, ".gemini", "settings.json"),
      JSON.stringify({
        mcpServers: {
          gemini_sse: { url: "https://gemini.example.test/sse", timeout: 9000 },
          adc_server: {
            httpUrl: "https://google.example.test/mcp",
            authProviderType: "google_credentials",
          },
        },
      }),
    );
    write(
      join(home, ".config", "opencode", "opencode.jsonc"),
      `{
        // JSONC comments and trailing commas are supported.
        mcp: {
          user_tool: { type: 'local', command: ['npx', '-y', 'user-tool'], timeout: 7000 },
          browser: { type: 'remote', url: 'https://managed.example.test/mcp' },
          lightcode_subagents: { type: 'remote', url: 'https://legacy.example.test/mcp' },
          CaseManaged: { type: 'remote', url: 'https://sidecar.example.test/mcp' },
        },
      }`,
    );
    write(join(home, ".config", "opencode", ".poracode-managed-mcp.json"), '["casemanaged"]');
    write(
      join(home, ".cursor", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          cursor_remote: {
            type: "http",
            url: "https://cursor.example.test/mcp",
            headers: { "X-Mode": "read" },
          },
        },
      }),
    );

    const service = new ExternalMcpDiscoveryService({
      homeDirectory: () => home,
      env: {},
    });
    const result = await service.discover({ sourceScope: "user" });

    expect(result.groups.map((entry) => entry.providerId)).toEqual([
      "claude",
      "codex",
      "gemini",
      "opencode",
      "cursor",
    ]);
    expect(result.groups.find((entry) => entry.providerId === "claude")?.servers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "browser",
          transport: { type: "http", url: "https://example.test/mcp", headers: {} },
        }),
        expect.objectContaining({
          name: "oauth_server",
          unsupportedReason: "authentication",
          transport: { type: "http", url: "https://oauth.example.test/mcp", headers: {} },
        }),
      ]),
    );
    expect(result.groups.find((entry) => entry.providerId === "codex")?.servers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "codex-local",
          enabled: false,
          timeoutMs: 12_000,
          transport: expect.objectContaining({
            type: "stdio",
            command: "node",
            env: { MODE: "read" },
          }),
        }),
        expect.objectContaining({
          name: "codex_static",
          unsupportedReason: "sensitive-values",
          transport: expect.objectContaining({
            type: "http",
            headers: {},
          }),
        }),
        expect.objectContaining({
          name: "codex_env_auth",
          unsupportedReason: "authentication",
          transport: expect.objectContaining({ type: "http", headers: {} }),
        }),
      ]),
    );
    expect(result.groups.find((entry) => entry.providerId === "gemini")?.servers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "gemini_sse",
          timeoutMs: 9000,
          transport: expect.objectContaining({ type: "sse" }),
        }),
        expect.objectContaining({
          name: "adc_server",
          unsupportedReason: "authentication",
        }),
      ]),
    );
    expect(result.groups.find((entry) => entry.providerId === "opencode")?.servers).toEqual([
      expect.objectContaining({
        name: "user_tool",
        transport: { type: "stdio", command: "npx", args: ["-y", "user-tool"], env: {} },
      }),
    ]);
    expect(result.groups.find((entry) => entry.providerId === "cursor")?.servers).toEqual([
      expect.objectContaining({
        name: "cursor_remote",
        transport: expect.objectContaining({ headers: { "X-Mode": "read" } }),
      }),
    ]);
    expect(
      result.groups.find((entry) => entry.providerId === "cursor")?.servers[0],
    ).not.toHaveProperty("unsupportedReason");

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Bearer static");
    expect(serialized).not.toContain("MCP_TOKEN");

    await expect(service.discover({ sourceScope: "user" })).resolves.toEqual(result);
  });

  it("surfaces unsupported servers with reason precedence and strips every credential value", async () => {
    const home = makeTempDir();
    write(
      join(home, ".claude.json"),
      JSON.stringify({
        mcpServers: {
          all_reasons: {
            command: "node",
            args: ["server.mjs"],
            env: { TOKEN: "env-secret" },
            oauth: { clientSecret: "oauth-secret" },
            includeTools: ["read"],
          },
          auth_with_headers: {
            url: "https://auth.example.test/mcp",
            headers: { Authorization: "header-secret" },
            headersHelper: "resolve-headers",
          },
          sensitive_args: {
            command: "npx",
            args: [
              "-y",
              "safe-package",
              "--mode",
              "read",
              "--token",
              "arg-secret",
              "--api-key=inline-secret",
              "--key=key-secret",
              "--password",
              "password-secret",
            ],
          },
          sensitive_header_args: {
            command: "npx",
            args: [
              "safe-package",
              "--header",
              "Authorization: Bearer header-arg-secret",
              "--headers=X-Key: inline-header-secret",
              "-H",
              "Cookie: short-header-secret",
              "-HAuthorization: Bearer joined-header-secret",
              "--mode",
              "read",
            ],
          },
          sensitive_url: {
            url: "https://url-user:url-password@example.test/mcp?api_key=query-secret&team=alpha",
          },
          ordinary: {
            command: "npx",
            args: ["-y", "safe-package", "--mode", "read"],
          },
          exclude_filtered: { command: "node", excludeTools: [] },
          tools_filtered: { command: "node", tools: ["read"] },
        },
      }),
    );
    write(
      join(home, ".codex", "config.toml"),
      [
        "[mcp_servers.toml_tool_filter]",
        'command = "node"',
        'env = { TOKEN = "toml-env-secret" }',
        'enabled_tools = ["read"]',
        "",
        "[mcp_servers.toml_disabled_filter]",
        'command = "node"',
        'disabled_tools = ["delete"]',
        "",
        "[mcp_servers.toml_auth]",
        'url = "https://toml-auth.example.test/mcp"',
        'http_headers = { Authorization = "toml-header-secret" }',
        'bearer_token_env_var = "TOML_TOKEN"',
        "",
        "[mcp_servers.toml_env_headers_auth]",
        'url = "https://toml-env-auth.example.test/mcp"',
        'env_http_headers = { Authorization = "TOML_TOKEN" }',
        "",
        "[mcp_servers.toml_env_passthrough]",
        'command = "node"',
        'env_vars = ["PASSTHROUGH_SECRET"]',
      ].join("\n"),
    );

    const service = new ExternalMcpDiscoveryService({
      homeDirectory: () => home,
      env: {},
    });
    const result = await service.discover({ sourceScope: "user" });
    const servers = result.groups.flatMap((entry) => entry.servers);
    const byName = (name: string) => servers.find((server) => server.name === name);

    expect(byName("all_reasons")).toEqual(
      expect.objectContaining({
        unsupportedReason: "tool-restrictions",
        transport: expect.objectContaining({ env: {} }),
      }),
    );
    expect(byName("auth_with_headers")).toEqual(
      expect.objectContaining({
        unsupportedReason: "authentication",
        transport: expect.objectContaining({ headers: {} }),
      }),
    );
    expect(byName("sensitive_args")).toEqual(
      expect.objectContaining({
        unsupportedReason: "sensitive-values",
        transport: expect.objectContaining({
          args: ["-y", "safe-package", "--mode", "read"],
          env: {},
        }),
      }),
    );
    expect(byName("sensitive_header_args")).toEqual(
      expect.objectContaining({
        unsupportedReason: "sensitive-values",
        transport: expect.objectContaining({
          args: ["safe-package", "--mode", "read"],
          env: {},
        }),
      }),
    );
    expect(byName("sensitive_url")).toEqual(
      expect.objectContaining({
        unsupportedReason: "sensitive-values",
        transport: expect.objectContaining({
          url: "https://example.test/mcp?team=alpha",
          headers: {},
        }),
      }),
    );
    expect(byName("ordinary")).toEqual(expect.objectContaining({ name: "ordinary" }));
    expect(byName("ordinary")).not.toHaveProperty("unsupportedReason");
    expect(byName("exclude_filtered")).toEqual(
      expect.objectContaining({ unsupportedReason: "tool-restrictions" }),
    );
    expect(byName("tools_filtered")).toEqual(
      expect.objectContaining({ unsupportedReason: "tool-restrictions" }),
    );
    expect(byName("toml_tool_filter")).toEqual(
      expect.objectContaining({
        unsupportedReason: "tool-restrictions",
        transport: expect.objectContaining({ env: {} }),
      }),
    );
    expect(byName("toml_disabled_filter")).toEqual(
      expect.objectContaining({ unsupportedReason: "tool-restrictions" }),
    );
    expect(byName("toml_auth")).toEqual(
      expect.objectContaining({
        unsupportedReason: "authentication",
        transport: expect.objectContaining({ headers: {} }),
      }),
    );
    expect(byName("toml_env_headers_auth")).toEqual(
      expect.objectContaining({ unsupportedReason: "authentication" }),
    );
    expect(byName("toml_env_passthrough")).toEqual(
      expect.objectContaining({ unsupportedReason: "sensitive-values" }),
    );

    expect(
      servers.every((server) =>
        server.transport.type === "stdio"
          ? Object.keys(server.transport.env).length === 0
          : Object.keys(server.transport.headers).length === 0,
      ),
    ).toBe(true);
    const serialized = JSON.stringify(result);
    for (const secret of [
      "env-secret",
      "oauth-secret",
      "header-secret",
      "arg-secret",
      "inline-secret",
      "key-secret",
      "password-secret",
      "header-arg-secret",
      "inline-header-secret",
      "short-header-secret",
      "joined-header-secret",
      "url-user",
      "url-password",
      "query-secret",
      "toml-env-secret",
      "toml-header-secret",
      "TOML_TOKEN",
      "PASSTHROUGH_SECRET",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("discovers the remaining user provider configs and honors config home overrides", async () => {
    const home = makeTempDir();
    const copilotHome = makeTempDir();
    const grokHome = makeTempDir();
    write(
      join(copilotHome, "mcp-config.json"),
      JSON.stringify({
        mcpServers: {
          copilot_local: { type: "stdio", command: "copilot-server", args: ["--read-only"] },
        },
      }),
    );
    write(
      join(grokHome, "config.toml"),
      [
        "[mcp_servers.grok_remote]",
        'url = "https://grok.example.test/mcp"',
        'headers = { "X-Mode" = "read" }',
      ].join("\n"),
    );
    write(
      join(home, ".gemini", "config", "mcp_config.json"),
      JSON.stringify({
        mcpServers: {
          antigravity_remote: { serverUrl: "https://antigravity.example.test/mcp" },
        },
      }),
    );
    write(
      join(home, ".commandcode", "mcp.json"),
      JSON.stringify({
        mcpServers: {
          command_code_local: {
            transport: "stdio",
            command: "command-code-server",
            enabled: false,
          },
        },
      }),
    );

    const service = new ExternalMcpDiscoveryService({
      homeDirectory: () => home,
      env: { COPILOT_HOME: copilotHome, GROK_HOME: grokHome },
    });
    const result = await service.discover({ sourceScope: "user" });

    expect(
      result.groups.map(({ providerId, providerLabel }) => [providerId, providerLabel]),
    ).toEqual([
      ["copilot", "GitHub Copilot"],
      ["grok", "Grok"],
      ["antigravity", "Antigravity"],
      ["commandcode", "Command Code"],
    ]);
    expect(result.groups.map((entry) => entry.sourcePath)).toEqual([
      join(copilotHome, "mcp-config.json"),
      join(grokHome, "config.toml"),
      join(home, ".gemini", "config", "mcp_config.json"),
      join(home, ".commandcode", "mcp.json"),
    ]);
    expect(result.groups.flatMap((entry) => entry.servers)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "copilot_local" }),
        expect.objectContaining({
          name: "grok_remote",
          transport: expect.objectContaining({ headers: { "X-Mode": "read" } }),
        }),
        expect.objectContaining({
          name: "antigravity_remote",
          transport: expect.objectContaining({ type: "http" }),
        }),
        expect.objectContaining({ name: "command_code_local", enabled: false }),
      ]),
    );
  });

  it("honors GEMINI_CLI_HOME and gives OPENCODE_CONFIG_DIR precedence over XDG", async () => {
    const home = makeTempDir();
    const geminiCliHome = makeTempDir();
    const openCodeConfig = makeTempDir();
    const xdgConfig = makeTempDir();
    write(
      join(geminiCliHome, ".gemini", "settings.json"),
      JSON.stringify({ mcpServers: { gemini_override: { command: "gemini-server" } } }),
    );
    write(
      join(home, ".gemini", "settings.json"),
      JSON.stringify({ mcpServers: { wrong_gemini: { command: "wrong" } } }),
    );
    write(
      join(openCodeConfig, "opencode.json"),
      JSON.stringify({ mcp: { opencode_override: { type: "local", command: ["open-server"] } } }),
    );
    write(
      join(xdgConfig, "opencode", "opencode.json"),
      JSON.stringify({ mcp: { wrong_opencode: { type: "local", command: ["wrong"] } } }),
    );

    const service = new ExternalMcpDiscoveryService({
      homeDirectory: () => home,
      env: {
        GEMINI_CLI_HOME: geminiCliHome,
        OPENCODE_CONFIG_DIR: openCodeConfig,
        XDG_CONFIG_HOME: xdgConfig,
      },
    });
    const result = await service.discover({ sourceScope: "user" });

    expect(result.groups).toEqual([
      expect.objectContaining({
        providerId: "gemini",
        sourcePath: join(geminiCliHome, ".gemini", "settings.json"),
        servers: [expect.objectContaining({ name: "gemini_override" })],
      }),
      expect.objectContaining({
        providerId: "opencode",
        sourcePath: join(openCodeConfig, "opencode.json"),
        servers: [expect.objectContaining({ name: "opencode_override" })],
      }),
    ]);
  });

  it("discovers only the selected workspace files and Claude's matching private project entry", async () => {
    const home = makeTempDir();
    const project = makeTempDir();
    const location = nativeProjectLocation(project);

    write(
      join(project, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          shared_stdio: { command: "shared-server", args: [] },
          computer_use: { type: "http", url: "https://reserved.example.test/mcp" },
        },
      }),
    );
    write(
      join(project, ".codex", "config.toml"),
      '[mcp_servers.project_codex]\ncommand = "codex-project"\n',
    );
    write(
      join(project, ".gemini", "settings.json"),
      JSON.stringify({ mcpServers: { project_gemini: { httpUrl: "https://gemini.test/mcp" } } }),
    );
    write(
      join(project, "opencode.json"),
      JSON.stringify({ mcp: { project_open: { type: "local", command: ["open-server"] } } }),
    );
    write(
      join(project, ".cursor", "mcp.json"),
      JSON.stringify({ mcpServers: { project_cursor: { command: "cursor-server" } } }),
    );
    write(
      join(project, ".vscode", "mcp.json"),
      JSON.stringify({ servers: { project_vscode: { type: "stdio", command: "vscode-server" } } }),
    );
    write(
      join(home, ".claude.json"),
      JSON.stringify({
        projects: {
          [project]: { mcpServers: { claude_private: { command: "claude-local" } } },
          "C:\\another-project": { mcpServers: { wrong_project: { command: "wrong" } } },
        },
      }),
    );

    const service = new ExternalMcpDiscoveryService({
      homeDirectory: () => home,
      env: {},
    });
    const result = await service.discover({ sourceScope: "workspace", projectLocation: location });

    expect(result.groups.map((entry) => entry.providerId)).toEqual([
      "shared",
      "codex",
      "gemini",
      "opencode",
      "cursor",
      "vscode",
      "claude",
    ]);
    expect(result.groups.flatMap((entry) => entry.servers.map((server) => server.name))).toEqual(
      expect.arrayContaining([
        "shared_stdio",
        "computer_use",
        "project_codex",
        "project_gemini",
        "project_open",
        "project_cursor",
        "project_vscode",
        "claude_private",
      ]),
    );
    expect(
      result.groups.flatMap((entry) => entry.servers.map((server) => server.name)),
    ).not.toContain("wrong_project");
  });

  it("discovers provider-specific workspace configs without duplicating shared .mcp.json", async () => {
    const home = makeTempDir();
    const project = makeTempDir();
    const location = nativeProjectLocation(project);
    write(
      join(project, ".mcp.json"),
      JSON.stringify({ mcpServers: { shared_once: { command: "shared-server" } } }),
    );
    write(
      join(project, ".github", "mcp.json"),
      JSON.stringify({ mcpServers: { project_copilot: { command: "copilot-server" } } }),
    );
    write(
      join(project, ".grok", "config.toml"),
      '[mcp_servers.project_grok]\ncommand = "grok-server"\n',
    );
    write(
      join(project, ".agents", "mcp_config.json"),
      JSON.stringify({
        mcpServers: { project_antigravity: { serverUrl: "https://antigravity.test/mcp" } },
      }),
    );
    const commandCodeConfig = join(
      home,
      ".commandcode",
      "projects",
      sanitizeCommandCodeCwd(project),
      "mcp.json",
    );
    write(
      commandCodeConfig,
      JSON.stringify({ mcpServers: { project_command_code: { command: "command-code-server" } } }),
    );
    write(
      join(project, ".commandcode", "mcp.json"),
      JSON.stringify({ mcpServers: { wrong_command_code_scope: { command: "wrong-server" } } }),
    );

    const service = new ExternalMcpDiscoveryService({
      homeDirectory: () => home,
      env: {},
    });
    const result = await service.discover({ sourceScope: "workspace", projectLocation: location });

    expect(
      result.groups.map(({ providerId, providerLabel }) => [providerId, providerLabel]),
    ).toEqual([
      ["shared", ".mcp.json"],
      ["copilot", "GitHub Copilot"],
      ["grok", "Grok"],
      ["antigravity", "Antigravity"],
      ["commandcode", "Command Code"],
    ]);
    expect(result.groups.filter((entry) => entry.sourcePath.endsWith(".mcp.json"))).toHaveLength(1);
    expect(result.groups.find((entry) => entry.providerId === "commandcode")).toEqual(
      expect.objectContaining({
        sourcePath: commandCodeConfig,
        servers: [expect.objectContaining({ name: "project_command_code" })],
      }),
    );
    expect(
      result.groups.flatMap((entry) => entry.servers.map((server) => server.name)),
    ).not.toContain("wrong_command_code_scope");
  });

  it("keeps user discovery host-only, scans a distro home for wsl-user, and keeps workspace-private sources WSL-aware", async () => {
    const hostHome = makeTempDir();
    const linuxHomeFs = makeTempDir();
    const projectFs = makeTempDir();
    write(
      join(hostHome, ".codex", "config.toml"),
      '[mcp_servers.host_user]\ncommand = "host-node"\n',
    );
    write(join(linuxHomeFs, ".codex", "config.toml"), '[mcp_servers.wsl_user]\ncommand = "node"\n');
    write(
      join(
        linuxHomeFs,
        ".commandcode",
        "projects",
        sanitizeCommandCodeCwd("/home/demo/workspace"),
        "mcp.json",
      ),
      JSON.stringify({ mcpServers: { wsl_command_code: { command: "node" } } }),
    );
    write(
      join(projectFs, ".cursor", "mcp.json"),
      JSON.stringify({ mcpServers: { wsl_workspace: { command: "node" } } }),
    );
    const location: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/demo/workspace",
      uncPath: projectFs,
    };
    let wslHomeResolutions = 0;
    const service = new ExternalMcpDiscoveryService({
      env: {},
      homeDirectory: () => hostHome,
      resolveWslHome: async () => {
        wslHomeResolutions += 1;
        return "/home/demo";
      },
      wslFsPath: () => linuxHomeFs,
    });

    const user = await service.discover({ sourceScope: "user" });
    expect(user.groups).toEqual([
      expect.objectContaining({
        providerId: "codex",
        sourcePath: join(hostHome, ".codex", "config.toml"),
        servers: [expect.objectContaining({ name: "host_user" })],
      }),
    ]);
    expect(wslHomeResolutions).toBe(0);

    const wslUser = await service.discover({ sourceScope: "wsl-user", distro: "Ubuntu" });
    expect(wslUser.groups).toEqual([
      expect.objectContaining({
        providerId: "codex",
        sourcePath: "/home/demo/.codex/config.toml",
        servers: [expect.objectContaining({ name: "wsl_user" })],
      }),
    ]);
    expect(wslHomeResolutions).toBe(1);

    const workspace = await service.discover({
      sourceScope: "workspace",
      projectLocation: location,
    });
    expect(workspace.groups).toEqual([
      expect.objectContaining({
        providerId: "cursor",
        sourcePath: "/home/demo/workspace/.cursor/mcp.json",
        servers: [expect.objectContaining({ name: "wsl_workspace" })],
      }),
      expect.objectContaining({
        providerId: "commandcode",
        sourcePath: "/home/demo/.commandcode/projects/home-demo-workspace/mcp.json",
        servers: [expect.objectContaining({ name: "wsl_command_code" })],
      }),
    ]);
    expect(wslHomeResolutions).toBe(2);
  });

  it("requires a selected project for workspace discovery", async () => {
    const service = new ExternalMcpDiscoveryService({ env: {} });
    await expect(service.discover({ sourceScope: "workspace" } as never)).rejects.toThrow(
      "Invalid input",
    );
  });
});
