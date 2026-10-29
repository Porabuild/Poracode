import { createReadStream } from "node:fs";
import { parseArgs } from "node:util";
import { z } from "zod";
import { acpGenericKind } from "@/shared/contracts/agentInstance";
import {
  CUSTOM_ACP_AGENTS_VERSION,
  customAcpAgentCommandSchema,
  customAcpAgentResultSchema,
  customAcpAgentIdSchema,
  customAcpDefinitionSchema,
  customAcpEnvironmentSchema,
  type CustomAcpAgentCommand,
  type CustomAcpAgentResult,
} from "@/shared/contracts/customAcpAgents";
import type { HostAdminCommand } from "@/shared/hostAdminProtocol";
import { readAdminJsonInput, readEnvironmentStdin } from "./cliAdminInput";
import { validateProfileEnvironmentNames } from "./cliProfileSetup";
import { promptCli, terminalText } from "./cliPrompts";

export function parseCustomProviderCli(args: readonly string[]) {
  if (args[0] !== "providers" || args[1] !== "custom") return;
  const action = z.enum(["list", "inspect", "add", "configure", "remove"]).parse(args[2]);
  const edit = action === "add" || action === "configure";
  const { values, positionals } = parseArgs({
    args: args.slice(3),
    strict: true,
    allowPositionals: true,
    options: {
      json: { type: "boolean" },
      ...(action === "remove" ? { yes: { type: "boolean" as const } } : {}),
      ...(edit
        ? {
            name: { type: "string" as const },
            "config-file": { type: "string" as const },
            "env-file": { type: "string" as const },
            "env-stdin": { type: "boolean" as const },
            "prompt-env": { type: "string" as const, multiple: true },
            ...(action === "configure"
              ? { enable: { type: "boolean" as const }, disable: { type: "boolean" as const } }
              : {}),
          }
        : {}),
    },
  });
  if (positionals.length !== (action === "list" ? 0 : 1))
    throw new Error(
      "Use providers custom list, or inspect|add|configure|remove ID. Run providers custom --help.",
    );
  const id = action === "list" ? undefined : customAcpAgentIdSchema.parse(positionals[0]);
  if (action === "add" && !values["config-file"])
    throw new Error(
      "Custom ACP registration requires --config-file JSON. Run providers custom --help.",
    );
  if (values.enable && values.disable) throw new Error("Choose --enable or --disable.");
  if (
    [
      values["env-file"] !== undefined,
      values["env-stdin"] === true,
      values["prompt-env"] !== undefined,
    ].filter(Boolean).length > 1
  )
    throw new Error("Choose --env-file, --env-stdin or --prompt-env.");
  const names =
    values["prompt-env"] !== undefined
      ? validateProfileEnvironmentNames(values["prompt-env"])
      : undefined;
  if (
    action === "configure" &&
    !(
      ["name", "config-file", "env-file", "env-stdin", "prompt-env", "enable", "disable"] as const
    ).some((key) => values[key] !== undefined)
  )
    throw new Error("Specify the configuration change explicitly. Run providers custom --help.");
  return { action, id, values, names, json: values.json === true };
}

