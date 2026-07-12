import {
  DEFAULT_MCP_SERVER_TIMEOUT_MS,
  MCP_SERVER_NAME_PATTERN,
  isReservedMcpServerName,
  isValidMcpServerUrl,
  mcpServerSchema,
  type McpServer,
  type McpTransport,
  type McpTransportKind,
} from "@/shared/contracts";

export interface McpServerFormState {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  timeoutMs: string;
  transportType: McpTransportKind;
  command: string;
  argsText: string;
  envText: string;
  url: string;
  headersText: string;
}

export type McpFormErrorCode =
  | "name-required"
  | "name-invalid"
  | "name-reserved"
  | "name-duplicate"
  | "command-required"
  | "url-required"
  | "url-invalid"
  | "env-invalid"
  | "headers-invalid"
  | "timeout-invalid";

export interface McpFormValidation {
  valid: boolean;
  errors: Partial<
    Record<"name" | "command" | "url" | "envText" | "headersText" | "timeoutMs", McpFormErrorCode>
  >;
}

export function newMcpServerFormState(id: string): McpServerFormState {
  return {
    id,
    name: "",
    description: "",
    enabled: true,
    timeoutMs: String(DEFAULT_MCP_SERVER_TIMEOUT_MS),
    transportType: "stdio",
    command: "",
    argsText: "",
    envText: "",
    url: "",
    headersText: "",
  };
}

function recordToLines(record: Record<string, string>, separator: string): string {
  return Object.entries(record)
    .map(([key, value]) => `${key}${separator}${value}`)
    .join("\n");
}

function quoteArgument(value: string): string {
  return JSON.stringify(value);
}

export function mcpServerToFormState(server: McpServer): McpServerFormState {
  const transport = server.transport;
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    enabled: server.enabled,
    timeoutMs: String(server.timeoutMs),
    transportType: transport.type,
    command: transport.type === "stdio" ? transport.command : "",
    argsText: transport.type === "stdio" ? transport.args.map(quoteArgument).join(" ") : "",
    envText: transport.type === "stdio" ? recordToLines(transport.env, "=") : "",
    url: transport.type === "stdio" ? "" : transport.url,
    headersText: transport.type === "stdio" ? "" : recordToLines(transport.headers, ": "),
  };
}

function parseRecordLines(text: string, separator: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf(separator);
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + separator.length).trim();
    if (key) result[key] = value;
  }
  return result;
}

function hasValidRecordLines(text: string, separator: string): boolean {
  return text.split(/\r?\n/u).every((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    const index = trimmed.indexOf(separator);
    return index > 0 && trimmed.slice(0, index).trim().length > 0;
  });
}

/** Parse a compact command-line argument field without involving a shell. */
export function parseMcpArguments(value: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let tokenStarted = false;

  const push = () => {
    if (tokenStarted) args.push(current);
    current = "";
    tokenStarted = false;
  };

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (quote === '"' && character === "\\") {
      const escaped = value[index + 1];
      if (escaped === undefined) {
        current += "\\";
        continue;
      }
      if (escaped === '"' || escaped === "\\") {
        current += escaped;
        index += 1;
      } else {
        current += "\\";
      }
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      tokenStarted = true;
      continue;
    }
    if (/\s/u.test(character)) {
      push();
      continue;
    }
    current += character;
    tokenStarted = true;
  }
  push();
  return args;
}

