import { OrchestratorThreadError } from "./OrchestratorThreadManager";
import type {
  ChildThreadSummary,
  CreateChildThreadRequest,
  OrchestratorThreadManager,
} from "./OrchestratorThreadManager";
import { errorResult, jsonResult, parseWaitTimeoutMs } from "./toolResult";
import type { McpToolResult, ToolSpec } from "./types";

/**
 * Orchestrator-lane tool catalog: create/manage REAL first-class app threads
 * (persisted, sidebar-visible, optionally worktree-backed), as opposed to the
 * ephemeral spawn_agent/run_agent lane. Dispatched by the shared tool registry.
 */
export const ORCHESTRATOR_TOOLS: ToolSpec[] = [
  {
    name: "create_thread",
    description:
      "Create a REAL app thread (visible to the user in the sidebar) running the given agent, optionally in its own fresh git worktree, and start it on the prompt. Returns as soon as the thread is launched — it keeps working in the background; monitor it with wait_for_thread / get_thread. Use this lane for long-lived parallel work items (e.g. one ticket per thread); use spawn_agent/run_agent for quick ephemeral helpers instead. Caps & rules: at most 8 LIVE child threads per parent — a slot frees only via close_thread or the child's session ending (a finished-but-not-closed child still holds its slot). Passing `branch` or `base_branch` implies `worktree: true`. The child INHERITS this thread's approval policy + sandbox mode (you cannot override them per call), so it runs as autonomously — or as gated — as you do. On close_thread the sidebar thread row + its worktree remain for the human (closing frees the slot, it does NOT delete work).",
    inputSchema: {
      type: "object",
      required: ["agent", "prompt"],
      properties: {
        agent: {
          type: "string",
          description: "Agent kind from list_agents (structured-execution agents only).",
        },
        prompt: { type: "string", description: "Self-contained task for the new thread." },
        title: {
          type: "string",
          description: "Optional thread title shown in the sidebar. Defaults from the prompt.",
        },
        model: {
          type: "string",
          description: "Model value from list_agents. Omit for the agent default.",
        },
        effort: { type: "string", description: "Optional effort/reasoning level." },
        worktree: {
          type: "boolean",
          description:
            "Create a dedicated git worktree (new branch) for this thread so its changes stay isolated. Default false.",
        },
        branch: {
          type: "string",
          description:
            "Custom branch name for the worktree (implies worktree=true). Auto-generated when omitted.",
        },
        base_branch: {
          type: "string",
          description:
            "Branch/ref to fork the worktree from (implies worktree=true). Defaults to the current HEAD.",
        },
      },
    },
  },
  {
    name: "list_threads",
    description:
      "List the threads you created via create_thread, with their current status and attention state.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_thread",
    description:
      "Check one of your created threads without blocking: current status, attention, error reason (when it failed), created_at / turn_started_at timestamps, a short tail of recent assistant output, and — once a turn has finished — its durable final_result (the concluding answer, kept even after close_thread). Cheap first step when a thread reports error/needs_reply: read the error + recent output here before escalating to read_thread.",
    inputSchema: {
      type: "object",
      required: ["thread_id"],
      properties: { thread_id: { type: "string" } },
    },
  },
  {
    name: "read_thread",
    description:
      "Read the tail of a created thread's transcript (last N entries, bodies truncated). Prefers the agent's native transcript when the session is live; otherwise returns a compact structured transcript (assistant/user text, tool calls, errors) reconstructed from the thread's events — so it works for every agent and even after close_thread. The user can watch the thread live in the app, so avoid polling this aggressively; use get_thread for a quick status/error check first.",
    inputSchema: {
      type: "object",
      required: ["thread_id"],
      properties: {
        thread_id: { type: "string" },
        last_messages: {
          type: "number",
          description: "How many trailing messages to return (default 20, max 100).",
        },
      },
    },
  },
  {
    name: "send_to_thread",
    description:
      "Send a message to a created thread. Starts a new turn on a settled thread, answers a thread that is waiting on your reply (needs_reply), or steers a working thread when the agent supports it; with interrupt=true, interrupts the current turn first and then sends. It does NOT resolve needs_approval tool-permission prompts (a human must approve those in the app) and errors if the thread is stuck there. Errors when the thread is busy and cannot be steered.",
    inputSchema: {
      type: "object",
      required: ["thread_id", "message"],
      properties: {
        thread_id: { type: "string" },
        message: { type: "string", description: "Message to deliver to the thread." },
        interrupt: {
          type: "boolean",
          description: "Interrupt the thread's current turn before sending. Default false.",
        },
      },
    },
  },
  {
    name: "wait_for_thread",
    description:
      "Block until ANY of the listed created threads settles (idle | finished | needs_approval | needs_reply | error | inactive) or the timeout elapses. Returns `statuses` (per thread: status, attention, and error when it failed), `settled` (the ids that are settled — i.e. which threads woke you), and `timed_out`. Returns immediately when one is already settled; call again with the still-running ids to keep waiting. Waiting does NOT free a create_thread slot — close_thread does.",
    inputSchema: {
      type: "object",
      required: ["thread_ids"],
      properties: {
        thread_ids: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 8,
          description: "Thread ids from create_thread (1-8).",
        },
        timeout_s: {
          type: "number",
          description:
            "Max seconds to wait (default 120, capped at 240). On timeout, call wait_for_thread again to keep waiting.",
        },
      },
    },
  },
  {
    name: "interrupt_thread",
    description:
      "Interrupt a created thread's current turn. The thread stays alive and addressable (send_to_thread can start a new turn).",
    inputSchema: {
      type: "object",
      required: ["thread_id"],
      properties: { thread_id: { type: "string" } },
    },
  },
  {
    name: "close_thread",
    description:
      "Close a finished child thread's runtime session to FREE ITS CAPACITY SLOT so you can create_thread again (you can have at most 8 live children per parent, and a finished-but-not-closed child keeps holding its slot). Do this once you've collected a thread's result (get_thread returns its final_result even after close). The sidebar thread row and its git worktree REMAIN for the human — this frees the slot, it does not delete the work. Mirrors closing a background worker when its task is done.",
    inputSchema: {
      type: "object",
      required: ["thread_id"],
      properties: { thread_id: { type: "string" } },
    },
  },
];

