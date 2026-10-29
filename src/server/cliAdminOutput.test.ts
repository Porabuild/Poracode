import { describe, expect, it } from "vitest";
import { renderAdminResult } from "./cliAdminOutput";
import { cliCommandHelp } from "./cliHelp";
import { mcpServerSchema } from "@/shared/contracts/mcpServer";

describe("human CLI administration output", () => {
  it("reports metadata changes with escaped titles and distinguishes retirement from unchanged runtime", () => {
    const session = {
      id: "thread",
      projectId: "project",
      title: "New\u001btitle",
      agentKind: "fixture",
      presentationMode: "gui",
      storedStatus: "idle",
      archived: true,
      done: false,
      createdAt: "before",
      updatedAt: "after",
    };
    const result = {
      formatVersion: 1,
      scope: "persisted-profile",
      change: { kind: "archive" },
      runtime: "retired",
      session,
    };
    const text = renderAdminResult(
      { action: "sessions-update", threadId: "thread", change: { kind: "archive" } },
      result,
    );
    expect(text).toContain("Runtime retirement confirmed");
    expect(text).toContain("retention settings still apply");
    expect(text).not.toContain("\u001b");
    expect(cliCommandHelp("sessions", "reopen")).toContain("without changing archive visibility");
    expect(cliCommandHelp("sessions", "archive")).toContain("local-admin v18");
  });
  it("labels cached provider observations and host profiles without claiming a live check", () => {
    const result = {
      formatVersion: 1,
      environment: { kind: "wsl", distro: "Ubuntu" },
      observation: { source: "saved-cache", state: "missing", version: null },
      configurationScope: "host",
      providers: [],
      profiles: [],
    };
    const text = renderAdminResult(
      { action: "providers-inventory", refresh: false, wslDistro: "Ubuntu" },
      result,
    );
    expect(text).toContain("observations: missing");
    expect(text).toContain("No discovery was started");
    expect(text).toContain("Saved profiles apply to this host");
    expect(text).toContain("--refresh");
    expect(text).toContain("same --base-dir and --wsl selection");
    const fresh = renderAdminResult(
      { action: "providers-inventory", refresh: true },
      { ...result, observation: { source: "refresh" } },
    );
    expect(fresh).toContain("Refreshed provider observations");
    expect(fresh).not.toContain("No discovery was started");
    const help = cliCommandHelp("providers", "list")!;
    expect(help).toContain("local-admin v17");
    expect(help).toContain("formatVersion 1");
    expect(help).toContain("Older owners refuse");
  });

  it("explains saved session status, paging and confirmed runtime closure with escaped text", () => {
    const session = {
      id: "thread\nfixture",
      projectId: "project",
      title: "Fixture\u001btitle",
      agentKind: "fixture",
      presentationMode: "terminal",
      storedStatus: "working",
      archived: true,
      done: false,
      createdAt: "2026-10-20T00:00:00Z",
      updatedAt: "2026-10-20T00:00:00Z",
    };
    const text = renderAdminResult(
      { action: "sessions-list", limit: 50 },
      {
        formatVersion: 1,
        scope: "persisted-profile",
        sessions: [session],
        nextCursor: "opaque-next",
      },
    );
    expect(text).toContain("not a live runtime probe");
    expect(text).toContain("opaque-next");
    expect(text).toContain("thread\\u000afixture");
    expect(text).not.toContain("\u001b");
    expect(
      renderAdminResult(
        { action: "sessions-stop", threadId: session.id },
        { formatVersion: 1, scope: "persisted-profile", threadId: session.id, retired: true },
      ),
    ).toContain("history was preserved");
    expect(cliCommandHelp("sessions", "stop")).toContain("scripts and --json require --yes");
    expect(cliCommandHelp("sessions", "list")).toContain("Default limit: 50");
  });
  it("describes full MCP definitions, explicit replacement and separate storage lifecycles", () => {
    const server = mcpServerSchema.parse({
      id: "exact\nid",
      name: "fixture",
      transport: { type: "stdio", command: "synthetic-private-command" },
    });
    for (const action of ["mcp-add", "mcp-configure-checked"] as const) {
      const change = action === "mcp-add" ? "add" : "configure";
      const command =
        action === "mcp-add"
          ? { action, server }
          : { action, server, expectedServerRevision: "ab".repeat(32) };
      const text = renderAdminResult(command, {
        formatVersion: 2,
        scope: "saved-user",
        change,
        serverId: server.id,
      });
      expect(text).toContain("exact\\u000aid");
      expect(text).not.toContain("synthetic-private-command");
      expect(text).not.toContain("exact\nid");
    }
    for (const action of ["add", "configure"]) {
      const help = cliCommandHelp("mcp", action)!;
      for (const expected of [
        "local-admin v7",
        "formatVersion 2",
        "65536 bytes",
        "Redaction markers",
        "sealed provider profiles",
        "--config-stdin",
      ])
        expect(help).toContain(expected);
    }
    expect(cliCommandHelp("mcp", "configure")).toContain(
      "Omitted optional values take canonical defaults",
    );
    expect(cliCommandHelp("mcp", "configure")).toContain("scripts and --json require --yes");
  });
  it("reports saved MCP changes with escaped IDs and explicit configuration/process/credential scope", () => {
    const text = renderAdminResult(
      { action: "mcp-set-enabled", serverId: "exact\nid", enabled: false },
      {
        formatVersion: 1,
        scope: "saved-user",
        change: "set-enabled",
        serverId: "exact\nid",
        enabled: false,
      },
    );
    expect(text).toContain("exact\\u000aid: disabled");
    expect(text).toContain("when they next resolve it");
    expect(text).toContain("OAuth credentials have separate lifecycles");
    expect(text).not.toContain("exact\nid");
    const removed = renderAdminResult(
      { action: "mcp-remove", serverId: "exact-id" },
      { formatVersion: 1, scope: "saved-user", change: "remove", serverId: "exact-id" },
    );
    expect(removed).toContain("Removed saved user MCP configuration: exact-id");
    for (const action of ["enable", "disable", "remove"]) {
      expect(cliCommandHelp("mcp", action)).toContain("local-admin v6");
      expect(cliCommandHelp("mcp", action)).toContain("exact ID");
      expect(cliCommandHelp("mcp", action)).toContain("OAuth credentials have separate lifecycles");
    }
    expect(cliCommandHelp("mcp", "remove")).toContain("--json require --yes");
  });

  it("distinguishes saved-profile driver definitions from installed providers and authenticated accounts", () => {
    const text = renderAdminResult(
      { action: "providers-drivers" },
      {
        formatVersion: 1,
        scope: "saved-profile-drivers",
        drivers: [
          { id: "codex", credentialEnvironmentName: null },
          { id: "cursor", credentialEnvironmentName: "CURSOR_API_KEY" },
        ],
      },
    );
    for (const expected of [
      "DRIVER ID",
      "codex",
      "not declared",
      "CURSOR_API_KEY",
      "not installation or account status",
      "--config-file",
    ])
      expect(text).toContain(expected);
    expect(cliCommandHelp("providers", "drivers")).toContain("local-admin v5");
    expect(cliCommandHelp("providers", "drivers")).toContain("formatVersion 1");
    expect(cliCommandHelp("providers", "add")).toContain("not a reservation");
    expect(cliCommandHelp("providers", "add")).toContain("fresh snapshot");
  });

  it("labels plugin discovery policy separately from runtime or authentication and escapes terminal metadata", () => {
    const text = renderAdminResult(
      { action: "plugins-list" },
      {
        formatVersion: 1,
        scope: "global",
        plugins: [
          {
            name: "fixture\u001b[2J",
            version: "1.0.0",
            source: "user",
            installed: true,
            enabled: false,
            hostSupported: true,
            skillCount: 2,
            mcpServerNames: ["fixture-server"],
            errorCount: 0,
            warningCount: 1,
          },
        ],
      },
    );
    expect(text).toContain("fixture\\u001b[2J");
    expect(text).not.toContain("\u001b");
    expect(text).toContain("saved policy");
    expect(text).toContain("not runtime capability, connection health or authentication");
    expect(text).toContain("warnings: 1");
  });

  it("shows MCP exact IDs and escaped names without suggesting configuration metadata is connection health", () => {
    const server = {
      id: "full-server-id",
      name: "fixture",
      enabled: false,
      transport: "http",
      timeoutMs: 45_000,
      disabledToolCount: 1,
    };
    const listed = renderAdminResult(
      { action: "mcp-list" },
      { formatVersion: 1, scope: "saved-user", servers: [server] },
    );
    expect(listed).toContain("full-server-id");
    expect(listed).toContain("does not probe");
    const inspected = renderAdminResult(
      { action: "mcp-inspect", serverId: "full-server-id" },
      {
        formatVersion: 1,
        scope: "saved-user",
        server: {
          ...server,
          environmentNames: [],
          headerNames: ["Authorization\u009b2J"],
          disabledTools: ["disabled\u001btool"],
        },
      },
    );
    expect(inspected).toContain("Authorization\\u009b2J");
    expect(inspected).not.toContain("\u009b");
    expect(inspected).not.toContain("\u001b");
    expect(inspected).toContain("values are omitted");
    expect(inspected).toContain("no probe or authentication");
  });

  it("shows provider/runtime/account and saved-profile summaries without environment values", () => {
    const text = renderAdminResult(
      { action: "providers-list", wslDistro: "Ubuntu" },
      {
        providers: [
          {
            kind: "fixture",
            label: "Fixture\u001b[2J",
            installed: true,
            version: "1.2.3",
            authState: "authenticated",
            envDistro: "Ubuntu",
            runtimes: ["cli", "sdk"],
            providerMetadata: { authenticatedAs: "work@example.test" },
          },
        ],
        profiles: [
          {
            id: "work",
            driver: "fixture",
            displayName: "Work",
            enabled: true,
            environmentNames: ["FIXTURE_KEY"],
            environment: { FIXTURE_KEY: "synthetic-never-print" },
          },
        ],
      },
    );
    for (const expected of [
      "Providers",
      "Saved profiles",
      "WSL:Ubuntu",
      "1.2.3",
      "work@example.test",
      "cli, sdk",
      "FIXTURE_KEY",
    ])
      expect(text).toContain(expected);
    expect(text).not.toContain("synthetic-never-print");
    expect(text).not.toContain("\u001b");
    expect(text).toContain("Fixture\\u001b[2J");
  });

  it("keeps complete credential IDs and the exact WSL target in account output", () => {
    const id = `credential-${"x".repeat(90)}`;
    const text = renderAdminResult(
      { action: "auth-accounts", agentKind: "fixture", wslDistro: "Ubuntu" },
      {
        agentKind: "fixture",
        environment: { kind: "wsl", distro: "Ubuntu" },
        providers: [{ id, label: "Work", detail: "Native provider account" }],
      },
    );
    expect(text).toContain(id);
    expect(text).toContain("Environment: WSL:Ubuntu");
    expect(text).toContain("--credential <id>");
  });

  it("shows IDs, connection state, expiry and scopes for precise client revocation", () => {
    const text = renderAdminResult(
      { action: "clients-list" },
      {
        clients: [
          {
            id: "exact-session",
            scopes: ["session:read"],
            issuedAt: "2026-10-20T00:00:00Z",
            expiresAt: "2026-10-21T00:00:00Z",
            connected: false,
            client: { label: "Phone\nmisleading row" },
          },
        ],
      },
    );
    expect(text).toContain("exact-session");
    expect(text).toContain("Phone\\u000amisleading row");
    expect(text).toContain("2026-10-21T00:00:00Z");
    expect(text).toContain("session:read");
    expect(text).toContain("clients revoke <session-id>");
  });

  it("does not print pairing credentials from an inventory result", () => {
    const text = renderAdminResult(
      { action: "pairings-list" },
      {
        pairings: [
          {
            id: "exact-grant",
            label: "Phone",
            scopes: ["session:read"],
            expiresAt: "2026-10-20T00:10:00Z",
            credential: "synthetic-never-print",
            pairingUrl: "https://example.test/#synthetic-secret",
          },
        ],
      },
    );
    expect(text).toContain("exact-grant");
    expect(text).toContain("pairings revoke <pairing-id>");
    expect(text).not.toContain("synthetic-");
  });

  it("explains empty results and environment methods", () => {
    expect(renderAdminResult({ action: "pairings-list" }, { pairings: [] })).toContain("None.");
    const text = renderAdminResult(
      { action: "auth-methods", agentKind: "fixture" },
      {
        methods: [
          {
            id: "key",
            name: "API key",
            type: "env_var",
            variables: [{ name: "FIXTURE_KEY", value: "synthetic-never-print" }],
          },
        ],
        terminalLogin: false,
        logout: false,
      },
    );
    expect(text).toContain("FIXTURE_KEY");
    expect(text).toContain("--prompt-env NAME");
    expect(text).not.toContain("synthetic-never-print");
  });

  it("offers focused help with the actual read-only, secret-entry and identity limits", () => {
    expect(cliCommandHelp("configure")).toContain("--effective");
    expect(cliCommandHelp("configure")).toContain("--shutdown-drain-deadline-ms");
    expect(cliCommandHelp("configure")).not.toContain("auth logout");
    expect(cliCommandHelp("providers")).toContain("--prompt-env NAME");
    expect(cliCommandHelp("auth")).toContain("runtime variants refuse");
    expect(cliCommandHelp("constructor")).toBeUndefined();
  });

  it("keeps login flags separate from inspection and credential removal", () => {
    expect(cliCommandHelp("auth", "login")).toContain("--method ID");
    expect(cliCommandHelp("auth", "login")).not.toContain("--credential");
    expect(cliCommandHelp("auth", "methods")).not.toContain("--method ID");
    expect(cliCommandHelp("auth", "logout")).toContain("--credential ID");
    expect(cliCommandHelp("auth", "logout")).not.toContain("--method");
    expect(cliCommandHelp("auth", "accounts")).toContain("Runtime-specific inventories refuse");
  });

  it("describes profile-key refusal, exact client revocation and pairing issuance boundaries", () => {
    const profile = cliCommandHelp("providers", "configure")!;
    expect(profile).toContain("local-admin v3");
    expect(profile).toContain("nothing is saved");
    expect(profile).toContain("--env-stdin");
    expect(profile).not.toContain("providers install");
    expect(cliCommandHelp("clients", "remove")).toContain("does not unlink");
    expect(cliCommandHelp("pairings", "revoke")).toContain("clients revoke");
    expect(cliCommandHelp("pairings", "create")).toContain(
      "--qr and --json are mutually exclusive",
    );
    expect(cliCommandHelp("plugins", "refresh")).toContain("not a catalog source");
    expect(cliCommandHelp("mcp", "inspect")).toContain("Missing/duplicate IDs refuse");
    expect(cliCommandHelp("mcp")).toContain("formatVersion 1");
  });

  it.each(["constructor", "unknown\u001b[2J"])(
    "refuses unknown subcommands without echoing terminal controls (%s)",
    (action) => {
      expect(() => cliCommandHelp("providers", action)).toThrow("Run poracode providers --help");
    },
  );
});