export function validateMcpServerForm(
  state: McpServerFormState,
  existingNames: ReadonlySet<string>,
  previousName?: string,
): McpFormValidation {
  const errors: McpFormValidation["errors"] = {};
  const name = state.name.trim();
  const normalizedName = name.toLowerCase();
  if (!name) errors.name = "name-required";
  else if (!MCP_SERVER_NAME_PATTERN.test(name)) errors.name = "name-invalid";
  else if (isReservedMcpServerName(name)) errors.name = "name-reserved";
  else if (
    normalizedName !== previousName?.trim().toLowerCase() &&
    existingNames.has(normalizedName)
  ) {
    errors.name = "name-duplicate";
  }

  if (state.transportType === "stdio" && !state.command.trim()) {
    errors.command = "command-required";
  }
  if (state.transportType === "stdio" && !hasValidRecordLines(state.envText, "=")) {
    errors.envText = "env-invalid";
  }
  if (state.transportType !== "stdio") {
    if (!state.url.trim()) errors.url = "url-required";
    else if (!isValidMcpServerUrl(state.url)) errors.url = "url-invalid";
  }
  if (state.transportType !== "stdio" && !hasValidRecordLines(state.headersText, ":")) {
    errors.headersText = "headers-invalid";
  }
  const timeoutMs = Number(state.timeoutMs);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    errors.timeoutMs = "timeout-invalid";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export function mcpFormStateToServer(state: McpServerFormState, previous?: McpServer): McpServer {
  const previousCwd =
    previous?.transport.type === "stdio" && state.transportType === "stdio"
      ? previous.transport.cwd
      : undefined;
  const transport: McpTransport =
    state.transportType === "stdio"
      ? {
          type: "stdio",
          command: state.command.trim(),
          args: parseMcpArguments(state.argsText),
          env: parseRecordLines(state.envText, "="),
          ...(previousCwd ? { cwd: previousCwd } : {}),
        }
      : {
          type: state.transportType,
          url: state.url.trim(),
          headers: parseRecordLines(state.headersText, ":"),
        };
  return {
    id: state.id,
    name: state.name.trim(),
    description: state.description.trim(),
    enabled: state.enabled,
    timeoutMs: Number(state.timeoutMs),
    transport,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Normalize legacy aliases (`httpUrl`/`serverUrl` → `url`, `timeout` →
 * `timeoutMs`, `disabled` → `enabled`) into a candidate object and let the
 * shared `mcpServerSchema` do the actual validation, so the accepted shape
 * cannot drift from the canonical contract.
 */
function jsonEntryToServer(name: string, value: unknown, id: string): McpServer | undefined {
  if (!isRecord(value)) return undefined;
  if (value.description !== undefined && typeof value.description !== "string") return undefined;
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") return undefined;
  if (value.disabled !== undefined && typeof value.disabled !== "boolean") return undefined;
  const command = typeof value.command === "string" ? value.command.trim() : "";
  const declaredType = value.type;
  const url =
    (typeof value.httpUrl === "string" ? value.httpUrl.trim() : undefined) ??
    (typeof value.url === "string" ? value.url.trim() : undefined) ??
    (typeof value.serverUrl === "string" ? value.serverUrl.trim() : undefined);
  let transport: Record<string, unknown> | undefined;
  if (command) {
    if (declaredType !== undefined && declaredType !== "stdio") return undefined;
    const cwd = typeof value.cwd === "string" ? value.cwd.trim() : value.cwd;
    transport = {
      type: "stdio",
      command,
      ...(value.args !== undefined ? { args: value.args } : {}),
      ...(value.env !== undefined ? { env: value.env } : {}),
      ...(cwd !== undefined ? { cwd } : {}),
    };
  } else if (url) {
    if (declaredType !== undefined && declaredType !== "http" && declaredType !== "sse") {
      return undefined;
    }
    transport = {
      type: declaredType === "sse" ? "sse" : "http",
      url,
      ...(value.headers !== undefined ? { headers: value.headers } : {}),
    };
  }
  if (!transport) return undefined;

  const timeoutMs = value.timeoutMs ?? value.timeout;
  const parsed = mcpServerSchema.safeParse({
    id,
    name,
    ...(typeof value.description === "string" ? { description: value.description.trim() } : {}),
    enabled: value.enabled !== false && value.disabled !== true,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    transport,
  });
  return parsed.success ? parsed.data : undefined;
}

export type McpJsonParseResult =
  | { ok: true; servers: McpServer[] }
  | { ok: false; error: "invalid-json" | "invalid-shape" | "invalid-server" };

/** Accept either `{name: config}` or `{mcpServers: {name: config}}`. */
export function parseMcpServersJson(
  text: string,
  createId: () => string = () => crypto.randomUUID(),
): McpJsonParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "invalid-json" };
  }
  if (!isRecord(parsed)) return { ok: false, error: "invalid-shape" };
  const wrapped = parsed.mcpServers;
  const wrappedLooksLikeServer =
    isRecord(wrapped) &&
    (typeof wrapped.command === "string" ||
      typeof wrapped.url === "string" ||
      typeof wrapped.httpUrl === "string" ||
      typeof wrapped.serverUrl === "string");
  const container = isRecord(wrapped) && !wrappedLooksLikeServer ? wrapped : parsed;
  const entries = Object.entries(container);
  if (entries.length === 0) return { ok: false, error: "invalid-shape" };

  const seen = new Set<string>();
  const servers: McpServer[] = [];
  for (const [name, value] of entries) {
    const normalizedName = name.toLowerCase();
    if (
      !MCP_SERVER_NAME_PATTERN.test(name) ||
      isReservedMcpServerName(name) ||
      seen.has(normalizedName)
    ) {
      return { ok: false, error: "invalid-server" };
    }
    const server = jsonEntryToServer(name, value, createId());
    if (!server) return { ok: false, error: "invalid-server" };
    seen.add(normalizedName);
    servers.push(server);
  }
  return { ok: true, servers };
}

function serverToJsonEntry(server: McpServer): Record<string, unknown> {
  const transport = server.transport;
  return {
    type: transport.type,
    ...(transport.type === "stdio"
      ? {
          command: transport.command,
          args: transport.args,
          ...(Object.keys(transport.env).length > 0 ? { env: transport.env } : {}),
          ...(transport.cwd ? { cwd: transport.cwd } : {}),
        }
      : {
          url: transport.url,
          ...(Object.keys(transport.headers).length > 0 ? { headers: transport.headers } : {}),
        }),
    timeoutMs: server.timeoutMs,
    ...(server.description ? { description: server.description } : {}),
    ...(server.enabled ? {} : { enabled: false }),
  };
}

export function serializeMcpServersJson(servers: readonly McpServer[]): string {
  return JSON.stringify(
    {
      mcpServers: Object.fromEntries(
        servers.map((server) => [server.name, serverToJsonEntry(server)]),
      ),
    },
    null,
    2,
  );
}

export function mcpTransportSummary(transport: McpTransport): string {
  return transport.type === "stdio"
    ? [transport.command, ...transport.args].join(" ")
    : transport.url;
}
