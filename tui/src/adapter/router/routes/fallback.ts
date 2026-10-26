import { json } from "../helpers";
import type {
  CommandListOutput,
  ConfigGetOutput,
  FormListOutput,
  MigrationV1StatusOutput,
} from "@opencode/client";
import type { RouteArgs } from "../context";

/** Empty-catalog fallbacks, config/form/migration stubs. Chained last. */
export async function handleFallbackRoutes({
  ctx,
  url,
  method,
  path,
}: RouteArgs): Promise<Response | undefined> {
  const { input, sessions, requestLocation } = ctx;

  if (path === "/api/command" && method === "GET") {
    const providerID =
      ctx.activeProviderID ??
      [...sessions.values()].reverse().find((session) => session.providerID)?.providerID ??
      ctx.defaultModel?.providerID;
    if (!providerID)
      return json({
        location: requestLocation(url),
        data: [],
      } satisfies CommandListOutput);
    try {
      const commands = await input.client.agentSlashCommands(providerID);
      const data: CommandListOutput["data"] = commands.commands.map((command) => ({
        name: command.id,
        ...(command.description ? { description: command.description } : {}),
      }));
      return json({ location: requestLocation(url), data });
    } catch {
      return json({
        location: requestLocation(url),
        data: [],
      } satisfies CommandListOutput);
    }
  }
  if (/\/api\/(file\/find|vcs|worktree|command|skill|mcp|reference|shell)/u.test(path)) {
    return json({ location: requestLocation(url), data: [] });
  }
  if (path === "/api/config" && method === "GET") {
    const output: ConfigGetOutput = [];
    return json(output);
  }
  if (path === "/api/form" && method === "GET") {
    const output: FormListOutput = {
      location: requestLocation(url),
      data: [],
    };
    return json(output);
  }
  if (path === "/api/experimental/migration/v1" && method === "GET") {
    const output: MigrationV1StatusOutput = { status: "completed" };
    return json(output);
  }
  return undefined;
}
