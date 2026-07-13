import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, posix, resolve, win32 } from "node:path";
import JSON5 from "json5";
import { parse as parseToml } from "smol-toml";
import {
  DEFAULT_MCP_SERVER_TIMEOUT_MS,
  discoverExternalMcpServersPayloadSchema,
  discoverExternalMcpServersResultSchema,
  isReservedMcpServerName,
  MCP_SERVER_NAME_PATTERN,
  mcpExternalServerCandidateSchema,
  type DiscoverExternalMcpServersPayload,
  type DiscoverExternalMcpServersResult,
  type McpExternalServerCandidate,
  type McpExternalServerGroup,
  type McpExternalUnsupportedReason,
  type McpTransport,
  type ProjectLocation,
} from "@/shared/contracts";
import { toWslUncPath } from "@/shared/wsl";
import { resolveWslHomeDirectoryAsync } from "../agents/base";
import { sanitizeCommandCodeCwd } from "../agents/commandcode/sessionFiles";

const MAX_CONFIG_BYTES = 4 * 1024 * 1024;

const TOOL_RESTRICTION_KEYS = [
  "includeTools",
  "excludeTools",
  "enabledTools",
  "disabledTools",
  "include_tools",
  "exclude_tools",
  "enabled_tools",
  "disabled_tools",
  "tools",
] as const;

const AUTHENTICATION_METADATA_KEYS = [
  "headersHelper",
  "authProviderType",
  "env_http_headers",
  "bearer_token_env_var",
  "oauth_resource",
  "scopes",
] as const;

const SENSITIVE_ARGUMENT_PATTERN =
  /^--(?:api[-_]?key|(?:access|auth|bearer)[-_]?token|token|client[-_]?secret|secret|password|passwd|pwd|key|headers?|http[-_]?header)(?:=.*)?$/iu;
/**
 * Env vars / headers are only treated as secrets when their name looks
 * credential-like. Plain configuration values (paths, timeouts, feature
 * flags) are imported as-is so the server stays importable.
 */
const SENSITIVE_RECORD_KEY_PATTERN =
  /(?:^|[_.-])(?:api[_.-]?keys?|keys?|tokens?|secrets?|password|passwd|pwd|credentials?|auth|authorization|signature|sig|cookie|cookies)(?:$|[_.-])/iu;
const SENSITIVE_QUERY_PARAMETER_PATTERN =
  /^(?:api[-_.]?key|(?:access|auth|bearer)[-_.]?token|token|client[-_.]?secret|secret|password|passwd|pwd|credential|authorization|auth|signature|sig|key)$/iu;

interface LocatedRoot {
  fsPath: string;
  displayPath: string;
  style: "native" | "posix" | "windows" | "wsl";
}

interface LocatedFile {
  fsPath: string;
  displayPath: string;
}

type ReadTextFile = (path: string) => string | undefined;

const LEGACY_APP_MANAGED_OPENCODE_NAMES = new Set([
  "poracode_browser",
  "poracode_subagent",
  "poracode_subagents",
  "poracode_computer_use",
  "poracode_chrome",
  "poracode",
  "poracode_browser",
  "poracode_subagent",
  "poracode_subagents",
  "poracode_computer_use",
  "poracode_chrome",
]);

export interface ExternalMcpDiscoveryServiceOptions {
  env?: NodeJS.ProcessEnv;
  homeDirectory?: () => string;
  readTextFile?: ReadTextFile;
  resolveWslHome?: (distro: string) => Promise<string | undefined>;
  wslFsPath?: (distro: string, linuxPath: string) => string;
}

function defaultReadTextFile(path: string): string | undefined {
  try {
    const content = readFileSync(path);
    if (content.length > MAX_CONFIG_BYTES) return undefined;
    return content.toString("utf8");
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? value
    : undefined;
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value);
  if (!entries.every(([, entry]) => typeof entry === "string")) return undefined;
  return Object.fromEntries(entries) as Record<string, string>;
}

function positiveMilliseconds(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.max(1, Math.round(value))
    : undefined;
}