const ORCHESTRATOR_TOOL_NAMES = new Set(ORCHESTRATOR_TOOLS.map((tool) => tool.name));

export function isOrchestratorToolName(name: string): boolean {
  return ORCHESTRATOR_TOOL_NAMES.has(name);
}

export interface OrchestratorToolContext {
  parentThreadId: string;
  orchestrator: OrchestratorThreadManager;
}

function parseCreateThreadRequest(args: Record<string, unknown>): CreateChildThreadRequest {
  const agent = typeof args.agent === "string" ? args.agent : "";
  const prompt = typeof args.prompt === "string" ? args.prompt : "";
  if (!agent) throw new OrchestratorThreadError("agent is required");
  if (!prompt.trim()) throw new OrchestratorThreadError("prompt is required");
  return {
    agent,
    prompt,
    ...(typeof args.title === "string" ? { title: args.title } : {}),
    ...(typeof args.model === "string" ? { model: args.model } : {}),
    ...(typeof args.effort === "string" ? { effort: args.effort } : {}),
    ...(args.worktree === true ? { worktree: true } : {}),
    ...(typeof args.branch === "string" && args.branch.trim() ? { branch: args.branch } : {}),
    ...(typeof args.base_branch === "string" && args.base_branch.trim()
      ? { baseBranch: args.base_branch }
      : {}),
  };
}

function requireThreadId(args: Record<string, unknown>): string {
  const threadId = typeof args.thread_id === "string" ? args.thread_id : "";
  if (!threadId) throw new OrchestratorThreadError("thread_id is required");
  return threadId;
}

/**
 * Dispatch an orchestrator-lane tools/call. Mirrors the base registry's
 * contract: never throws — validation failures return isError results.
 */
export async function dispatchOrchestratorTool(
  name: string,
  args: Record<string, unknown>,
  ctx: OrchestratorToolContext,
): Promise<McpToolResult> {
  try {
    switch (name) {
      case "create_thread": {
        const request = parseCreateThreadRequest(args);
        const created = await ctx.orchestrator.createThread(ctx.parentThreadId, request);
        return jsonResult({
          thread_id: created.threadId,
          title: created.title,
          ...(created.worktreePath ? { worktree_path: created.worktreePath } : {}),
          ...(created.branch ? { branch: created.branch } : {}),
        });
      }
      case "list_threads":
        return jsonResult(ctx.orchestrator.listThreads(ctx.parentThreadId).map(toWireSummary));
      case "get_thread": {
        const summary = ctx.orchestrator.getThread(ctx.parentThreadId, requireThreadId(args));
        return jsonResult({
          ...toWireSummary(summary),
          ...(summary.recentOutput ? { recent_output: summary.recentOutput } : {}),
          ...(summary.finalResult ? { final_result: summary.finalResult } : {}),
        });
      }
      case "read_thread": {
        const lastMessages =
          typeof args.last_messages === "number" && Number.isFinite(args.last_messages)
            ? args.last_messages
            : 20;
        const result = await ctx.orchestrator.readThread(
          ctx.parentThreadId,
          requireThreadId(args),
          lastMessages,
        );
        if (result.source === "native") {
          return jsonResult({
            status: result.status,
            source: "native",
            message_count: result.messageCount,
            messages: result.messages,
          });
        }
        if (result.source === "buffer") {
          return jsonResult({
            status: result.status,
            source: "buffer",
            entry_count: result.entryCount,
            entries: result.entries,
          });
        }
        return jsonResult({ status: result.status, source: "note", note: result.note });
      }
      case "send_to_thread": {
        const message = typeof args.message === "string" ? args.message : "";
        if (!message.trim()) return errorResult("message is required");
        const { delivery } = await ctx.orchestrator.sendToThread(
          ctx.parentThreadId,
          requireThreadId(args),
          message,
          args.interrupt === true,
        );
        return jsonResult({ ok: true, delivery });
      }
      case "wait_for_thread": {
        const threadIds = Array.isArray(args.thread_ids)
          ? args.thread_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
          : [];
        const { statuses, settled, timedOut } = await ctx.orchestrator.waitForThreads(
          ctx.parentThreadId,
          threadIds,
          parseWaitTimeoutMs(args.timeout_s),
        );
        return jsonResult({ statuses, settled, timed_out: timedOut });
      }
      case "interrupt_thread": {
        await ctx.orchestrator.interruptThread(ctx.parentThreadId, requireThreadId(args));
        return jsonResult({ ok: true });
      }
      case "close_thread": {
        await ctx.orchestrator.closeThread(ctx.parentThreadId, requireThreadId(args));
        return jsonResult({ ok: true });
      }
      default:
        return errorResult(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : String(error));
  }
}

function toWireSummary(summary: ChildThreadSummary): Record<string, unknown> {
  return {
    thread_id: summary.threadId,
    title: summary.title,
    agent: summary.agent,
    status: summary.status,
    attention: summary.attention,
    created_at: summary.createdAt,
    ...(summary.worktreePath ? { worktree_path: summary.worktreePath } : {}),
    ...(summary.branch ? { branch: summary.branch } : {}),
    ...(summary.error ? { error: summary.error } : {}),
    ...(summary.turnStartedAt ? { turn_started_at: summary.turnStartedAt } : {}),
  };
}
