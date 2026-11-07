import { applyEdits, modify, parse, parseTree, type ParseError, type Node } from "jsonc-parser";
import type { NativeMcpConfigFile } from "./configFile";

/** Preserve unrelated properties and comments; refuse duplicate keys before editing. */
export function nativeJsonMcpConfig(
  path: string,
  entry: NativeMcpConfigFile["entry"],
  options: {
    comments?: boolean;
    defaults?: Record<string, unknown>;
    /**
     * Names the server table may use, in preference order: a file that already
     * defines one is edited there, a new file gets the first, and a file that
     * defines more than one is refused.
     */
    tableKeys?: readonly [string, ...string[]];
  } = {},
): NativeMcpConfigFile {
  const tableKeys = options.tableKeys ?? ["mcpServers"];

  function readRoot(text: string): { root: Record<string, unknown>; tableKey: string } {
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
    const root = value as Record<string, unknown>;
    const present = tableKeys.filter((key) => Object.hasOwn(root, key));
    if (present.length > 1) throw new Error("Ambiguous native MCP server tables");
    return { root, tableKey: present[0] ?? tableKeys[0] };
  }

  function read(text: string): Record<string, unknown> {
    const { root, tableKey } = readRoot(text);
    const servers = root[tableKey];
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
      // Resolve the table against the text actually being edited: an empty file
      // picks it up from `defaults` (or the first name) instead of a guess.
      const { tableKey } = readRoot(input);
      return applyEdits(
        input,
        modify(input, [tableKey, name], value, {
          formattingOptions: { insertSpaces: true, tabSize: 2 },
        }),
      );
    },
  };
}
