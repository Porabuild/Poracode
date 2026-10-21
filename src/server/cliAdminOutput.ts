import { z } from "zod";
import { agentConnectedProviderSchema } from "@/shared/contracts/agent";
import {
  hostAdminMcpInspectionSchema,
  hostAdminMcpInventorySchema,
  hostAdminPluginInventorySchema,
  hostAdminProfileDriversSchema,
  hostAdminMcpChangeResultSchema,
  hostAdminMcpDefinitionResultSchema,
  hostAdminSessionInspectionSchema,
  hostAdminSessionListSchema,
  hostAdminSessionStopSchema,
  hostAdminSessionUpdateSchema,
  type HostAdminCommand,
} from "@/shared/hostAdminProtocol";
import { remoteAccessSessionSchema } from "@/shared/remote/protocol/core";
import { terminalText } from "./cliPrompts";
import { hostProviderInventorySchema } from "@/shared/contracts/hostProviderInventory";
import {
  hostProjectListSchema,
  hostProjectInspectionSchema,
  hostProjectAdditionSchema,
} from "@/shared/contracts/hostProjects";

function table(headers: string[], rows: string[][]): string {
  if (!rows.length) return "None.\n";
  const cells = [headers, ...rows].map((row) => row.map(terminalText));
  const widths = headers.map((_, index) =>
    Math.min(48, Math.max(...cells.map((row) => row[index]!.length))),
  );
  return (
    cells
      .map((row) =>
        row
          .map((cell, index) => cell.padEnd(widths[index]!))
          .join("  ")
          .trimEnd(),
      )
      .join("\n") + "\n"
  );
}

