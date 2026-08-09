import type {
  StreamableHttpMcpToolResult,
  StreamableHttpMcpToolSpec,
} from "../../mcp/StreamableHttpMcpIngress";
import { agentTools } from "./tools/agents";
import { appTools } from "./tools/app";
import { fileTools } from "./tools/files";
import { gitTools } from "./tools/git";
import { githubTools } from "./tools/github";
import { mcpServerTools } from "./tools/mcpServers";
import { projectTools } from "./tools/projects";
import { scheduleTools } from "./tools/schedules";
import { searchTools } from "./tools/search";
import { settingsTools } from "./tools/settings";
import { skillTools } from "./tools/skills";
import { threadTools } from "./tools/threads";
import { usageTools } from "./tools/usage";
import type { AppControlsToolContext, ToolDomain, ToolHandler } from "./tools/types";

export { APP_CONTROLS_MCP_SERVER_INFO } from "./tools/serverInfo";
export type {
  AppControlsToolContext,
  AppControlsSupervisorCaller,
  AppControlsAppInfo,
  AppControlsNotifyResult,
  AppControlsSettingsGateway,
  AppControlsUpdateCheck,
} from "./tools/types";

export const APP_CONTROLS_MCP_INSTRUCTIONS =
  "Poracode app controls. Read and control the running app: device schedules " +
  "(list/create/update/run/delete), app threads (current/list/get/read/create/send/interrupt/stop/wait/" +
  "update/open), projects (list/get/create/update), app settings (get/update), provider usage " +
  "(get_usage), cross-app search (search), and app info (get_app_info). You can also read a " +
  "terminal thread's scrollback, queue steer guidance, stage composer input, or roll back turns; " +
  "read project files (list/read/find); list installed CLI agents; and notify the user or check " +
  "for app updates. You can also drive a project's git (status/diff/stage/commit/branch/sync and " +
  "worktree list/merge/remove), its GitHub pull requests via the gh CLI (list/get/create/comment/" +
  "merge/update), the user's configured MCP servers (list/probe/add/update/remove — MCP servers " +
  "are managed with these dedicated tools, not update_settings), and installed skills (list/" +
  "enable). Threads and projects are " +
  "the user's own work, visible in their sidebar; treat them as shared state. Explain " +
  "consequential or destructive actions — stopping or interrupting another thread, archiving, " +
  "marking done, creating a project, or changing settings — to the user before doing them, and " +
  "never delete their work without asking. update_settings changes apply immediately app-wide. " +
  "Secrets are never exposed: get_settings redacts profile credentials and update_settings " +
  "refuses to touch them. Schedules run only while the device is awake and Poracode is open. " +
  "You cannot stop, interrupt, or wait on your own thread. Treat @Terminal, or its localized " +
  "equivalent inserted by the composer, as a request to inspect terminal scrollback for the " +
  "caller's current worktree, not as a file mention or literal name. " +
  "For @Terminal: (1) call get_current_thread to learn the caller's threadId, project, worktree, " +
  "and presentation mode; an absent worktreePath means the project's main checkout, and you " +
  "should never ask the user for these ids. (2) Call list_threads with " +
  "currentWorktree=true. (3) From that result, consider only terminal-presentation threads; start " +
  "with the caller when it is terminal-backed, then inspect the most relevant active or recently " +
  "updated sibling terminals instead of reading every old or archived thread. If the caller is a " +
  "structured/GUI thread, inspect relevant terminal siblings in the same worktree. (4) Call " +
  "read_terminal with no threadId for the caller, or with a sibling's threadId. Read additional " +
  "terminals only when needed. (5) Report the useful evidence with the source thread title/id, " +
  "distinguish observed output from inference, and do not echo secrets or dump the entire raw " +
  "scrollback. A missing terminal means that thread is GUI-backed, stopped, or has no live PTY; " +
  "continue with another relevant terminal when available.";

const DOMAINS: readonly ToolDomain[] = [
  scheduleTools,
  threadTools,
  projectTools,
  settingsTools,
  usageTools,
  searchTools,
  appTools,
  fileTools,
  agentTools,
  gitTools,
  githubTools,
  mcpServerTools,
  skillTools,
];

export const TOOLS: readonly StreamableHttpMcpToolSpec[] = DOMAINS.flatMap(
  (domain) => domain.specs,
);

const HANDLERS: Record<string, ToolHandler> = Object.fromEntries(
  DOMAINS.flatMap((domain) => Object.entries(domain.handlers)),
);

const TOOL_NAMES = new Set(TOOLS.map((tool) => tool.name));

export function isKnownToolName(name: string): boolean {
  return TOOL_NAMES.has(name);
}

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AppControlsToolContext,
): Promise<unknown> {
  const handler = HANDLERS[name];
  if (!handler) throw new Error(`Unknown tool: ${name}`);
  return handler(args, ctx);
}

export function formatToolResult(_name: string, result: unknown): StreamableHttpMcpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}