function timeoutMsFor(entry: Record<string, unknown>): number {
  const direct = positiveMilliseconds(entry.timeoutMs ?? entry.timeout);
  if (direct) return direct;

  const toolSeconds = positiveMilliseconds(entry.tool_timeout_sec);
  if (toolSeconds) return toolSeconds * 1_000;

  const startupMilliseconds = positiveMilliseconds(entry.startup_timeout_ms);
  if (startupMilliseconds) return startupMilliseconds;

  const startupSeconds = positiveMilliseconds(entry.startup_timeout_sec);
  return startupSeconds ? startupSeconds * 1_000 : DEFAULT_MCP_SERVER_TIMEOUT_MS;
}

function candidateId(providerId: string, sourcePath: string, name: string): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([providerId, sourcePath, name]))
    .digest("hex")
    .slice(0, 24);
  return `external-${digest}`;
}

function hasDefinedKey(entry: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(entry, key) && entry[key] !== undefined;
}

function hasToolRestrictions(entry: Record<string, unknown>): boolean {
  return TOOL_RESTRICTION_KEYS.some((key) => hasDefinedKey(entry, key));
}

function hasAuthenticationMetadata(entry: Record<string, unknown>): boolean {
  if (entry.oauth !== undefined && entry.oauth !== false) return true;
  if (entry.auth !== undefined && entry.auth !== false) return true;
  return AUTHENTICATION_METADATA_KEYS.some((key) => hasDefinedKey(entry, key));
}

function hasEnvironmentPassthrough(entry: Record<string, unknown>): boolean {
  const envVars = entry.env_vars;
  return Array.isArray(envVars) ? envVars.length > 0 : envVars !== undefined;
}

function sanitizeStdioArgs(args: string[]): { args: string[]; sensitive: boolean } {
  const sanitized: string[] = [];
  let sensitive = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const shortHeader =
      argument === "-H" || Boolean(argument?.startsWith("-H") && argument.length > 2);
    if (!argument || (!shortHeader && !SENSITIVE_ARGUMENT_PATTERN.test(argument))) {
      if (argument !== undefined) sanitized.push(argument);
      continue;
    }

    sensitive = true;
    const hasInlineValue =
      argument.includes("=") || (argument.startsWith("-H") && argument !== "-H");
    if (!hasInlineValue && index + 1 < args.length) index += 1;
  }
  return { args: sanitized, sensitive };
}

function sanitizeRemoteUrl(value: string): { url: string; sensitive: boolean } {
  try {
    const url = new URL(value);
    let sensitive = Boolean(url.username || url.password);
    if (sensitive) {
      url.username = "";
      url.password = "";
    }

    for (const key of [...url.searchParams.keys()]) {
      if (!SENSITIVE_QUERY_PARAMETER_PATTERN.test(key)) continue;
      sensitive = true;
      url.searchParams.delete(key);
    }

    return { url: sensitive ? url.toString() : value, sensitive };
  } catch {
    return { url: value, sensitive: false };
  }
}

function sanitizeStringRecord(record: Record<string, string>): {
  record: Record<string, string>;
  sensitive: boolean;
} {
  const kept: Record<string, string> = {};
  let sensitive = false;
  for (const [key, value] of Object.entries(record)) {
    if (SENSITIVE_RECORD_KEY_PATTERN.test(key)) {
      sensitive = true;
      continue;
    }
    kept[key] = value;
  }
  return { record: kept, sensitive };
}

function sanitizeTransport(transport: McpTransport): {
  transport: McpTransport;
  sensitive: boolean;
} {
  if (transport.type === "stdio") {
    const sanitizedArgs = sanitizeStdioArgs(transport.args);
    const sanitizedEnv = sanitizeStringRecord(transport.env);
    return {
      transport: {
        ...transport,
        args: sanitizedArgs.args,
        env: sanitizedEnv.record,
      },
      sensitive: sanitizedArgs.sensitive || sanitizedEnv.sensitive,
    };
  }

  const sanitizedUrl = sanitizeRemoteUrl(transport.url);
  const sanitizedHeaders = sanitizeStringRecord(transport.headers);
  return {
    transport: {
      ...transport,
      url: sanitizedUrl.url,
      headers: sanitizedHeaders.record,
    },
    sensitive: sanitizedUrl.sensitive || sanitizedHeaders.sensitive,
  };
}

