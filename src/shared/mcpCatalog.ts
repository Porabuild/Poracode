import type { McpServer, McpTransport } from "./contracts";

/**
 * Curated marketplace of popular MCP servers, modeled after the catalogs in
 * VS Code / Zed / Cursor. Bundled in-app (no network) so users can one-click
 * add a server into their Lightcode-managed list, then fill in any required
 * paths/secrets in the editor. The list can later be backed by a remote feed.
 */

export type McpCatalogCategory = "official" | "web" | "dev" | "data" | "productivity" | "browser";

export interface McpCatalogEntry {
  /** Stable catalog id, recorded on the installed server as `catalogId`. */
  id: string;
  /** Default server key (the user can rename on add). */
  name: string;
  title: string;
  description: string;
  category: McpCatalogCategory;
  homepage?: string;
  /** Template transport; env values are blank placeholders for required keys. */
  transport: McpTransport;
  /** Env var names (stdio) or a one-line note the user must complete before use. */
  requiredEnv?: string[];
  /** Short human note about extra setup (e.g. "replace PATH with a folder"). */
  setupHint?: string;
}

export const MCP_CATALOG: McpCatalogEntry[] = [
  {
    id: "filesystem",
    name: "filesystem",
    title: "Filesystem",
    description: "Read and write files under one or more allowed directories.",
    category: "official",
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    transport: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "PATH"],
      env: {},
    },
    setupHint: "Replace PATH with an absolute directory the agent may access.",
  },
  {
    id: "git",
    name: "git",
    title: "Git",
    description: "Inspect and operate on a Git repository (status, diff, log, commit).",
    category: "dev",
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/git",
    transport: { type: "stdio", command: "uvx", args: ["mcp-server-git"], env: {} },
    setupHint: "Requires `uv` (uvx) installed.",
  },
  {
    id: "fetch",
    name: "fetch",
    title: "Fetch",
    description: "Fetch a URL and convert its contents to Markdown for the model.",
    category: "web",
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
    transport: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"], env: {} },
    setupHint: "Requires `uv` (uvx) installed.",
  },
  {
    id: "memory",
    name: "memory",
    title: "Memory",
    description: "A knowledge-graph memory the agent can read and write across turns.",
    category: "official",
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
    transport: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
      env: {},
    },
  },
  {
    id: "sequential-thinking",
    name: "sequential-thinking",
    title: "Sequential Thinking",
    description: "Structured step-by-step reasoning scaffold for complex problems.",
    category: "official",
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking",
    transport: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
      env: {},
    },
  },
  {
    id: "playwright",
    name: "playwright",
    title: "Playwright",
    description: "Drive a real browser (navigate, click, fill, snapshot) via Playwright.",
    category: "browser",
    homepage: "https://github.com/microsoft/playwright-mcp",
    transport: { type: "stdio", command: "npx", args: ["-y", "@playwright/mcp@latest"], env: {} },
  },
  {
    id: "context7",
    name: "context7",
    title: "Context7",
    description: "Up-to-date, version-specific docs and code examples for libraries.",
    category: "dev",
    homepage: "https://github.com/upstash/context7",
    transport: { type: "http", url: "https://mcp.context7.com/mcp", headers: {} },
  },
  {
    id: "github",
    name: "github",
    title: "GitHub",
    description: "Issues, PRs, code search and repo operations via the GitHub MCP server.",
    category: "dev",
    homepage: "https://github.com/github/github-mcp-server",
    transport: {
      type: "http",
      url: "https://api.githubcopilot.com/mcp/",
      headers: { Authorization: "Bearer " },
    },
    requiredEnv: ["Authorization header: Bearer <GitHub PAT>"],
    setupHint: "Set the Authorization header to `Bearer <your GitHub personal access token>`.",
  },
  {
    id: "brave-search",
    name: "brave-search",
    title: "Brave Search",
    description: "Web and local search through the Brave Search API.",
    category: "web",
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search",
    transport: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-brave-search"],
      env: { BRAVE_API_KEY: "" },
    },
    requiredEnv: ["BRAVE_API_KEY"],
  },
  {
    id: "postgres",
    name: "postgres",
    title: "PostgreSQL",
    description: "Read-only SQL access and schema inspection for a Postgres database.",
    category: "data",
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres",
    transport: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-postgres", "CONNECTION_URL"],
      env: {},
    },
    setupHint: "Replace CONNECTION_URL with a postgresql://… connection string.",
  },
  {
    id: "slack",
    name: "slack",
    title: "Slack",
    description: "Read channels and post messages to a Slack workspace.",
    category: "productivity",
    homepage: "https://github.com/modelcontextprotocol/servers/tree/main/src/slack",
    transport: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-slack"],
      env: { SLACK_BOT_TOKEN: "", SLACK_TEAM_ID: "" },
    },
    requiredEnv: ["SLACK_BOT_TOKEN", "SLACK_TEAM_ID"],
  },
];

export const MCP_CATALOG_CATEGORY_LABELS: Record<McpCatalogCategory, string> = {
  official: "Official",
  web: "Web & Search",
  dev: "Developer",
  data: "Data",
  productivity: "Productivity",
  browser: "Browser",
};

/** Build a fresh managed server from a catalog entry (deep-copied template). */
export function catalogEntryToServer(entry: McpCatalogEntry, id: string): McpServer {
  const transport: McpTransport =
    entry.transport.type === "stdio"
      ? {
          type: "stdio",
          command: entry.transport.command,
          args: [...entry.transport.args],
          env: { ...entry.transport.env },
        }
      : {
          type: entry.transport.type,
          url: entry.transport.url,
          headers: { ...entry.transport.headers },
        };
  return {
    id,
    name: entry.name,
    label: entry.title,
    description: entry.description,
    enabled: true,
    transport,
    catalogId: entry.id,
  };
}
