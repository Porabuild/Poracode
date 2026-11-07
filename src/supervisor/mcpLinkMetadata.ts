import { Client } from "@modelcontextprotocol/client";
import type { McpServer } from "@/shared/contracts";
import type { BridgeTool } from "./mcp/toolBridge";
import { createUpstreamTransport } from "./mcp/mcpToolFilterProxy";
import { jiraIssueKey, type LinkMetadata } from "./linkMetadataShared";
import type { LinkMetadataResolver } from "./linkMetadata";

const REQUEST_TIMEOUT_MS = 5_000;
const GENERIC_TOOL_NAMES = new Set([
  "link_metadata",
  "get_link_metadata",
  "resolve_link_metadata",
  "url_metadata",
  "get_url_metadata",
  "fetch_url_metadata",
]);
const JIRA_TOOL_NAMES = new Set([
  "jiragetissue",
  "getissue",
  "getjiraissue",
  "jiraissue",
  "getissuebykey",
  "jiragetissuebykey",
]);

export type McpLinkMetadataSource = "mcp" | "plugin";

export function createMcpLinkMetadataResolvers(
  servers: readonly McpServer[],
  source: McpLinkMetadataSource,
): LinkMetadataResolver[] {
  const toolRequests = new Map<string, Promise<BridgeTool | null>>();
  return servers.map((server) => {
    const findTool = (url: string): Promise<BridgeTool | null> => {
      const key = `${source}:${server.id}:${jiraIssueKey(url) ? "jira" : "generic"}`;
      const existing = toolRequests.get(key);
      if (existing) return existing;
      const request = discoverMetadataTool(server, url).catch(() => null);
      toolRequests.set(key, request);
      return request;
    };
    return {
      kind: source,
      canResolve: (url) => server.enabled !== false && /^https?:\/\//iu.test(url),
      resolve: async (url) => {
        const tool = await findTool(url);
        if (!tool) return { title: null, description: null };
        const args = metadataToolArguments(tool, url);
        if (!args) return { title: null, description: null };
        const result = await callMetadataTool(server, tool, args);
        return parseMcpMetadataResult(result);
      },
    };
  });
}

export function metadataToolArguments(
  tool: BridgeTool,
  url: string,
): Record<string, unknown> | null {
  if (GENERIC_TOOL_NAMES.has(tool.name)) return { url };
  const issueKey = jiraIssueKey(url);
  if (!issueKey) return null;
  const schema = tool.inputSchema as { properties?: Record<string, unknown> } | undefined;
  const properties = new Set(Object.keys(schema?.properties ?? {}));
  if (properties.size === 0) return { issueKey };
  for (const name of ["issueKey", "issue_key", "issueId", "issue_id", "key", "id"]) {
    if (properties.has(name)) return { [name]: issueKey };
  }
  return null;
}

export function selectMetadataTool(
  tools: readonly BridgeTool[],
  server: McpServer,
  url: string,
): BridgeTool | null {
  const jiraKey = jiraIssueKey(url);
  const jiraServer = /jira|atlassian/iu.test(`${server.id} ${server.name}`);
  return (
    tools.find((tool) => {
      if (tool.annotations?.readOnlyHint === false) return false;
      if (GENERIC_TOOL_NAMES.has(tool.name)) return true;
      if (!jiraKey || !jiraServer) return false;
      const normalized = tool.name.toLowerCase().replace(/[^a-z0-9]/gu, "");
      return JIRA_TOOL_NAMES.has(normalized);
    }) ?? null
  );
}

export function parseMcpMetadataResult(result: unknown): LinkMetadata {
  if (!result || typeof result !== "object") return { title: null, description: null };
  const record = result as Record<string, unknown>;
  const structured = record.structuredContent;
  if (structured && typeof structured === "object") return metadataFromRecord(structured);
  const content = Array.isArray(record.content) ? record.content : [];
  for (const entry of content) {
    if (!entry || typeof entry !== "object") continue;
    const text = (entry as { text?: unknown }).text;
    if (typeof text !== "string" || !text.trim()) continue;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === "object") return metadataFromRecord(parsed);
    } catch {
      return { title: cleanMetadataText(text, 240), description: null };
    }
  }
  return { title: null, description: null };
}

async function discoverMetadataTool(server: McpServer, url: string): Promise<BridgeTool | null> {
  const client = new Client({ name: "poracode-link-metadata", version: "1.0.0" });
  const options = { timeout: REQUEST_TIMEOUT_MS, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
  try {
    await client.connect(createUpstreamTransport(server), options);
    const { tools } = await client.listTools(undefined, options);
    return selectMetadataTool(tools, server, url);
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function callMetadataTool(
  server: McpServer,
  tool: BridgeTool,
  args: Record<string, unknown>,
): Promise<unknown> {
  const client = new Client({ name: "poracode-link-metadata", version: "1.0.0" });
  const options = { timeout: REQUEST_TIMEOUT_MS, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
  try {
    await client.connect(createUpstreamTransport(server), options);
    return await client.callTool({ name: tool.name, arguments: args }, options);
  } finally {
    await client.close().catch(() => undefined);
  }
}

function metadataFromRecord(value: object): LinkMetadata {
  const record = value as Record<string, unknown>;
  const fields =
    record.fields && typeof record.fields === "object"
      ? (record.fields as Record<string, unknown>)
      : record;
  return {
    title: cleanMetadataText(fields.title ?? fields.summary ?? fields.name, 240),
    description: cleanMetadataText(fields.description ?? fields.body, 600),
  };
}

function cleanMetadataText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/gu, " ").trim();
  if (!text) return null;
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trimEnd()}…`;
}