function unsupportedReasonFor(
  entry: Record<string, unknown>,
  sensitive: boolean,
): McpExternalUnsupportedReason | undefined {
  if (hasToolRestrictions(entry)) return "tool-restrictions";
  if (hasAuthenticationMetadata(entry)) return "authentication";
  return hasEnvironmentPassthrough(entry) || sensitive ? "sensitive-values" : undefined;
}

function candidateFromTransport(
  providerId: string,
  sourcePath: string,
  name: string,
  entry: Record<string, unknown>,
  transport: McpTransport,
): McpExternalServerCandidate | undefined {
  if (!MCP_SERVER_NAME_PATTERN.test(name)) return undefined;
  const sanitized = sanitizeTransport(transport);
  const unsupportedReason = unsupportedReasonFor(entry, sanitized.sensitive);
  const parsed = mcpExternalServerCandidateSchema.safeParse({
    id: candidateId(providerId, sourcePath, name),
    name,
    enabled: entry.enabled !== false && entry.disabled !== true,
    timeoutMs: timeoutMsFor(entry),
    transport: sanitized.transport,
    ...(unsupportedReason ? { unsupportedReason } : {}),
  });
  return parsed.success ? parsed.data : undefined;
}

function standardEntryToCandidate(
  providerId: string,
  sourcePath: string,
  name: string,
  value: unknown,
): McpExternalServerCandidate | undefined {
  if (!isRecord(value)) return undefined;

  const declaredType = value.type ?? value.transport;
  const command = typeof value.command === "string" ? value.command.trim() : "";
  if (command) {
    if (
      declaredType === "http" ||
      declaredType === "streamable-http" ||
      declaredType === "sse" ||
      declaredType === "remote" ||
      declaredType === "ws" ||
      declaredType === "websocket"
    ) {
      return undefined;
    }
    const args = value.args === undefined ? [] : stringArray(value.args);
    const envValue = value.env ?? value.environment;
    const env = envValue === undefined ? {} : stringRecord(envValue);
    if (!args || !env) return undefined;
    const cwd = typeof value.cwd === "string" && value.cwd.trim() ? value.cwd : undefined;
    return candidateFromTransport(providerId, sourcePath, name, value, {
      type: "stdio",
      command,
      args,
      env,
      ...(cwd ? { cwd } : {}),
    });
  }

  const httpUrl = typeof value.httpUrl === "string" ? value.httpUrl.trim() : "";
  const serverUrl = typeof value.serverUrl === "string" ? value.serverUrl.trim() : "";
  const url = httpUrl || serverUrl || (typeof value.url === "string" ? value.url.trim() : "");
  if (!url) return undefined;

  if (declaredType === "stdio" || declaredType === "local") return undefined;
  if (declaredType === "ws" || declaredType === "websocket") return undefined;
  const type =
    declaredType === "sse" ||
    (providerId === "gemini" && declaredType === undefined && !httpUrl && !serverUrl)
      ? "sse"
      : "http";
  const headers = value.headers === undefined ? {} : stringRecord(value.headers);
  if (!headers) return undefined;
  return candidateFromTransport(providerId, sourcePath, name, value, { type, url, headers });
}