export function renderAdminResult(command: HostAdminCommand, result: unknown): string {
  switch (command.action) {
    case "projects-list": {
      const data = hostProjectListSchema.parse(result);
      return (
        table(
          ["PROJECT ID", "NAME", "ENVIRONMENT", "DIRECTORY", "DISABLED"],
          data.projects.map((project) => [
            project.id,
            project.name,
            project.location.kind === "wsl"
              ? `WSL: ${project.location.distro}`
              : project.location.kind,
            project.location.kind === "wsl" ? project.location.linuxPath : project.location.path,
            String(project.disabled),
          ]),
        ) +
        (data.nextCursor
          ? `Next page: projects list --limit ${command.limit} --cursor ${terminalText(data.nextCursor)} (same --base-dir).\n`
          : "")
      );
    }
    case "projects-inspect":
    case "projects-add": {
      const data =
        command.action === "projects-add"
          ? hostProjectAdditionSchema.parse(result)
          : hostProjectInspectionSchema.parse(result);
      const project = data.project;
      return `${command.action === "projects-add" ? ("created" in data && data.created ? "Registered" : "Existing") : "Project"}: ${terminalText(project.name)}\nID: ${terminalText(project.id)}\nDirectory: ${terminalText(project.location.kind === "wsl" ? project.location.uncPath : project.location.path)}\n`;
    }
    case "sessions-list": {
      const data = hostAdminSessionListSchema.parse(result);
      return (
        table(
          ["THREAD ID", "PROJECT", "TITLE", "PROVIDER", "MODE", "SAVED STATUS", "ARCHIVED", "DONE"],
          data.sessions.map((session) => [
            session.id,
            session.projectId,
            session.title,
            session.agentKind,
            session.presentationMode,
            session.storedStatus,
            session.archived ? "yes" : "no",
            session.done ? "yes" : "no",
          ]),
        ) +
        "Persisted thread metadata for this profile; saved status is not a live runtime probe. Archived/done threads are included.\n" +
        (data.nextCursor
          ? `Next cursor: ${terminalText(data.nextCursor)} (pass --cursor with the same --project filter).\n`
          : "")
      );
    }
    case "sessions-inspect": {
      const { session } = hostAdminSessionInspectionSchema.parse(result);
      return (
        Object.entries(session)
          .map(([name, value]) => `${name}: ${terminalText(String(value))}`)
          .join("\n") +
        "\nPersisted metadata only; saved status is not a live runtime probe. Configuration, credentials and transcript are omitted.\n"
      );
    }
    case "sessions-stop": {
      const stopped = hostAdminSessionStopSchema.parse(result);
      return `Session runtime retired: ${terminalText(stopped.threadId)}. Persisted history was preserved.\n`;
    }
    case "sessions-update": {
      const updated = hostAdminSessionUpdateSchema.parse(result);
      return (
        `Session ${terminalText(updated.session.id)}: ${updated.change.kind}.\nTitle: ${terminalText(updated.session.title)}\nArchived: ${updated.session.archived ? "yes" : "no"}; done: ${updated.session.done ? "yes" : "no"}.\n` +
        (updated.runtime === "retired" ? "Runtime retirement confirmed. " : "Runtime unchanged. ") +
        "No history was deleted by this command; existing retention settings still apply.\n"
      );
    }
    case "mcp-add":
    case "mcp-configure-checked": {
      const change = hostAdminMcpDefinitionResultSchema.parse(result);
      return (
        `${change.change === "add" ? "Added" : "Replaced"} saved user MCP definition: ${terminalText(change.serverId)}.\n` +
        "Providers apply saved configuration when they next resolve it. OAuth credentials, native-provider copies and running sessions have separate lifecycles.\n"
      );
    }
    case "mcp-set-enabled":
    case "mcp-remove": {
      const change = hostAdminMcpChangeResultSchema.parse(result);
      return (
        (change.change === "remove"
          ? `Removed saved user MCP configuration: ${terminalText(change.serverId)}.\n`
          : `Saved user MCP server ${terminalText(change.serverId)}: ${change.enabled ? "enabled" : "disabled"}.\n`) +
        "Providers apply saved configuration when they next resolve it. Running sessions, native-provider copies and OAuth credentials have separate lifecycles.\n"
      );
    }
    case "providers-drivers": {
      const data = hostAdminProfileDriversSchema.parse(result);
      return (
        table(
          ["DRIVER ID", "DECLARED KEY VARIABLE"],
          data.drivers.map((driver) => [
            driver.id,
            driver.credentialEnvironmentName ?? "not declared",
          ]),
        ) +
        "Supported profile definitions from this owner, not installation or account status. Driver configuration uses providers add --config-file; secret values use the sealed environment path.\n"
      );
    }
    case "plugins-list":
    case "plugins-refresh": {
      const data = hostAdminPluginInventorySchema.parse(result);
      return (
        table(
          [
            "NAME",
            "VERSION",
            "SOURCE",
            "INSTALLED",
            "ENABLED",
            "HOST OS",
            "SKILLS",
            "MCP SERVERS",
            "DIAGNOSTICS",
          ],
          data.plugins.map((plugin) => [
            plugin.name,
            plugin.version ?? "unknown",
            plugin.source,
            plugin.installed ? "yes" : "no",
            plugin.enabled ? "yes" : "no",
            plugin.hostSupported ? "supported" : "unsupported",
            String(plugin.skillCount),
            plugin.mcpServerNames.join(", ") || "—",
            `errors: ${plugin.errorCount}; warnings: ${plugin.warningCount}`,
          ]),
        ) +
        "Global bundled/user roots only. Enabled is saved policy; HOST OS is declared OS compatibility. This is not runtime capability, connection health or authentication status.\n"
      );
    }
    case "mcp-list": {
      const data = hostAdminMcpInventorySchema.parse(result);
      return (
        table(
          ["SERVER ID", "NAME", "ENABLED", "TRANSPORT", "TIMEOUT MS", "DISABLED TOOLS"],
          data.servers.map((server) => [
            server.id,
            server.name,
            server.enabled ? "yes" : "no",
            server.transport,
            String(server.timeoutMs),
            String(server.disabledToolCount),
          ]),
        ) +
        "Saved user configuration only; plugin/built-in MCPs are separate. This does not probe a server or report authentication. Inspect: poracode mcp inspect <server-id>.\n"
      );
    }
    case "mcp-inspect": {
      const { server } = hostAdminMcpInspectionSchema.parse(result);
      return (
        table(
          ["SERVER ID", "NAME", "ENABLED", "TRANSPORT", "TIMEOUT MS"],
          [
            [
              server.id,
              server.name,
              server.enabled ? "yes" : "no",
              server.transport,
              String(server.timeoutMs),
            ],
          ],
        ) +
        `Environment names: ${server.environmentNames.map(terminalText).join(", ") || "—"}\n` +
        `Header names: ${server.headerNames.map(terminalText).join(", ") || "—"}\n` +
        `Disabled tools: ${server.disabledTools.map(terminalText).join(", ") || "—"}\n` +
        "Configuration metadata only. Commands, arguments, paths, URLs and environment/header values are omitted; no probe or authentication was attempted.\n"
      );
    }
    case "providers-inventory": {
      const data = hostProviderInventorySchema.parse(result);
      const observation = data.observation;
      const summary =
        observation.source === "refresh"
          ? "Refreshed provider observations for the selected environment.\n"
          : observation.state === "available"
            ? "Saved provider observations; installation and authentication may have changed. No discovery was started.\n"
            : `Saved provider observations: ${observation.state}${observation.version === null ? "" : ` (cache v${observation.version})`}. No discovery was started.\n`;
      return (
        summary +
        renderAdminResult({ action: "providers-list" }, data) +
        "Saved profiles apply to this host, independently of the selected environment.\n" +
        (observation.source === "saved-cache"
          ? "Discover current status: poracode providers list --refresh (repeat the same --base-dir and --wsl selection). Incompatible caches require a compatible host.\n"
          : "")
      );
    }
    case "providers-list": {
      const data = z
        .object({
          providers: z.array(
            z.object({
              kind: z.string(),
              label: z.string(),
              installed: z.boolean(),
              version: z.string().nullable().optional(),
              authState: z.string(),
              envDistro: z.string().optional(),
              runtimes: z.array(z.string()),
              providerMetadata: z.object({ authenticatedAs: z.string().optional() }).optional(),
            }),
          ),
          profiles: z.array(
            z.object({
              id: z.string(),
              driver: z.string(),
              displayName: z.string(),
              enabled: z.boolean(),
              environmentNames: z.array(z.string()),
            }),
          ),
        })
        .parse(result);
      return (
        "Providers\n" +
        table(
          ["ID", "NAME", "ENVIRONMENT", "INSTALLED", "AUTH", "ACCOUNT", "RUNTIMES"],
          data.providers.map((provider) => [
            provider.kind,
            provider.label,
            provider.envDistro ? `WSL:${provider.envDistro}` : "native",
            provider.installed ? (provider.version ?? "yes") : "no",
            provider.authState,
            provider.providerMetadata?.authenticatedAs ?? "—",
            provider.runtimes.join(", ") || "default",
          ]),
        ) +
        "\nSaved profiles\n" +
        table(
          ["ID", "DRIVER", "NAME", "ENABLED", "ENVIRONMENT NAMES"],
          data.profiles.map((entry) => [
            entry.id,
            entry.driver,
            entry.displayName,
            entry.enabled ? "yes" : "no",
            entry.environmentNames.join(", ") || "—",
          ]),
        ) +
        "\nUse auth methods <provider> for login choices, or providers catalog for installable providers.\n"
      );
    }
    case "providers-catalog": {
      const data = z
        .object({
          agents: z.array(z.object({ id: z.string(), name: z.string(), description: z.string() })),
        })
        .parse(result);
      return (
        table(
          ["ID", "NAME", "DESCRIPTION"],
          data.agents.map((entry) => [entry.id, entry.name, entry.description]),
        ) + "Install: poracode providers install <id> (use --wsl DISTRO to select WSL).\n"
      );
    }
    case "auth-methods": {
      const data = z
        .object({
          methods: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              type: z.string(),
              variables: z.array(z.object({ name: z.string() })).optional(),
            }),
          ),
          terminalLogin: z.boolean(),
          logout: z.boolean(),
        })
        .parse(result);
      return (
        table(
          ["METHOD", "NAME", "TYPE", "ENVIRONMENT NAMES"],
          data.methods.map((method) => [
            method.id,
            method.name,
            method.type,
            method.variables?.map(({ name }) => name).join(", ") || "—",
          ]),
        ) +
        `Terminal login: ${data.terminalLogin ? "available" : "unavailable"}\nProvider logout: ${data.logout ? "supported" : "use an explicitly supported account control"}\n` +
        "Use auth login <provider> --method <id>; environment values use providers configure <profile-id> --prompt-env NAME.\n"
      );
    }
    case "auth-accounts": {
      const data = z
        .object({
          agentKind: z.string(),
          environment: z.object({ kind: z.string(), distro: z.string().optional() }),
          providers: z.array(agentConnectedProviderSchema),
        })
        .parse(result);
      return (
        `Provider: ${terminalText(data.agentKind)}\nEnvironment: ${terminalText(data.environment.distro ? `WSL:${data.environment.distro}` : data.environment.kind)}\n` +
        table(
          ["CREDENTIAL ID", "ACCOUNT", "DETAIL"],
          data.providers.map((entry) => [
            entry.id ?? "unavailable",
            entry.label,
            entry.detail ?? "—",
          ]),
        ) +
        "Use auth logout <provider> --credential <id> with the same environment to remove a supported saved credential.\n"
      );
    }
    case "clients-list": {
      const data = z.object({ clients: z.array(remoteAccessSessionSchema) }).parse(result);
      return (
        table(
          ["SESSION ID", "CLIENT", "CONNECTED", "EXPIRES", "SCOPES"],
          data.clients.map((client) => [
            client.id,
            client.client?.label ?? "unlabelled",
            client.connected === undefined ? "unknown" : client.connected ? "yes" : "no",
            client.expiresAt,
            client.scopes.join(", "),
          ]),
        ) + "Revoke: poracode clients revoke <session-id> (use the same --base-dir).\n"
      );
    }
    case "pairings-list": {
      const data = z
        .object({
          pairings: z.array(
            z.object({
              id: z.string(),
              label: z.string().optional(),
              expiresAt: z.string(),
              scopes: z.array(z.string()),
            }),
          ),
        })
        .parse(result);
      return (
        table(
          ["PAIRING ID", "LABEL", "EXPIRES", "SCOPES"],
          data.pairings.map((grant) => [
            grant.id,
            grant.label ?? "unlabelled",
            grant.expiresAt,
            grant.scopes.join(", "),
          ]),
        ) + "Revoke: poracode pairings revoke <pairing-id> (use the same --base-dir).\n"
      );
    }
    default:
      return `${JSON.stringify(result, null, 2)}\n`;
  }
}
