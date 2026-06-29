/**
 * Read-only discovery of MCP servers already configured in other tools, so the
 * MCP Manager can surface what exists across agents (grouped by source) and let
 * the user import any of them into Lightcode's own managed list.
 *
 * Everything here is best-effort and defensive: a malformed config file yields
 * an empty group, never a thrown error. We never write to these files.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  MCP_SOURCE_META,
  type DetectedMcpGroup,
  type DetectedMcpServer,
  type DetectMcpServersResult,
  type McpSource,
  type McpTransport,
} from "@/shared/contracts";

function readJsonFile(path: string): unknown {
  try {
    if (!existsSync(path)) return undefined;
    let text = readFileSync(path, "utf8");
    // Tolerate JSONC (// and /* */) used by VS Code / OpenCode config files.
    text = stripJsonComments(text);
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function stripJsonComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/(^|[^:"'])\/\/.*$/gmu, (_m, p1: string) => p1);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function asStringRecord(value: unknown): Record<string, string> {
  const record = asRecord(value);
  if (!record) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/**
 * Map a `mcpServers` / `servers` style entry (Claude, Cursor, Gemini, VS Code,
 * `.mcp.json`) into a canonical transport. Returns undefined for shapes we
 * can't represent.
 */
function parseStandardEntry(raw: unknown): McpTransport | undefined {
  const entry = asRecord(raw);
  if (!entry) return undefined;
  const command = asString(entry.command);
  if (command) {
    const cwd = asString(entry.cwd);
    return {
      type: "stdio",
      command,
      args: asStringArray(entry.args),
      env: asStringRecord(entry.env),
      ...(cwd ? { cwd } : {}),
    };
  }
  const httpUrl = asString(entry.httpUrl);
  const url = asString(entry.url) ?? asString(entry.serverUrl);
  const declaredType = asString(entry.type);
  const headers = asStringRecord(entry.headers);
  if (httpUrl) return { type: "http", url: httpUrl, headers };
  if (url) {
    const type = declaredType === "sse" ? "sse" : "http";
    return { type, url, headers };
  }
  return undefined;
}

/** Map an OpenCode `mcp` entry (`local` / `remote`) into a canonical transport. */
function parseOpenCodeEntry(raw: unknown): { transport?: McpTransport; disabled: boolean } {
  const entry = asRecord(raw);
  if (!entry) return { disabled: false };
  const disabled = entry.enabled === false;
  if (entry.type === "remote") {
    const url = asString(entry.url);
    return url
      ? { transport: { type: "http", url, headers: asStringRecord(entry.headers) }, disabled }
      : { disabled };
  }
  // local (or unspecified) → stdio. `command` is an array [cmd, ...args].
  const command = asStringArray(entry.command);
  if (command.length === 0) return { disabled };
  return {
    transport: {
      type: "stdio",
      command: command[0]!,
      args: command.slice(1),
      env: asStringRecord(entry.environment),
    },
    disabled,
  };
}

function collectStandard(
  source: McpSource,
  filePath: string,
  serversValue: unknown,
): DetectedMcpServer[] {
  const record = asRecord(serversValue);
  if (!record) return [];
  const out: DetectedMcpServer[] = [];
  for (const [name, raw] of Object.entries(record)) {
    const entry = asRecord(raw);
    const transport = parseStandardEntry(raw);
    out.push({
      name,
      source,
      filePath,
      ...(transport ? { transport } : {}),
      ...(entry?.disabled === true || entry?.enabled === false ? { disabled: true } : {}),
      raw,
    });
  }
  return out;
}

function collectOpenCode(
  source: McpSource,
  filePath: string,
  mcpValue: unknown,
): DetectedMcpServer[] {
  const record = asRecord(mcpValue);
  if (!record) return [];
  const out: DetectedMcpServer[] = [];
  for (const [name, raw] of Object.entries(record)) {
    const { transport, disabled } = parseOpenCodeEntry(raw);
    out.push({
      name,
      source,
      filePath,
      ...(transport ? { transport } : {}),
      ...(disabled ? { disabled: true } : {}),
      raw,
    });
  }
  return out;
}

function group(
  source: McpSource,
  filePath: string,
  servers: DetectedMcpServer[],
): DetectedMcpGroup | undefined {
  if (servers.length === 0) return undefined;
  const meta = MCP_SOURCE_META[source];
  return { source, label: meta.label, scope: meta.scope, shared: meta.shared, filePath, servers };
}

/**
 * Minimal extractor for Codex `~/.codex/config.toml` `[mcp_servers.NAME]`
 * tables. Not a full TOML parser — handles the common stdio + remote keys so
 * detection can list servers; the user imports/edits via the manager.
 */
function collectCodexToml(filePath: string): DetectedMcpServer[] {
  let text: string;
  try {
    if (!existsSync(filePath)) return [];
    text = readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  const servers = new Map<
    string,
    { command?: string; args: string[]; env: Record<string, string>; url?: string }
  >();
  let current: string | undefined;
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const sectionName = parseCodexMcpSectionName(trimmed);
    if (sectionName) {
      current = sectionName;
      if (!servers.has(current)) servers.set(current, { args: [], env: {} });
      continue;
    }
    if (trimmed.startsWith("[")) {
      current = undefined;
      continue;
    }
    if (!current) continue;
    const kv = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/u.exec(trimmed);
    const key = kv?.[1];
    const rawValue = kv?.[2];
    if (!key || rawValue === undefined) continue;
    const entry = servers.get(current)!;
    if (key === "command") {
      const command = parseTomlString(rawValue);
      if (command) entry.command = command;
    } else if (key === "url") {
      const url = parseTomlString(rawValue);
      if (url) entry.url = url;
    } else if (key === "args") entry.args = parseTomlStringArray(rawValue);
    else if (key === "env") entry.env = parseTomlInlineTable(rawValue);
  }
  const out: DetectedMcpServer[] = [];
  for (const [name, entry] of servers) {
    let transport: McpTransport | undefined;
    if (entry.command)
      transport = { type: "stdio", command: entry.command, args: entry.args, env: entry.env };
    else if (entry.url) transport = { type: "http", url: entry.url, headers: {} };
    out.push({
      name,
      source: "codex-global",
      filePath,
      ...(transport ? { transport } : {}),
      raw: entry,
    });
  }
  return out;
}

function parseTomlString(value: string): string | undefined {
  const trimmed = value.trim().replace(/,\s*$/u, "");
  if (trimmed.startsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return undefined;
    }
  }
  const match = /^'([^']*)'$/u.exec(trimmed);
  return match ? match[1] : undefined;
}