function parseJson(text: string): unknown {
  try {
    return JSON5.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function parseStandardJsonServers(
  providerId: string,
  sourcePath: string,
  text: string,
  containerKey: "mcpServers" | "servers" = "mcpServers",
): McpExternalServerCandidate[] {
  const parsed = parseJson(text);
  if (!isRecord(parsed) || !isRecord(parsed[containerKey])) return [];
  return Object.entries(parsed[containerKey])
    .map(([name, value]) => standardEntryToCandidate(providerId, sourcePath, name, value))
    .filter((server): server is McpExternalServerCandidate => Boolean(server));
}

function parseClaudeProjectServers(
  sourcePath: string,
  text: string,
  projectLocation: ProjectLocation,
): McpExternalServerCandidate[] {
  const parsed = parseJson(text);
  if (!isRecord(parsed) || !isRecord(parsed.projects)) return [];
  const project = Object.entries(parsed.projects).find(([path]) =>
    projectPathsEqual(path, projectLocation),
  )?.[1];
  if (!isRecord(project) || !isRecord(project.mcpServers)) return [];
  return Object.entries(project.mcpServers)
    .map(([name, value]) => standardEntryToCandidate("claude", sourcePath, name, value))
    .filter((server): server is McpExternalServerCandidate => Boolean(server));
}

function projectPathsEqual(candidate: string, location: ProjectLocation): boolean {
  if (location.kind === "windows") {
    return (
      trimTrailingSeparator(win32.normalize(candidate)).toLowerCase() ===
      trimTrailingSeparator(win32.normalize(location.path)).toLowerCase()
    );
  }
  const expected = location.kind === "wsl" ? location.linuxPath : location.path;
  return (
    trimTrailingSeparator(posix.normalize(candidate.replaceAll("\\", "/"))) ===
    trimTrailingSeparator(posix.normalize(expected.replaceAll("\\", "/")))
  );
}

function trimTrailingSeparator(value: string): string {
  if (value === "/" || /^[A-Za-z]:\\$/u.test(value)) return value;
  return value.replace(/[\\/]+$/u, "");
}

function tomlEntryToCandidate(
  providerId: string,
  sourcePath: string,
  name: string,
  value: unknown,
): McpExternalServerCandidate | undefined {
  if (!isRecord(value)) return undefined;
  const command = typeof value.command === "string" ? value.command.trim() : "";
  if (command) {
    const args = value.args === undefined ? [] : stringArray(value.args);
    const env = value.env === undefined ? {} : stringRecord(value.env);
    if (!args || !env) return undefined;
    const cwd = typeof value.cwd === "string" && value.cwd.trim() ? value.cwd : undefined;
    return candidateFromTransport(providerId, sourcePath, name, value, {
      type: "stdio",
      command,
      args,
      env,
      ...(cwd ? { cwd } : {}),
    });
  }

  const url = typeof value.url === "string" ? value.url.trim() : "";
  if (!url) return undefined;
  const headersValue = value.http_headers ?? value.headers;
  const headers = headersValue === undefined ? {} : stringRecord(headersValue);
  if (!headers) return undefined;
  return candidateFromTransport(providerId, sourcePath, name, value, {
    type: "http",
    url,
    headers,
  });
}

function parseTomlServers(
  providerId: string,
  sourcePath: string,
  text: string,
): McpExternalServerCandidate[] {
  let parsed: unknown;
  try {
    parsed = parseToml(text);
  } catch {
    return [];
  }
  if (!isRecord(parsed) || !isRecord(parsed.mcp_servers)) return [];
  return Object.entries(parsed.mcp_servers)
    .map(([name, value]) => tomlEntryToCandidate(providerId, sourcePath, name, value))
    .filter((server): server is McpExternalServerCandidate => Boolean(server));
}

function parseOpenCodeServers(
  sourcePath: string,
  text: string,
  managedNames: ReadonlySet<string>,
): McpExternalServerCandidate[] {
  const parsed = parseJson(text);
  if (!isRecord(parsed) || !isRecord(parsed.mcp)) return [];
  const servers: McpExternalServerCandidate[] = [];
  for (const [name, value] of Object.entries(parsed.mcp)) {
    if (
      managedNames.has(name.toLowerCase()) ||
      isReservedMcpServerName(name) ||
      LEGACY_APP_MANAGED_OPENCODE_NAMES.has(name.toLowerCase()) ||
      !isRecord(value)
    ) {
      continue;
    }
    const command = stringArray(value.command);
    if (command && command.length > 0 && command[0]?.trim()) {
      const environment = value.environment === undefined ? {} : stringRecord(value.environment);
      if (!environment) continue;
      const cwd = typeof value.cwd === "string" && value.cwd.trim() ? value.cwd : undefined;
      const candidate = candidateFromTransport("opencode", sourcePath, name, value, {
        type: "stdio",
        command: command[0],
        args: command.slice(1),
        env: environment,
        ...(cwd ? { cwd } : {}),
      });
      if (candidate) servers.push(candidate);
      continue;
    }
    const candidate = standardEntryToCandidate("opencode", sourcePath, name, value);
    if (candidate) servers.push(candidate);
  }
  return servers;
}

function joinRoot(root: LocatedRoot, ...segments: string[]): LocatedFile {
  if (root.style === "posix") {
    return {
      fsPath: posix.join(root.fsPath, ...segments),
      displayPath: posix.join(root.displayPath, ...segments),
    };
  }
  if (root.style === "windows") {
    return {
      fsPath: win32.join(root.fsPath, ...segments),
      displayPath: win32.join(root.displayPath, ...segments),
    };
  }
  if (root.style === "wsl") {
    return {
      fsPath: win32.join(root.fsPath, ...segments),
      displayPath: posix.join(root.displayPath, ...segments),
    };
  }
  return {
    fsPath: join(root.fsPath, ...segments),
    displayPath: join(root.displayPath, ...segments),
  };
}

function rootForProject(location: ProjectLocation): LocatedRoot {
  if (location.kind === "wsl") {
    return { fsPath: location.uncPath, displayPath: location.linuxPath, style: "wsl" };
  }
  if (location.kind === "windows") {
    return { fsPath: location.path, displayPath: location.path, style: "windows" };
  }
  return { fsPath: location.path, displayPath: location.path, style: "posix" };
}

function group(
  providerId: string,
  providerLabel: string,
  sourcePath: string,
  servers: McpExternalServerCandidate[],
): McpExternalServerGroup | undefined {
  if (servers.length === 0) return undefined;
  return {
    providerId,
    providerLabel,
    sourcePath,
    servers: servers.toSorted((a, b) => a.name.localeCompare(b.name)),
  };
}

function managedOpenCodeNames(text: string | undefined): ReadonlySet<string> {
  const parsed = text ? parseJson(text) : undefined;
  return new Set(
    Array.isArray(parsed)
      ? parsed
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.toLowerCase())
      : [],
  );
}

function nativePath(value: string, home: string): string {
  if (isAbsolute(value)) return value;
  if (value === "~") return home;
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return resolve(home, value.slice(2));
  }
  return resolve(value);
}

