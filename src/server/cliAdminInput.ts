import { z } from "zod";
import {
  HOST_ADMIN_MAX_REQUEST_BYTES,
  hostAdminMcpDefinitionSchema,
  hostAdminMcpCreationCheckSchema,
  type HostAdminCommand,
} from "@/shared/hostAdminProtocol";
import { containsMcpRedaction } from "@/host/mcpSettings";
import { isValidMcpServerName, type McpServer } from "@/shared/contracts/mcpServer";
import { environmentNameSchema } from "./cliProfileSetup";
import { promptCli, terminalText } from "./cliPrompts";

export async function readAdminJsonInput(
  input: AsyncIterable<Buffer | string>,
  kind: "environment" | "MCP definition" | "ACP definition",
  source: "stdin" | "file" = "stdin",
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    for await (const chunk of input) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > HOST_ADMIN_MAX_REQUEST_BYTES)
        throw new Error(
          `${kind === "environment" ? "Environment" : kind} JSON on ${source} exceeds the local administration request limit.`,
        );
      chunks.push(buffer);
    }
  } catch (error) {
    throw new Error(
      `Could not read ${kind} JSON from ${source}. Keep input within ${HOST_ADMIN_MAX_REQUEST_BYTES} bytes and close the ${source === "stdin" ? "pipe" : "file"}; nothing was saved.`,
      { cause: error },
    );
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    ) as unknown;
  } catch {
    throw new Error(
      kind === "environment"
        ? "Stdin must contain one JSON object of environment names to string values; nothing was saved."
        : `${kind} input must contain one valid UTF-8 JSON object; nothing was saved.`,
    );
  }
}

export async function readEnvironmentStdin(
  input: AsyncIterable<Buffer | string>,
): Promise<Record<string, string>> {
  const value = await readAdminJsonInput(input, "environment");
  const parsed = z.record(environmentNameSchema, z.string().max(16_384)).safeParse(value);
  if (!parsed.success || (value && typeof value === "object" && Object.hasOwn(value, "__proto__")))
    throw new Error(
      "Invalid environment JSON on stdin. Use supported environment names and string values up to 16384 characters; nothing was saved.",
    );
  return parsed.data;
}

export async function readMcpDefinitionInput(
  input: AsyncIterable<Buffer | string>,
  serverId: string,
  source: "stdin" | "file" = "stdin",
): Promise<McpServer> {
  return parseMcpDefinition(await readAdminJsonInput(input, "MCP definition", source), serverId);
}

function parseMcpDefinition(value: unknown, serverId: string): McpServer {
  const parsed = hostAdminMcpDefinitionSchema.safeParse(value);
  if (!parsed.success || parsed.data.id !== serverId)
    throw new Error(
      "MCP definition must be one complete supported server object with an id matching the command. Check mcp add --help; nothing was saved.",
    );
  if (containsMcpRedaction(parsed.data.transport))
    throw new Error(
      "Full MCP definitions require explicit values, not redaction markers. No stored credentials were copied.",
    );
  return parsed.data;
}

export async function collectMcpDefinition(
  request: (command: HostAdminCommand) => Promise<unknown>,
  serverId?: string,
): Promise<McpServer> {
  const id = serverId ?? (await promptCli("Server ID: ")).trim();
  if (!id.length || Buffer.byteLength(id, "utf8") > HOST_ADMIN_MAX_REQUEST_BYTES)
    throw new Error(
      "Enter a nonempty server ID within the local request limit; nothing was saved.",
    );
  const name = (await promptCli(`Server name [${terminalText(id)}]: `)).trim() || id;
  if (!isValidMcpServerName(name))
    throw new Error(
      "Choose a non-reserved MCP name using letters, digits, dots, underscores or hyphens; nothing was saved.",
    );
  const response = await request({ action: "mcp-check-add", serverId: id, name }).catch(
    (error: unknown) => {
      const detail = error instanceof Error ? error.message : "The owner refused the check.";
      throw new Error(
        `Guided MCP creation requires local-admin v9. The check failed before transport input; nothing was saved. ${detail}`,
        { cause: error },
      );
    },
  );
  const checked = hostAdminMcpCreationCheckSchema.parse(response);
  if (checked.serverId !== id || checked.name !== name)
    throw new Error(
      "The owner checked a different MCP definition. No transport values were collected or saved.",
    );
  const type =
    (await promptCli("Transport (stdio/http/sse) [stdio]: ")).trim().toLowerCase() || "stdio";
  if (type !== "stdio" && type !== "http" && type !== "sse")
    throw new Error("Choose stdio, http or sse; nothing was saved.");
  process.stderr.write(
    "Transport values use hidden input and the existing MCP configuration store, separate from sealed provider profiles and MCP OAuth. This step does not connect or authenticate a server.\n",
  );
  const hiddenJson = async (question: string, fallback: unknown): Promise<unknown> => {
    const value = await promptCli(question, { secret: true });
    if (!value.trim()) return fallback;
    if (Buffer.byteLength(value, "utf8") > HOST_ADMIN_MAX_REQUEST_BYTES)
      throw new Error("MCP input exceeds the local request limit; nothing was saved.");
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new Error(
        "MCP input must be valid JSON; nothing was saved. Use --config-file or --config-stdin for a complete definition.",
      );
    }
  };
  let transport: Record<string, unknown>;
  if (type === "stdio") {
    const command = await promptCli("Executable command (literal, hidden): ", { secret: true });
    const args = await hiddenJson("Arguments as a JSON array; blank means [] (hidden): ", []);
    const env = await hiddenJson("Environment JSON object; blank means {} (hidden): ", {});
    const cwd = await promptCli(
      "Working directory; blank uses the normal provider context (hidden): ",
      { secret: true },
    );
    transport = { type, command, args, env, ...(cwd.length ? { cwd } : {}) };
  } else {
    const url = await promptCli("Server URL (hidden): ", { secret: true });
    const headers = await hiddenJson("Headers JSON object; blank means {} (hidden): ", {});
    transport = { type, url, headers };
  }
  const definition = { id, name, transport };
  if (Buffer.byteLength(JSON.stringify(definition), "utf8") > HOST_ADMIN_MAX_REQUEST_BYTES)
    throw new Error("MCP definition exceeds the local request limit; nothing was saved.");
  const parsed = parseMcpDefinition(definition, id);
  process.stderr.write(
    `New saved user MCP server: ${terminalText(name)} (${terminalText(id)}), transport ${type}.\n`,
  );
  const confirmation = await promptCli("Type the exact server ID to save: ");
  if (confirmation !== id) throw new Error("MCP definition creation cancelled; nothing was saved.");
  return parsed;
}