function parseCodexMcpSectionName(line: string): string | undefined {
  const match = /^\[mcp_servers\.(?:"((?:[^"\\]|\\.)*)"|([A-Za-z0-9_.-]+))\]$/u.exec(line);
  if (!match) return undefined;
  if (match[1] !== undefined) return parseTomlString(`"${match[1]}"`);
  return match[2];
}

function parseTomlStringArray(value: string): string[] {
  const inner = value
    .trim()
    .replace(/^\[/u, "")
    .replace(/\]\s*,?\s*$/u, "");
  const out: string[] = [];
  for (const part of inner.split(",")) {
    const s = parseTomlString(part);
    if (s !== undefined) out.push(s);
  }
  return out;
}

function parseTomlInlineTable(value: string): Record<string, string> {
  const inner = value
    .trim()
    .replace(/^\{/u, "")
    .replace(/\}\s*,?\s*$/u, "");
  const out: Record<string, string> = {};
  for (const part of inner.split(",")) {
    const kv = /^\s*"?([A-Za-z0-9_]+)"?\s*=\s*(.+?)\s*$/u.exec(part);
    const key = kv?.[1];
    const rawVal = kv?.[2];
    if (!key || rawVal === undefined) continue;
    const v = parseTomlString(rawVal);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

type ServersCollector = (
  source: McpSource,
  filePath: string,
  value: unknown,
) => DetectedMcpServer[];

/** Read `filePath` as JSON, pull the servers container out, and group it. */
function jsonGroup(
  source: McpSource,
  filePath: string,
  getServers: (root: Record<string, unknown> | undefined) => unknown,
  collect: ServersCollector,
): DetectedMcpGroup | undefined {
  const root = asRecord(readJsonFile(filePath));
  return group(source, filePath, collect(source, filePath, getServers(root)));
}

const mcpServersField = (root: Record<string, unknown> | undefined): unknown => root?.mcpServers;
const mcpField = (root: Record<string, unknown> | undefined): unknown => root?.mcp;

function compact(groups: (DetectedMcpGroup | undefined)[]): DetectedMcpGroup[] {
  return groups.filter((g): g is DetectedMcpGroup => g !== undefined);
}

/**
 * Scan all known global/user-level config files. `claudeRoot` lets the entry
 * point share a single parse of `~/.claude.json` with the project scan.
 */
export function detectGlobalMcpServers(
  claudeRoot?: Record<string, unknown> | undefined,
  home = homedir(),
): DetectedMcpGroup[] {
  const claudeJsonPath = join(home, ".claude.json");
  const claude = claudeRoot ?? asRecord(readJsonFile(claudeJsonPath));
  const codexPath = join(home, ".codex", "config.toml");
  return compact([
    group(
      "claude-global",
      claudeJsonPath,
      collectStandard("claude-global", claudeJsonPath, claude?.mcpServers),
    ),
    group("codex-global", codexPath, collectCodexToml(codexPath)),
    jsonGroup("cursor-global", join(home, ".cursor", "mcp.json"), mcpServersField, collectStandard),
    jsonGroup(
      "gemini-global",
      join(home, ".gemini", "settings.json"),
      mcpServersField,
      collectStandard,
    ),
    jsonGroup(
      "opencode-global",
      join(home, ".config", "opencode", "opencode.json"),
      mcpField,
      collectOpenCode,
    ),
  ]);
}

/** Scan project-level config files under `projectPath`. */
export function detectProjectMcpServers(
  projectPath: string,
  claudeRoot?: Record<string, unknown> | undefined,
): DetectedMcpGroup[] {
  // Claude Code per-project (local) scope lives in ~/.claude.json under
  // `projects[absolutePath].mcpServers`.
  const claudeJsonPath = join(homedir(), ".claude.json");
  const claude = claudeRoot ?? asRecord(readJsonFile(claudeJsonPath));
  const projectEntry = asRecord(asRecord(claude?.projects)?.[projectPath]);
  return compact([
    // Shared `.mcp.json` (Claude Code project scope + several other tools).
    jsonGroup("mcp-json", join(projectPath, ".mcp.json"), mcpServersField, collectStandard),
    group(
      "claude-project",
      claudeJsonPath,
      collectStandard("claude-project", claudeJsonPath, projectEntry?.mcpServers),
    ),
    jsonGroup(
      "cursor-project",
      join(projectPath, ".cursor", "mcp.json"),
      mcpServersField,
      collectStandard,
    ),
    jsonGroup(
      "gemini-project",
      join(projectPath, ".gemini", "settings.json"),
      mcpServersField,
      collectStandard,
    ),
    // VS Code workspace scope (.vscode/mcp.json) — note the key is `servers`.
    jsonGroup(
      "vscode-project",
      join(projectPath, ".vscode", "mcp.json"),
      (root) => root?.servers ?? root?.mcpServers,
      collectStandard,
    ),
    jsonGroup("opencode-project", join(projectPath, "opencode.json"), mcpField, collectOpenCode),
  ]);
}

/** Entry point used by the IPC handler. */
export function detectMcpServers(projectPath?: string): DetectMcpServersResult {
  // `~/.claude.json` carries both user (top-level) and per-project scopes, so
  // parse it once and share it across both scans.
  const claudeRoot = asRecord(readJsonFile(join(homedir(), ".claude.json")));
  const groups = [
    ...detectGlobalMcpServers(claudeRoot),
    ...(projectPath ? detectProjectMcpServers(projectPath, claudeRoot) : []),
  ];
  return { groups };
}