export class ExternalMcpDiscoveryService {
  private readonly env: NodeJS.ProcessEnv;
  private readonly homeDirectory: () => string;
  private readonly readTextFile: ReadTextFile;
  private readonly resolveWslHome: (distro: string) => Promise<string | undefined>;
  private readonly wslFsPath: (distro: string, linuxPath: string) => string;

  constructor(options: ExternalMcpDiscoveryServiceOptions = {}) {
    this.env = options.env ?? process.env;
    this.homeDirectory = options.homeDirectory ?? homedir;
    this.readTextFile = options.readTextFile ?? defaultReadTextFile;
    this.resolveWslHome = options.resolveWslHome ?? resolveWslHomeDirectoryAsync;
    this.wslFsPath = options.wslFsPath ?? toWslUncPath;
  }

  async discover(
    input: DiscoverExternalMcpServersPayload,
  ): Promise<DiscoverExternalMcpServersResult> {
    const payload = discoverExternalMcpServersPayloadSchema.parse(input);
    const groups =
      payload.sourceScope === "workspace"
        ? await this.discoverWorkspace(payload.projectLocation)
        : payload.sourceScope === "wsl-user"
          ? await this.discoverWslUser(payload.distro)
          : this.discoverUserFromRoot(this.hostUserRoot());
    return discoverExternalMcpServersResultSchema.parse({ groups });
  }

  private async discoverWslUser(distro: string): Promise<McpExternalServerGroup[]> {
    const linuxHome = await this.resolveWslHome(distro);
    if (!linuxHome) return [];
    return this.discoverUserFromRoot({
      fsPath: this.wslFsPath(distro, linuxHome),
      displayPath: linuxHome,
      style: "wsl",
    });
  }

