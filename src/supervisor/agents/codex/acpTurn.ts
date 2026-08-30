import type { PromptSegment, ThreadConfig } from "@/shared/contracts";
import { inlinePromptSegmentText } from "@/shared/promptContent";
import { toCodexSandboxPolicy } from "./acpProtocol";
import type { CodexClientRequestMap } from "./protocol";

type TurnStartParams = CodexClientRequestMap["turn/start"]["params"];

// Codex's `turn/start` requires a non-empty `developer_instructions` string
// inside `collaborationMode.settings`. We send these on every turn so that
// switching between Plan and Default mode mid-session takes effect.
const PLAN_MODE_DEVELOPER_INSTRUCTIONS =
  "You are operating in plan mode. Produce a clear, step-by-step plan for the user's request. Do not edit files, run shell commands, or call mutating tools — gather context with read-only tools as needed, then present the plan and wait for the user to approve before executing any changes.";

const DEFAULT_MODE_DEVELOPER_INSTRUCTIONS =
  "You are operating in default mode. Any prior plan-mode instructions no longer apply: you may edit files, run commands, and use mutating tools as appropriate to fulfill the user's request.";

// Codex `/goal` is a Codex CLI feature (experimental, gated by --enable goals).
// We mirror the TUI's sub-commands inline so the user can type them in the
// composer; the actual state lives in the Codex app-server.
export type CodexGoalCommand =
  | { kind: "set"; objective: string }
  | { kind: "clear" }
  | { kind: "view" }
  | { kind: "pause" }
  | { kind: "resume" };

export function parseCodexGoalCommand(prompt: string): CodexGoalCommand | undefined {
  const match = /^\/goal(?:\s+([\s\S]*))?$/u.exec(prompt.trim());
  if (!match) return undefined;
  const rawArgs = match[1]?.trim() ?? "";
  if (rawArgs.length === 0) return { kind: "view" };
  if (/^(clear|reset|off|none)$/iu.test(rawArgs)) return { kind: "clear" };
  if (/^pause$/iu.test(rawArgs)) return { kind: "pause" };
  if (/^resume$/iu.test(rawArgs)) return { kind: "resume" };
  return { kind: "set", objective: rawArgs };
}

export function buildCodexTurnInput(
  prompt: string,
  segments: PromptSegment[] | undefined,
  inlineInstructions?: string,
): TurnStartParams["input"] {
  const input: TurnStartParams["input"] = [];
  // Codex's `skill` input requires an on-disk path. A pathless (provider-native)
  // skill segment therefore rides along as its plain invocation text instead.
  const hasSkillSegment =
    segments?.some((segment) => segment.kind === "skill" && segment.path !== undefined) === true;

  for (const seg of segments ?? []) {
    if (seg.kind === "attachment") {
      if (isImagePath(seg.path)) {
        input.push({ type: "localImage", path: seg.path });
      } else {
        input.push({
          type: "mention",
          path: seg.path,
          name: fileName(seg.path),
        });
      }
    } else if (seg.kind === "file") {
      input.push({
        type: "mention",
        path: seg.path,
        name: fileName(seg.path),
      });
    } else if (seg.kind === "skill" && seg.path !== undefined) {
      input.push({ type: "skill", name: seg.name, path: seg.path });
    }
  }

  // When a skill segment is present the outgoing text is rebuilt from segments
  // (skills/files/attachments already went into `input` structurally). MCP
  // mentions have no Codex input type, so their `@Name` directive must ride
  // along here as text — otherwise it would be silently dropped.
  const text = hasSkillSegment
    ? (segments ?? [])
        .flatMap((segment) =>
          segment.kind === "text" ||
          segment.kind === "diff_comment" ||
          segment.kind === "mcp" ||
          (segment.kind === "skill" && segment.path === undefined)
            ? [inlinePromptSegmentText(segment)]
            : [],
        )
        .join("")
        .trim()
    : prompt;
  if (text.length > 0) input.push({ type: "text", text, text_elements: [] });
  // Portable-skills fallback: appended to the provider payload only, never to
  // the painted user_message (see StartTurnOptions.inlineInstructions).
  if (inlineInstructions) input.push({ type: "text", text: inlineInstructions, text_elements: [] });
  return input;
}

export function buildCodexCollaborationMode(
  config: ThreadConfig,
): NonNullable<TurnStartParams["collaborationMode"]> {
  return {
    mode: config.mode === "plan" ? "plan" : "default",
    settings: {
      model: config.model,
      reasoning_effort: config.effort ?? "medium",
      developer_instructions:
        config.mode === "plan"
          ? PLAN_MODE_DEVELOPER_INSTRUCTIONS
          : DEFAULT_MODE_DEVELOPER_INSTRUCTIONS,
    },
  };
}

/**
 * Settings overrides shared by `turn/start` ("this turn and subsequent
 * turns") and the steer-time `thread/settings/update` ("subsequent turns").
 * `turn/steer` carries no settings fields, so mid-turn composer changes reach
 * the thread only through that update — it must mirror `turn/start` exactly
 * or a steer would leave stale effort/sandbox/approval/mode settings (and
 * collab subagents, which inherit `collaborationMode.settings`) behind.
 * Fields `turn/start` never sends (cwd, permissions, personality) stay out:
 * `permissions` cannot even be combined with `sandboxPolicy`.
 */
type CodexTurnSettingsOverrides = Pick<
  TurnStartParams,
  | "model"
  | "effort"
  | "summary"
  | "approvalPolicy"
  | "approvalsReviewer"
  | "sandboxPolicy"
  | "collaborationMode"
  | "serviceTier"
>;

export function buildCodexTurnSettingsOverrides(config: ThreadConfig): CodexTurnSettingsOverrides {
  const sandboxPolicy = toCodexSandboxPolicy(config.sandboxMode);
  return {
    model: config.model,
    ...(config.effort ? { effort: config.effort } : {}),
    summary: "auto",
    ...(config.approvalPolicy
      ? { approvalPolicy: config.approvalPolicy as NonNullable<TurnStartParams["approvalPolicy"]> }
      : {}),
    ...(config.approvalsReviewer
      ? {
          approvalsReviewer: config.approvalsReviewer as NonNullable<
            TurnStartParams["approvalsReviewer"]
          >,
        }
      : {}),
    ...(sandboxPolicy
      ? { sandboxPolicy: sandboxPolicy as NonNullable<TurnStartParams["sandboxPolicy"]> }
      : {}),
    collaborationMode: buildCodexCollaborationMode(config),
    serviceTier: config.fast === true ? "fast" : null,
  };
}

function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(path);
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}
