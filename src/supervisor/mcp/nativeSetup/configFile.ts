import type { McpServer } from "@/shared/contracts";

/** Native dialects own parsing, surgical edits, and representable server options. */
export interface NativeMcpConfigFile {
  path: string;
  read(text: string): Record<string, unknown>;
  write(text: string, name: string, entry: unknown | undefined): string;
  entry(server: McpServer): unknown;
}