  private discoverUserFromRoot(home: LocatedRoot): McpExternalServerGroup[] {
    const groups: McpExternalServerGroup[] = [];

    const claude = joinRoot(home, ".claude.json");
    this.addGroup(
      groups,
      group("claude", "Claude Code", claude.displayPath, this.parseStandardFile("claude", claude)),
    );

    const codexHome = this.nativeOverrideRoot(home, "CODEX_HOME", [".codex"]);
    const codex = joinRoot(codexHome, "config.toml");
    this.addGroup(
      groups,
      group("codex", "Codex CLI", codex.displayPath, this.parseTomlFile("codex", codex)),
    );

    const geminiHome = this.nativeOverrideRoot(home, "GEMINI_CLI_HOME", []);
    const gemini = joinRoot(geminiHome, ".gemini", "settings.json");
    this.addGroup(
      groups,
      group("gemini", "Gemini CLI", gemini.displayPath, this.parseStandardFile("gemini", gemini)),
    );

    const openCodeRoot = this.openCodeRoot(home);
    this.addOpenCodeGroup(groups, openCodeRoot);

    const cursor = joinRoot(home, ".cursor", "mcp.json");
    this.addGroup(
      groups,
      group("cursor", "Cursor", cursor.displayPath, this.parseStandardFile("cursor", cursor)),
    );

    const copilotHome = this.nativeOverrideRoot(home, "COPILOT_HOME", [".copilot"]);
    const copilot = joinRoot(copilotHome, "mcp-config.json");
    this.addGroup(
      groups,
      group(
        "copilot",
        "GitHub Copilot",
        copilot.displayPath,
        this.parseStandardFile("copilot", copilot),
      ),
    );

    const grokHome = this.nativeOverrideRoot(home, "GROK_HOME", [".grok"]);
    const grok = joinRoot(grokHome, "config.toml");
    this.addGroup(
      groups,
      group("grok", "Grok", grok.displayPath, this.parseTomlFile("grok", grok)),
    );

    const antigravity = joinRoot(home, ".gemini", "config", "mcp_config.json");
    this.addGroup(
      groups,
      group(
        "antigravity",
        "Antigravity",
        antigravity.displayPath,
        this.parseStandardFile("antigravity", antigravity),
      ),
    );

    const commandCode = joinRoot(home, ".commandcode", "mcp.json");
    this.addGroup(
      groups,
      group(
        "commandcode",
        "Command Code",
        commandCode.displayPath,
        this.parseStandardFile("commandcode", commandCode),
      ),
    );

    return groups;
  }

  private async discoverWorkspace(location: ProjectLocation): Promise<McpExternalServerGroup[]> {
    const project = rootForProject(location);
    const groups: McpExternalServerGroup[] = [];

    const shared = joinRoot(project, ".mcp.json");
    this.addGroup(
      groups,
      group("shared", ".mcp.json", shared.displayPath, this.parseStandardFile("shared", shared)),
    );

    const codex = joinRoot(project, ".codex", "config.toml");
    this.addGroup(
      groups,
      group("codex", "Codex CLI", codex.displayPath, this.parseTomlFile("codex", codex)),
    );

    const gemini = joinRoot(project, ".gemini", "settings.json");
    this.addGroup(
      groups,
      group("gemini", "Gemini CLI", gemini.displayPath, this.parseStandardFile("gemini", gemini)),
    );

    this.addOpenCodeGroup(groups, project);

    const cursor = joinRoot(project, ".cursor", "mcp.json");
    this.addGroup(
      groups,
      group("cursor", "Cursor", cursor.displayPath, this.parseStandardFile("cursor", cursor)),
    );

    const vscode = joinRoot(project, ".vscode", "mcp.json");
    this.addGroup(
      groups,
      group(
        "vscode",
        "VS Code",
        vscode.displayPath,
        this.parseStandardFile("vscode", vscode, "servers"),
      ),
    );

    const copilot = joinRoot(project, ".github", "mcp.json");
    this.addGroup(
      groups,
      group(
        "copilot",
        "GitHub Copilot",
        copilot.displayPath,
        this.parseStandardFile("copilot", copilot),
      ),
    );

    const grok = joinRoot(project, ".grok", "config.toml");
    this.addGroup(
      groups,
      group("grok", "Grok", grok.displayPath, this.parseTomlFile("grok", grok)),
    );

    const antigravity = joinRoot(project, ".agents", "mcp_config.json");
    this.addGroup(
      groups,
      group(
        "antigravity",
        "Antigravity",
        antigravity.displayPath,
        this.parseStandardFile("antigravity", antigravity),
      ),
    );

    const home = await this.projectUserRoot(location);
    if (home) {
      const claude = joinRoot(home, ".claude.json");
      const text = this.readTextFile(claude.fsPath);
      this.addGroup(
        groups,
        group(
          "claude",
          "Claude Code",
          claude.displayPath,
          text ? parseClaudeProjectServers(claude.displayPath, text, location) : [],
        ),
      );

      const projectPath = location.kind === "wsl" ? location.linuxPath : location.path;
      const commandCode = joinRoot(
        home,
        ".commandcode",
        "projects",
        sanitizeCommandCodeCwd(projectPath),
        "mcp.json",
      );
      this.addGroup(
        groups,
        group(
          "commandcode",
          "Command Code",
          commandCode.displayPath,
          this.parseStandardFile("commandcode", commandCode),
        ),
      );
    }

    return groups;
  }

