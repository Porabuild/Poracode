import { resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  hostProjectCommandSchema,
  hostProjectListSchema,
  hostProjectInspectionSchema,
  hostProjectAdditionSchema,
} from "@/shared/contracts/hostProjects";
import type { HostAdminCommand } from "@/shared/hostAdminProtocol";
import { renderAdminResult } from "./cliAdminOutput";

export function parseProjectCli(args: readonly string[]) {
  if (args[0] !== "projects") return null;
  const action = args[1];
  if (!["list", "inspect", "add"].includes(action ?? ""))
    throw new Error("Usage: poracode projects list|inspect|add. Run projects --help.");
  const parsed = parseArgs({
    args: args.slice(2),
    allowPositionals: true,
    strict: true,
    options: {
      json: { type: "boolean" },
      ...(action === "list"
        ? { limit: { type: "string" as const }, cursor: { type: "string" as const } }
        : {}),
      ...(action === "add" ? { name: { type: "string" as const } } : {}),
    },
  });
  if (
    parsed.positionals.length !== (action === "list" ? 0 : 1) ||
    parsed.positionals[0]?.trim() === ""
  )
    throw new Error(
      "Specify one project ID for inspect, or an existing directory for add. Run projects --help.",
    );
  if (parsed.values.limit !== undefined && !/^[1-9][0-9]*$/u.test(String(parsed.values.limit)))
    throw new Error("Project page limit must be an integer from 1 to 100.");
  const command = hostProjectCommandSchema.parse(
    action === "list"
      ? {
          action: "projects-list",
          ...(parsed.values.limit !== undefined ? { limit: Number(parsed.values.limit) } : {}),
          ...(parsed.values.cursor !== undefined ? { cursor: parsed.values.cursor } : {}),
        }
      : action === "inspect"
        ? { action: "projects-inspect", projectId: parsed.positionals[0] }
        : {
            action: "projects-add",
            path: resolve(parsed.positionals[0]!),
            ...(parsed.values.name !== undefined ? { name: parsed.values.name } : {}),
          },
  );
  return { command, json: parsed.values.json === true };
}

export async function runProjectCli(
  input: NonNullable<ReturnType<typeof parseProjectCli>>,
  connect: () => Promise<(command: HostAdminCommand) => Promise<unknown>>,
) {
  const request = await connect();
  const value = await request(input.command);
  const schema =
    input.command.action === "projects-list"
      ? hostProjectListSchema
      : input.command.action === "projects-inspect"
        ? hostProjectInspectionSchema
        : hostProjectAdditionSchema;
  const result = schema.parse(value);
  if (
    input.command.action === "projects-inspect" &&
    !("project" in result && result.project.id === input.command.projectId)
  )
    throw new Error("The owner returned a different project. No metadata was printed.");
  if (
    input.command.action === "projects-list" &&
    "projects" in result &&
    result.projects.length > input.command.limit
  )
    throw new Error("The owner returned more projects than requested. No metadata was printed.");
  process.stdout.write(
    input.json ? `${JSON.stringify(result)}\n` : renderAdminResult(input.command, result),
  );
}
