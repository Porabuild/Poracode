export const PRODUCT_ANALYTICS_EVENT_NAMES = [
  "app.started",
  "app.surface_duration",
  "app.surface_seen",
  "app.view_duration",
  "app.view_seen",
  "experiment.completed",
  "experiment.started",
  "experiment.winner_selected",
  "file.opened",
  "git.commit_created",
  "git.commit_message_generated",
  "git.pr_created",
  "git.pr_summary_generated",
  "git.sync_action",
  "project.added",
  "schedule.created",
  "schedule.run_requested",
  "settings.section_duration",
  "settings.section_seen",
  "thread.checkpoint_reverted",
  "thread.input_submitted",
  "thread.interrupted",
  "thread.request_resolved",
  "thread.started",
  "thread.turn_completed",
] as const;

export type ProductAnalyticsEventName = (typeof PRODUCT_ANALYTICS_EVENT_NAMES)[number];

export type ProductAnalyticsValue = string | number | boolean | null;
export type ProductAnalyticsProperties = Record<string, ProductAnalyticsValue | undefined>;

const ALLOWED_EVENT_NAMES = new Set<string>(PRODUCT_ANALYTICS_EVENT_NAMES);
const ALLOWED_PROPERTY_KEYS = new Set([
  "$process_person_profile",
  "$insert_id",
  "$session_id",
  "action",
  "add_all",
  "app_version",
  "arch",
  "attachment_segment_count",
  "attention",
  "auto_generated_message",
  "browser_mcp",
  "candidate_count",
  "channel",
  "chrome",
  "chrome_mcp",
  "cleanup_complete",
  "computer_use",
  "crossagent_mcp",
  "duration_bucket",
  "duration_ms",
  "electron",
  "effort",
  "enabled",
  "fast_mode",
  "file_segment_count",
  "has_context_size",
  "has_file_checkpoint",
  "has_project",
  "has_remote",
  "has_session_ref",
  "has_tracking",
  "has_worktree",
  "is_dev",
  "is_draft",
  "launch_kind",
  "location_kind",
  "mcp_segment_count",
  "model",
  "model_family",
  "node",
  "overlay_mode",
  "outcome",
  "pane_count",
  "permission_level",
  "platform",
  "presentation",
  "project_count",
  "provider",
  "prompt_length_bucket",
  "prompt_kind",
  "push_after",
  "recurrence",
  "request_type",
  "rollback_turn_count",
  "runtime_kind",
  "segment_count",
  "settings_section",
  "settings_scope",
  "skill_segment_count",
  "source",
  "status",
  "surface",
  "surface_lane",
  "text_segment_count",
  "thinking",
  "thread_count",
  "thread_segment_count",
  "view_kind",
  "winner_source",
  "work_mode",
  "worktree_count_bucket",
]);
const SENSITIVE_KEY_PATTERN =
  /(?:account|api[-_]?key|authorization|branch|cmd|code|command|commit|cookie|cwd|diff|email|env|file(?:name)?|home|ip|key|message|output|password|path|project(?:_?id|_?name)?|prompt|query|remote|repo|repository|secret|terminal_output|token|url|user|username|worktree(?:_?path|_?branch)?)/i;