  private parseStandardFile(
    providerId: string,
    file: LocatedFile,
    containerKey: "mcpServers" | "servers" = "mcpServers",
  ): McpExternalServerCandidate[] {
    const text = this.readTextFile(file.fsPath);
    return text ? parseStandardJsonServers(providerId, file.displayPath, text, containerKey) : [];
  }

  private parseTomlFile(providerId: string, file: LocatedFile): McpExternalServerCandidate[] {
    const text = this.readTextFile(file.fsPath);
    return text ? parseTomlServers(providerId, file.displayPath, text) : [];
  }

  private addOpenCodeGroup(groups: McpExternalServerGroup[], root: LocatedRoot): void {
    const jsonc = joinRoot(root, "opencode.jsonc");
    const json = joinRoot(root, "opencode.json");
    const jsoncText = this.readTextFile(jsonc.fsPath);
    const file = jsoncText === undefined ? json : jsonc;
    const text = jsoncText ?? this.readTextFile(json.fsPath);
    if (!text) return;
    const managedFile = joinRoot(root, ".poracode-managed-mcp.json");
    const managed = managedOpenCodeNames(this.readTextFile(managedFile.fsPath));
    this.addGroup(
      groups,
      group(
        "opencode",
        "OpenCode",
        file.displayPath,
        parseOpenCodeServers(file.displayPath, text, managed),
      ),
    );
  }

  private addGroup(
    groups: McpExternalServerGroup[],
    next: McpExternalServerGroup | undefined,
  ): void {
    if (next) groups.push(next);
  }

  private hostUserRoot(): LocatedRoot {
    const home = this.homeDirectory();
    if (process.platform !== "win32") {
      return { fsPath: home, displayPath: home, style: "posix" };
    }
    return { fsPath: home, displayPath: home, style: "windows" };
  }

  private async projectUserRoot(location: ProjectLocation): Promise<LocatedRoot | undefined> {
    if (location.kind === "wsl") {
      const linuxHome = await this.resolveWslHome(location.distro);
      if (!linuxHome) return undefined;
      return {
        fsPath: this.wslFsPath(location.distro, linuxHome),
        displayPath: linuxHome,
        style: "wsl",
      };
    }
    return this.hostUserRoot();
  }

  private nativeOverrideRoot(
    home: LocatedRoot,
    envName: string,
    fallbackSegments: string[],
  ): LocatedRoot {
    if (home.style === "wsl") {
      const fallback = joinRoot(home, ...fallbackSegments);
      return { ...home, fsPath: fallback.fsPath, displayPath: fallback.displayPath };
    }
    const override = this.env[envName]?.trim();
    if (!override) {
      const fallback = joinRoot(home, ...fallbackSegments);
      return { ...home, fsPath: fallback.fsPath, displayPath: fallback.displayPath };
    }
    const resolved = nativePath(override, home.fsPath);
    return { ...home, fsPath: resolved, displayPath: resolved };
  }

  private openCodeRoot(home: LocatedRoot): LocatedRoot {
    if (home.style === "wsl") {
      const fallback = joinRoot(home, ".config", "opencode");
      return { ...home, fsPath: fallback.fsPath, displayPath: fallback.displayPath };
    }
    const configured = this.env.OPENCODE_CONFIG_DIR?.trim();
    if (configured) {
      const resolved = nativePath(configured, home.fsPath);
      return { ...home, fsPath: resolved, displayPath: resolved };
    }
    const xdg = this.env.XDG_CONFIG_HOME?.trim();
    if (!xdg) {
      const fallback = joinRoot(home, ".config", "opencode");
      return { ...home, fsPath: fallback.fsPath, displayPath: fallback.displayPath };
    }
    const resolved = nativePath(xdg, home.fsPath);
    return {
      ...home,
      fsPath: join(resolved, "opencode"),
      displayPath: join(resolved, "opencode"),
    };
  }
}
