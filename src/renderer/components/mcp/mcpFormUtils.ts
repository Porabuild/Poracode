import {
  MCP_SERVER_NAME_PATTERN,
  type McpServer,
  type McpTransport,
  type McpTransportKind,
} from "@/shared/contracts";

/** Editable form state mirroring an {@link McpServer}, with text-area buffers. */
export interface McpServerFormState {
  id: string;
  name: string;
  label: string;
  description: string;
  enabled: boolean;
  transportType: McpTransportKind;
  command: string;
  /** One argument per line. */
  argsText: string;
  /** `KEY=VALUE` per line. */
  envText: string;
  url: string;
  /** `Header-Name: value` per line. */
  headersText: string;
}

export function newServerFormState(id: string): McpServerFormState {
  return {
    id,
    name: "",
    label: "",
    description: "",
    enabled: true,
    transportType: "stdio",
    command: "",
    argsText: "",
    envText: "",
    url: "",
    headersText: "",
  };
}

function recordToLines(record: Record<string, string>, sep: string): string {
  return Object.entries(record)
    .map(([k, v]) => `${k}${sep}${v}`)
    .join("\n");
}

export function serverToFormState(server: McpServer): McpServerFormState {
  const t = server.transport;
  return {
    id: server.id,
    name: server.name,
    label: server.label ?? "",
    description: server.description ?? "",
    enabled: server.enabled !== false,
    transportType: t.type,
    command: t.type === "stdio" ? t.command : "",
    argsText: t.type === "stdio" ? t.args.join("\n") : "",
    envText: t.type === "stdio" ? recordToLines(t.env, "=") : "",
    url: t.type === "stdio" ? "" : t.url,
    headersText: t.type === "stdio" ? "" : recordToLines(t.headers, ": "),
  };
}

function parseLines(text: string, sep: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(sep);
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + sep.length).trim();
    if (key) out[key] = value;
  }
  return out;
}

function parseArgs(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export interface McpFormValidation {
  ok: boolean;
  errors: Partial<Record<"name" | "command" | "url", string>>;
}

export function validateForm(state: McpServerFormState): McpFormValidation {
  const errors: McpFormValidation["errors"] = {};
  const name = state.name.trim();
  if (!name) errors.name = "Name is required.";
  else if (!MCP_SERVER_NAME_PATTERN.test(name))
    errors.name = "Use letters, numbers, dot, dash, underscore (no spaces).";
  if (state.transportType === "stdio") {
    if (!state.command.trim()) errors.command = "Command is required.";
  } else if (!state.url.trim()) {
    errors.url = "URL is required.";
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

export function formStateToServer(
  state: McpServerFormState,
  previous?: McpServer | undefined,
): McpServer {
  const previousCwd =
    previous?.transport.type === "stdio" && state.transportType === "stdio"
      ? previous.transport.cwd
      : undefined;
  const transport: McpTransport =
    state.transportType === "stdio"
      ? {
          type: "stdio",
          command: state.command.trim(),
          args: parseArgs(state.argsText),
          env: parseLines(state.envText, "="),
          ...(previousCwd ? { cwd: previousCwd } : {}),
        }
      : {
          type: state.transportType,
          url: state.url.trim(),
          headers: parseLines(state.headersText, ":"),
        };
  const label = state.label.trim();
  const description = state.description.trim();
  return {
    id: state.id,
    name: state.name.trim(),
    enabled: state.enabled,
    transport,
    ...(previous?.agentKinds ? { agentKinds: [...previous.agentKinds] } : {}),
    ...(previous?.catalogId ? { catalogId: previous.catalogId } : {}),
    ...(label ? { label } : {}),
    ...(description ? { description } : {}),
  };
}

/** One-line summary of a transport for list rows. */
export function transportSummary(transport: McpTransport): string {
  if (transport.type === "stdio") {
    return [transport.command, ...transport.args].join(" ");
  }
  return transport.url;
}

export function transportBadge(transport: McpTransport): string {
  return transport.type.toUpperCase();
}