function sanitizeString(value: string): string {
  return value
    .replace(/(?:file:\/\/)?\/(?:Users|home|private|tmp|var)\/[^\s"'<>)]*/g, "[path]")
    .replace(/[A-Za-z]:\\[^\s"'<>)]*/g, "[path]")
    .replace(/(token|secret|password|api[-_]?key|authorization)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .slice(0, 120);
}

function sanitizeValue(
  value: ProductAnalyticsValue | undefined,
): ProductAnalyticsValue | undefined {
  if (typeof value === "undefined") return undefined;
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? sanitizeString(trimmed) : undefined;
}

export function bucketDurationMs(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) return "unknown";
  const seconds = durationMs / 1000;
  if (seconds < 10) return "lt_10s";
  if (seconds < 60) return "10s_1m";
  if (seconds < 300) return "1m_5m";
  if (seconds < 900) return "5m_15m";
  if (seconds < 1800) return "15m_30m";
  if (seconds < 3600) return "30m_1h";
  return "gte_1h";
}

export function bucketCount(count: number): string {
  if (!Number.isFinite(count) || count < 0) return "unknown";
  if (count === 0) return "0";
  if (count === 1) return "1";
  if (count <= 3) return "2_3";
  if (count <= 10) return "4_10";
  return "gt_10";
}

export function bucketPromptLength(length: number): string {
  if (!Number.isFinite(length) || length < 0) return "unknown";
  if (length === 0) return "0";
  if (length <= 50) return "1_50";
  if (length <= 200) return "51_200";
  if (length <= 1_000) return "201_1000";
  if (length <= 4_000) return "1001_4000";
  return "gt_4000";
}

export function classifyModelFamily(model: string | undefined): string {
  const normalized = normalizeModelId(model);
  if (!normalized || normalized === "auto" || normalized === "default") return "default";
  const unnamespaced = normalized.includes("/")
    ? normalized.slice(normalized.lastIndexOf("/") + 1)
    : normalized;
  if (/^(?:claude|sonnet|opus|haiku|fable)(?:[-._]|$)/.test(unnamespaced)) return "claude";
  if (/^(?:gemini|gemma)(?:[-._]|$)/.test(unnamespaced)) return "gemini";
  if (/^(?:qwen|qwq)/.test(unnamespaced)) return "qwen";
  if (/^deepseek(?:[-._]|$)/.test(unnamespaced)) return "deepseek";
  if (/^(?:kimi|moonshot)(?:[-._]|$)/.test(unnamespaced)) return "kimi";
  if (/^minimax(?:[-._]|$)/.test(unnamespaced)) return "minimax";
  if (/^(?:glm|chatglm)(?:[-._]|$)/.test(unnamespaced)) return "glm";
  if (/^composer(?:[-._]|$)/.test(unnamespaced)) return "composer";
  if (/^grok(?:[-._]|$)/.test(unnamespaced)) return "xai";
  if (/^llama(?:[-._]|$)/.test(unnamespaced)) return "meta";
  if (/^mistral(?:[-._]|$)/.test(unnamespaced)) return "mistral";
  if (
    /^(?:gpt|codex|chatgpt)(?:[-._]|$)/.test(unnamespaced) ||
    /^o(?:1|3|4)(?:[-._]|$)/.test(unnamespaced)
  ) {
    return "openai";
  }
  return "other";
}

const PUBLIC_MODEL_NAMESPACES = new Set([
  "anthropic",
  "cursor",
  "deepseek",
  "google",
  "meta",
  "mistral",
  "moonshotai",
  "openai",
  "qwen",
  "xai",
]);

const PUBLIC_MODEL_WORDS = new Set([
  "air",
  "auto",
  "chat",
  "chatglm",
  "chatgpt",
  "claude",
  "code",
  "coder",
  "codex",
  "composer",
  "deepseek",
  "exp",
  "experimental",
  "fable",
  "fast",
  "flash",
  "gemini",
  "gemma",
  "glm",
  "gpt",
  "grok",
  "haiku",
  "high",
  "instruct",
  "k",
  "kimi",
  "latest",
  "lite",
  "llama",
  "low",
  "luna",
  "max",
  "medium",
  "mini",
  "minimax",
  "mistral",
  "moonshot",
  "nano",
  "oss",
  "opus",
  "preview",
  "pro",
  "qwq",
  "qwen",
  "reasoning",
  "sol",
  "sonnet",
  "spark",
  "terra",
  "thinking",
  "turbo",
  "ultra",
  "vision",
  "xhigh",
]);

function normalizeModelId(model: string | undefined): string {
  return (model?.trim().toLowerCase() ?? "")
    .replace(/\[[^\]]*]/g, "")
    .replace(/\((?:anthropic|google|openai)\)$/i, "")
    .trim();
}

function isPublicModelId(model: string): boolean {
  if (model === "auto" || model === "default") return true;
  const namespaceSeparator = model.lastIndexOf("/");
  const namespace = namespaceSeparator >= 0 ? model.slice(0, namespaceSeparator) : "";
  const id = namespaceSeparator >= 0 ? model.slice(namespaceSeparator + 1) : model;
  if (namespace && !PUBLIC_MODEL_NAMESPACES.has(namespace)) return false;
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(id) || id.length > 80) return false;
  const tokens = id.split(/[-._]+/).filter(Boolean);
  return (
    tokens.length > 0 &&
    tokens.every(
      (token) =>
        /^\d+[a-z]?$/.test(token) ||
        /^(?:k\d+[a-z]?|o[134]|qwen\d+[a-z]?|v\d+[a-z]?)$/.test(token) ||
        PUBLIC_MODEL_WORDS.has(token),
    )
  );
}

export function classifyAnalyticsModel(model: string | undefined): string {
  const normalized = normalizeModelId(model);
  if (!normalized || normalized === "auto" || normalized === "default") return "default";
  return classifyModelFamily(normalized) !== "other" && isPublicModelId(normalized)
    ? normalized
    : "other";
}

const COMPOSER_EFFORT_VALUES = new Set([
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "none",
  "ultra",
  "ultracode",
]);

export function normalizeComposerEffort(effort: string | undefined): string {
  if (!effort?.trim()) return "default";
  const normalized = effort.trim().toLowerCase();
  return COMPOSER_EFFORT_VALUES.has(normalized) ? normalized : "other";
}

export function normalizeComposerFastMode(fast: boolean | undefined): "off" | "on" {
  return fast === true ? "on" : "off";
}

export function normalizeComposerWorkMode(mode: string | undefined): "plan" | "work" {
  return mode?.trim().toLowerCase() === "plan" ? "plan" : "work";
}

const ANALYTICS_PROVIDER_IDS = new Set([
  "acp-generic",
  "antigravity",
  "claude",
  "codex",
  "commandcode",
  "copilot",
  "cursor",
  "factory",
  "gemini",
  "grok",
  "kimi",
  "opencode",
  "pi",
  "qoder",
  "qwen",
]);

export function normalizeAnalyticsProvider(provider: string | undefined): string {
  const normalized = provider?.trim().toLowerCase() ?? "";
  const separatorIndex = normalized.indexOf(":");
  const base = separatorIndex > 0 ? normalized.slice(0, separatorIndex) : normalized;
  return ANALYTICS_PROVIDER_IDS.has(base) ? base : "other";
}

const COMPOSER_PERMISSION_VALUES = new Map<string, string>([
  ["ask for approval", "ask_for_approval"],
  ["ask permissions", "ask_for_approval"],
  ["ask_for_approval", "ask_for_approval"],
  ["auto", "auto_approve"],
  ["auto approve", "auto_approve"],
  ["auto edit", "auto_approve"],
  ["auto mode", "auto_approve"],
  ["auto review", "auto_review"],
  ["auto-edit", "auto_approve"],
  ["auto-review", "auto_review"],
  ["auto_edit", "auto_approve"],
  ["auto_approve", "auto_approve"],
  ["auto_review", "auto_review"],
  ["bypass permissions", "full_access"],
  ["bypasspermissions", "full_access"],
  ["default", "supervised"],
  ["default permissions", "default_permissions"],
  ["default-permissions", "default_permissions"],
  ["default_permissions", "default_permissions"],
  ["full access", "full_access"],
  ["full-access", "full_access"],
  ["full_access", "full_access"],
  ["review-on-request", "ask_for_approval"],
  ["supervised", "supervised"],
  ["yolo", "full_access"],
]);

export function normalizeComposerPermission(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  return COMPOSER_PERMISSION_VALUES.get(normalized) ?? "other";
}

export function sanitizeProductAnalyticsProperties(
  properties: ProductAnalyticsProperties,
): Record<string, ProductAnalyticsValue> {
  const sanitized: Record<string, ProductAnalyticsValue> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!ALLOWED_PROPERTY_KEYS.has(key)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        continue;
      }
      continue;
    }
    const normalizedValue =
      key === "provider" && typeof value === "string"
        ? normalizeAnalyticsProvider(value)
        : key === "model" && typeof value === "string"
          ? classifyAnalyticsModel(value)
          : key === "effort" && typeof value === "string"
            ? normalizeComposerEffort(value)
            : value;
    const next = sanitizeValue(normalizedValue);
    if (typeof next !== "undefined") {
      sanitized[key] = next;
    }
  }
  return sanitized;
}

export function sanitizeProductAnalyticsEvent(
  event: ProductAnalyticsEventName,
  properties: ProductAnalyticsProperties = {},
): {
  event: ProductAnalyticsEventName;
  properties: Record<string, ProductAnalyticsValue>;
} | null {
  if (!ALLOWED_EVENT_NAMES.has(event)) return null;
  return {
    event,
    properties: sanitizeProductAnalyticsProperties(properties),
  };
}
