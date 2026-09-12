import { homedir } from "node:os";
import { join } from "node:path";
import { parse, stringify } from "smol-toml";
import { digest } from "../../mcp/nativeSetup/installation";
import type { NativeMcpConfigFile } from "../../mcp/nativeSetup/configFile";

function markers(name: string) {
  const id = digest(name).slice(0, 16);
  return [`# BEGIN Poracode MCP ${id}`, `# END Poracode MCP ${id}`] as const;
}
export function grokNativeMcpConfig(
  path = join(process.env.GROK_HOME || join(homedir(), ".grok"), "config.toml"),
): NativeMcpConfigFile {
  return {
    path,
    read(text) {
      const servers = parse(text).mcp_servers ?? {};
      if (!servers || typeof servers !== "object" || Array.isArray(servers))
        throw new Error("Invalid native MCP table");
      return Object.fromEntries(
        Object.entries(servers).map(([name, value]) => {
          const [start, end] = markers(name);
          const from = text.indexOf(start),
            to = text.indexOf(end);
          if (
            from < 0 !== to < 0 ||
            (from >= 0 && to < from) ||
            (from >= 0 && (text.indexOf(start, from + 1) >= 0 || text.indexOf(end, to + 1) >= 0))
          )
            throw new Error("Invalid native MCP ownership markers");
          // The exact owned block participates in ownership, including user comments.
          return [name, { value, block: from < 0 ? null : text.slice(from, to + end.length) }];
        }),
      );
    },
    write(text, name, entry) {
      const [start, end] = markers(name);
      const from = text.indexOf(start),
        to = text.indexOf(end);
      const rest =
        from < 0 ? text : text.slice(0, from) + text.slice(to + end.length).replace(/^\r?\n/u, "");
      if (entry === undefined) return rest;
      return `${rest}${rest && !rest.endsWith("\n") ? "\n" : ""}${start}\n${stringify({ mcp_servers: { [name]: entry } } as Parameters<typeof stringify>[0])}${end}\n`;
    },
    entry(server) {
      if (server.disabledTools?.length)
        throw new Error("Tool restrictions are not supported by native setup");
      const { type, ...transport } = server.transport;
      if (type === "sse") throw new Error("SSE is not supported by native setup");
      if ("cwd" in transport && transport.cwd)
        throw new Error("Working directory is not supported by native setup");
      return {
        ...transport,
        startup_timeout_sec: Math.ceil(server.timeoutMs / 1000),
        tool_timeout_sec: Math.ceil(server.timeoutMs / 1000),
      };
    },
  };
}
