export const OPENCODE_BROWSER_MCP_SETTING_KEY = "browserMcp";
export const OPENCODE_BROWSER_MCP_DEFAULT = true;

export function isOpenCodeBrowserMcpEnabled(
  settings: Record<string, boolean | string> | undefined,
): boolean {
  const value = settings?.[OPENCODE_BROWSER_MCP_SETTING_KEY];
  return typeof value === "boolean" ? value : OPENCODE_BROWSER_MCP_DEFAULT;
}
