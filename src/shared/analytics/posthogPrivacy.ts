export const PRODUCT_ANALYTICS_EVENT_NAMES = [
  "app.started",
  "app.view_changed",
  "app.view_duration",
  "file.opened",
  "file.overlay_toggled",
  "git.commit_created",
  "git.commit_message_generated",
  "git.overlay_toggled",
  "git.pr_created",
  "git.pr_summary_generated",
  "git.sync_action",
  "settings.opened",
  "thread.input_submitted",
  "thread.interrupted",
  "thread.started",
  "thread.turn_completed",
  "ui.project_group_toggled",
  "ui.everything_search_toggled",
  "ui.right_panel_toggled",
  "ui.right_panel_tab_changed",
  "ui.sidebar_toggled",
  "ui.thread_list_show_more",
  "ui.worktree_group_toggled",
] as const;

export type ProductAnalyticsEventName = (typeof PRODUCT_ANALYTICS_EVENT_NAMES)[number];

export type ProductAnalyticsValue = string | number | boolean | null;
export type ProductAnalyticsProperties = Record<string, ProductAnalyticsValue | undefined>;

const ALLOWED_EVENT_NAMES = new Set<string>(PRODUCT_ANALYTICS_EVENT_NAMES);
const ALLOWED_PROPERTY_KEYS = new Set([
  "$process_person_profile",
  "action",
  "add_all",
  "app_version",
  "arch",
  "attachment_segment_count",
  "attention",
  "auto_generated_message",
  "channel",
  "chrome",
  "collapsed",
  "duration_bucket",
  "duration_ms",
  "electron",
  "effort",
  "fast",
  "file_segment_count",
  "has_context_size",
  "has_effort",
  "has_remote",
  "has_session_ref",
  "has_tracking",
  "has_worktree",
  "is_dev",
  "is_draft",
  "mode",
  "node",
  "open",
  "overlay_mode",
  "outcome",
  "pane_count",
  "platform",
  "position",
  "presentation",
  "project_count",
  "provider",
  "push_after",
  "runtime_kind",
  "segment_count",
  "session_id",
  "source",
  "status",
  "tab",
  "text_segment_count",
  "thinking",
  "thread_count",
  "view_kind",
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
    const next = sanitizeValue(value);
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
