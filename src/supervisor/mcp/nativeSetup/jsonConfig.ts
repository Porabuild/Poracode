import { applyEdits, modify, parse, parseTree, type ParseError, type Node } from "jsonc-parser";
import type { NativeMcpConfigFile } from "./configFile";

/** Preserve unrelated properties and comments; refuse duplicate keys before editing. */
export function nativeJsonMcpConfig(
  path: string,
  entry: NativeMcpConfigFile["entry"],
  options: { comments?: boolean; defaults?: Record<string, unknown> } = {},
): NativeMcpConfigFile {
  function read(text: string): Record<string, unknown> {
    const input = text.trim() ? text : "{}";
    const errors: ParseError[] = [];
    const value: unknown = parse(input, errors, {
      disallowComments: !options.comments,
      allowTrailingComma: Boolean(options.comments),
    });
    if (errors.length || !value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid native MCP configuration");
    function check(node: Node): void {
      if (node.type === "object") {
        const keys = node.children?.map((child) => child.children?.[0]?.value) ?? [];
        // The parser discards prototype setters; never silently ignore a native entry.
        if (keys.includes("__proto__")) throw new Error("Unsupported native configuration key");
        if (keys.length !== new Set(keys).size) throw new Error("Duplicate configuration keys");
      }
      node.children?.forEach(check);
    }
    check(parseTree(input)!);
    const servers = (value as Record<string, unknown>).mcpServers;
    if (
      servers !== undefined &&
      (!servers || typeof servers !== "object" || Array.isArray(servers))
    )
      throw new Error("Invalid native MCP server table");
    return (servers ?? {}) as Record<string, unknown>;
  }
  return {
    path,
    entry,
    read,
    write(text, name, value) {
      read(text);
      const input = text.trim() ? text : JSON.stringify(options.defaults ?? {}, null, 2);
      return applyEdits(
        input,
        modify(input, ["mcpServers", name], value, {
          formattingOptions: { insertSpaces: true, tabSize: 2 },
        }),
      );
    },
  };
}
