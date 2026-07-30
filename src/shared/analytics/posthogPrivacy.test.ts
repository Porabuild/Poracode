import { describe, expect, it } from "vitest";
import {
  bucketCount,
  bucketDurationMs,
  bucketPromptLength,
  classifyAnalyticsModel,
  classifyModelFamily,
  normalizeAnalyticsProvider,
  normalizeComposerEffort,
  normalizeComposerFastMode,
  normalizeComposerPermission,
  normalizeComposerWorkMode,
  sanitizeProductAnalyticsEvent,
  sanitizeProductAnalyticsProperties,
} from "./posthogPrivacy";

describe("posthog product analytics privacy", () => {
  it("keeps only allowlisted product analytics properties", () => {
    expect(
      sanitizeProductAnalyticsProperties({
        provider: "codex",
        presentation: "gui",
        effort: "high",
        project_id: "secret",
        repo: "secret-repo",
        prompt: "do something",
        code: "const token = 1",
        branch: "feature/private",
      }),
    ).toEqual({
      provider: "codex",
      presentation: "gui",
      effort: "high",
    });
  });

  it("keeps allowlisted keys that include sensitive words", () => {
    expect(
      sanitizeProductAnalyticsProperties({
        auto_generated_message: true,
        browser_mcp: true,
        file_segment_count: 2,
        has_remote: true,
        has_worktree: true,
        mcp_segment_count: 1,
        skill_segment_count: 1,
        worktree_count_bucket: "2_3",
      }),
    ).toEqual({
      auto_generated_message: true,
      browser_mcp: true,
      file_segment_count: 2,
      has_remote: true,
      has_worktree: true,
      mcp_segment_count: 1,
      skill_segment_count: 1,
      worktree_count_bucket: "2_3",
    });
  });

  it("scrubs sensitive strings even for allowlisted keys", () => {
    expect(
      sanitizeProductAnalyticsProperties({
        source: "/Users/alice/private-repo/src/app.ts token=abc123",
        action: "Bearer abcdef",
      }),
    ).toEqual({
      source: "[path] token=[redacted]",
      action: "Bearer [redacted]",
    });
  });

  it("drops unknown properties regardless of key sensitivity", () => {
    expect(
      sanitizeProductAnalyticsProperties({
        approval_policy: "on-request",
        custom_count: 1,
        fast: true,
        mode: "agent",
        repo: "secret-repo",
        sandbox_mode: "workspace-write",
        worktree_path: "/Users/alice/repo",
      }),
    ).toEqual({});
  });

  it("keeps composer semantics instead of internal provider config", () => {
    expect(
      sanitizeProductAnalyticsProperties({
        fast_mode: "off",
        permission_level: "supervised",
        work_mode: "work",
      }),
    ).toEqual({
      fast_mode: "off",
      permission_level: "supervised",
      work_mode: "work",
    });
  });

  it("keeps null values and drops undefined or empty strings", () => {
    expect(
      sanitizeProductAnalyticsProperties({
        action: "",
        outcome: null,
        provider: undefined,
      }),
    ).toEqual({
      outcome: null,
    });
  });

  it("accepts only known event names", () => {
    expect(sanitizeProductAnalyticsEvent("thread.started", { provider: "claude" })).toEqual({
      event: "thread.started",
      properties: { provider: "claude" },
    });
    expect(
      sanitizeProductAnalyticsEvent(
        "query.captured" as Parameters<typeof sanitizeProductAnalyticsEvent>[0],
        {},
      ),
    ).toBeNull();
    expect(
      sanitizeProductAnalyticsEvent(
        "ui.sidebar_toggled" as Parameters<typeof sanitizeProductAnalyticsEvent>[0],
        {},
      ),
    ).toBeNull();
    expect(
      sanitizeProductAnalyticsEvent("thread.input_submitted", {
        model: "gpt-5.6",
        prompt: "private prompt",
        prompt_length_bucket: "51_200",
        provider: "codex",
      }),
    ).toEqual({
      event: "thread.input_submitted",
      properties: {
        model: "gpt-5.6",
        prompt_length_bucket: "51_200",
        provider: "codex",
      },
    });
  });

  it("buckets durations and counts", () => {
    expect(bucketDurationMs(500)).toBe("lt_10s");
    expect(bucketDurationMs(70_000)).toBe("1m_5m");
    expect(bucketDurationMs(3_700_000)).toBe("gte_1h");
    expect(bucketCount(0)).toBe("0");
    expect(bucketCount(3)).toBe("2_3");
    expect(bucketCount(20)).toBe("gt_10");
    expect(bucketPromptLength(0)).toBe("0");
    expect(bucketPromptLength(50)).toBe("1_50");
    expect(bucketPromptLength(201)).toBe("201_1000");
    expect(bucketPromptLength(4_001)).toBe("gt_4000");
    expect(classifyModelFamily(undefined)).toBe("default");
    expect(classifyModelFamily("claude-sonnet-5")).toBe("claude");
    expect(classifyModelFamily("gpt-5.6-sol")).toBe("openai");
    expect(classifyModelFamily("foo1")).toBe("other");
    expect(classifyModelFamily("composer-2.5-fast")).toBe("composer");
    expect(classifyModelFamily("private-model")).toBe("other");
    expect(classifyAnalyticsModel("GPT-5.6-Sol")).toBe("gpt-5.6-sol");
    expect(classifyAnalyticsModel("composer-2.5-fast")).toBe("composer-2.5-fast");
    expect(classifyAnalyticsModel("openai/gpt-5.6-sol")).toBe("openai/gpt-5.6-sol");
    expect(classifyAnalyticsModel("o3-mini")).toBe("o3-mini");
    expect(classifyAnalyticsModel("qwen3.8-max-preview")).toBe("qwen3.8-max-preview");
    expect(classifyAnalyticsModel("deepseek-v4-pro")).toBe("deepseek-v4-pro");
    expect(classifyAnalyticsModel("kimi-k2.5")).toBe("kimi-k2.5");
    expect(classifyAnalyticsModel("acme-gpt-5-finance-prod")).toBe("other");
    expect(classifyAnalyticsModel("gpt-5-finance-prod")).toBe("other");
    expect(classifyAnalyticsModel("claude-acme-private-finetune")).toBe("other");
    expect(classifyAnalyticsModel("local-model")).toBe("other");
    expect(normalizeAnalyticsProvider("claude:private-profile")).toBe("claude");
    expect(normalizeAnalyticsProvider("customer-agent")).toBe("other");
    expect(normalizeComposerEffort("xHigh")).toBe("xhigh");
    expect(normalizeComposerEffort("provider-internal-level")).toBe("other");
    expect(normalizeComposerFastMode(true)).toBe("on");
    expect(normalizeComposerWorkMode("autopilot")).toBe("work");
    expect(normalizeComposerPermission("Auto-review")).toBe("auto_review");
    expect(normalizeComposerPermission("Full access")).toBe("full_access");
    expect(normalizeComposerPermission("Auto Approve")).toBe("auto_approve");
  });
});
