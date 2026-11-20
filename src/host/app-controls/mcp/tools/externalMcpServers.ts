import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  isValidMcpServerName,
  mcpExternalSourceScopeSchema,
  mcpServerSchema,
  type McpExternalServerCandidate,
} from "@/shared/contracts/mcpServer";
import { redactMcpServer } from "@/host/mcpSettings";
import {
  callingProjectScope,
  requireProjectScope,
  resolveScope,
  scopeLocation,
} from "./mcpServerScopes";
import { addMcpServerToScope, summarizeServer } from "./mcpServers";
import type { AppControlsToolContext, ToolDomain } from "./types";

const sourceArgs = {
  sourceScope: mcpExternalSourceScopeSchema.default("user"),
  sourceProjectId: z.string().min(1).optional(),
};
const discoverArgs = z.strictObject(sourceArgs);
const importArgs = z.strictObject({
  ...sourceArgs,
  candidateId: z.string().min(1),
  reviewDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  name: z.string().min(1).optional(),
  scope: z.enum(["global", "project"]).optional(),
  projectId: z.string().min(1).optional(),
});

function candidateDigest(candidate: McpExternalServerCandidate) {
  return createHash("sha256").update(JSON.stringify(candidate)).digest("hex");
}

function discover(ctx: AppControlsToolContext, args: z.output<typeof discoverArgs>) {
  const { sourceScope, sourceProjectId } = args;
  if (sourceScope === "user") {
    if (sourceProjectId) throw new Error("sourceProjectId applies to workspace and wsl-user.");
    return ctx.supervisor.discoverExternalMcpServers({ sourceScope });
  }
  const scope = sourceProjectId
    ? requireProjectScope(ctx, sourceProjectId)
    : callingProjectScope(ctx, { required: true });
  const projectLocation = scopeLocation(ctx, scope);
  if (!projectLocation) throw new Error("The selected source has no project location.");
  if (sourceScope === "workspace")
    return ctx.supervisor.discoverExternalMcpServers({ sourceScope, projectLocation });
  if (projectLocation.kind !== "wsl")
    throw new Error("wsl-user needs a project in the target distro.");
  return ctx.supervisor.discoverExternalMcpServers({ sourceScope, distro: projectLocation.distro });
}

export const externalMcpServerTools: ToolDomain = {
  specs: [
    {
      name: "discover_mcp_servers",
      description:
        "Read import candidates from external agent and editor MCP configuration. Choose user, workspace, or wsl-user sourceScope. For workspace or WSL, supply sourceProjectId or use the calling project. Credentials are redacted and unsupported entries carry a reason. Use a candidateId and reviewDigest with import_mcp_server.",
      inputSchema: z.toJSONSchema(discoverArgs, { io: "input" }),
    },
    {
      name: "import_mcp_server",
      description:
        "Import a reviewed external MCP server from discover_mcp_servers into global settings or a project. Pass the same sourceScope and sourceProjectId, plus candidateId and reviewDigest. A name override can resolve conflicts. Requires user authorization. Sign in separately if needed and reopen the thread to pick up the new server.",
      inputSchema: z.toJSONSchema(importArgs, { io: "input" }),
    },
  ],
  handlers: {
    discover_mcp_servers: async (raw, ctx) => {
      const result = await discover(ctx, discoverArgs.parse(raw));
      return {
        groups: result.groups.map(({ servers, ...group }) => ({
          ...group,
          servers: servers.map(({ id, unsupportedReason, ...candidate }) => ({
            candidateId: id,
            ...(unsupportedReason
              ? { unsupportedReason }
              : {
                  reviewDigest: candidateDigest({ id, ...candidate }),
                }),
            name: candidate.name,
            enabled: candidate.enabled,
            timeoutMs: candidate.timeoutMs,
            transport: redactMcpServer({ id, description: "", ...candidate }).transport,
          })),
        })),
      };
    },
    import_mcp_server: async (raw, ctx) => {
      const { candidateId, reviewDigest, name, ...args } = importArgs.parse(raw);
      const scope = resolveScope(ctx, args) ?? { kind: "global" };
      const result = await discover(ctx, args);
      const candidate = result.groups
        .flatMap(({ servers }) => servers)
        .find(({ id }) => id === candidateId);
      if (!candidate || candidate.unsupportedReason || candidateDigest(candidate) !== reviewDigest)
        throw new Error(
          "The candidate is unavailable or has changed. Call discover_mcp_servers again.",
        );
      const chosenName = name ?? candidate.name;
      if (!isValidMcpServerName(chosenName))
        throw new Error(
          "Choose a valid MCP server name that is not reserved by a built-in server.",
        );
      const server = mcpServerSchema.parse({
        id: randomUUID(),
        name: chosenName,
        enabled: candidate.enabled,
        timeoutMs: candidate.timeoutMs,
        transport: candidate.transport,
      });
      await addMcpServerToScope(ctx, scope, server);
      return { imported: true, server: summarizeServer(server, scope) };
    },
  },
};