type Request = (command: HostAdminCommand) => Promise<unknown>;
export async function runCustomProviderCli(
  input: NonNullable<ReturnType<typeof parseCustomProviderCli>>,
  connect: () => Promise<Request>,
) {
  const { action, id, values } = input;
  const terminal = process.stdin.isTTY && process.stderr.isTTY;
  if (input.names && (!terminal || input.json))
    throw new Error(
      "--prompt-env requires an interactive terminal without --json. Use --env-stdin for automation.",
    );
  if (action === "remove" && !values.yes) {
    if (!terminal || input.json)
      throw new Error("Custom registration removal requires --yes in scripts/JSON mode.");
    if (
      (await promptCli(
        `Type ${terminalText(id!)} to remove only this registration and its configuration: `,
      )) !== id
    )
      throw new Error("Removal cancelled; nothing was changed.");
  }
  const definition =
    typeof values["config-file"] === "string"
      ? customAcpDefinitionSchema.parse(
          await readAdminJsonInput(
            createReadStream(values["config-file"]),
            "ACP definition",
            "file",
          ),
        )
      : undefined;
  const request = await connect();
  const send = async (command: CustomAcpAgentCommand) => {
    const result = customAcpAgentResultSchema.parse(
      await request({ action: "custom-providers", command }),
    );
    if (
      result.action !== command.action ||
      ("id" in command &&
        ("agent" in result ? result.agent.id : "id" in result ? result.id : undefined) !==
          command.id) ||
      ("agent" in result && result.agent.kind !== acpGenericKind(result.agent.id))
    )
      throw new Error(
        "The owner returned a different custom provider target; no result was printed.",
      );
    return result;
  };
  let expectedRevision: string | undefined;
  if (action === "add")
    await send(
      customAcpAgentCommandSchema.parse({
        version: CUSTOM_ACP_AGENTS_VERSION,
        action: "check-add",
        id,
        displayName: values.name ?? id,
        definition,
        environmentNames: input.names ?? [],
      }),
    );
  if (action === "configure" || action === "remove") {
    const inspected = await send({
      version: CUSTOM_ACP_AGENTS_VERSION,
      action: "inspect",
      id: id!,
    });
    if (!("agent" in inspected))
      throw new Error("The owner did not inspect this exact registration.");
    expectedRevision = inspected.agent.revision;
  }
  let environment: Record<string, string> | undefined;
  if (typeof values["env-file"] === "string")
    environment = await readEnvironmentStdin(createReadStream(values["env-file"]));
  else if (values["env-stdin"]) environment = await readEnvironmentStdin(process.stdin);
  else if (input.names) {
    const entries: Array<[string, string]> = [];
    for (const name of input.names)
      entries.push([name, await promptCli(`${name} (hidden; empty removes): `, { secret: true })]);
    environment = Object.fromEntries(entries);
  }
  if (environment) environment = customAcpEnvironmentSchema.parse(environment);
  const command = customAcpAgentCommandSchema.parse({
    version: CUSTOM_ACP_AGENTS_VERSION,
    action,
    ...(id ? { id } : {}),
    ...(action === "add" ? { displayName: values.name ?? id, definition } : {}),
    ...(action === "configure"
      ? {
          ...(typeof values.name === "string" ? { displayName: values.name } : {}),
          ...(definition ? { definition } : {}),
          ...(values.enable ? { enabled: true } : values.disable ? { enabled: false } : {}),
        }
      : {}),
    ...(expectedRevision ? { expectedRevision } : {}),
    ...(environment ? { environment } : {}),
  });
  const result = await send(command);
  process.stdout.write(input.json ? JSON.stringify(result) + "\n" : renderCustomProviders(result));
}

function renderCustomProviders(result: CustomAcpAgentResult): string {
  if (result.action === "check-add") return "Registration definition checked.\n";
  if (result.action === "remove")
    return `Removed configuration for ${terminalText(result.id)}; persisted history remains.\n`;
  const agents = result.action === "list" ? result.agents : [result.agent];
  if (!agents.length)
    return "No custom native ACP registrations. Run providers custom add ID --config-file JSON.\n";
  return agents
    .map(
      (agent) =>
        `${terminalText(agent.displayName)} (${terminalText(agent.kind)})${agent.enabled ? "" : " [disabled]"}\n  Native command: ${terminalText(agent.command.binary)}; arguments: ${agent.command.argumentCount}; cwd: ${terminalText(agent.command.fixedCwd ?? agent.command.cwd)}\n  Environment names: ${agent.environmentNames.map(terminalText).join(", ") || "none"}\n  Models: ${agent.models.map(terminalText).join(", ") || "discover with run --options"}\n`,
    )
    .join("");
}
