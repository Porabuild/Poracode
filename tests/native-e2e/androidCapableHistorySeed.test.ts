import { describe, expect, it } from "vitest";
import { messageItemPayloadSchema } from "@/shared/contracts";
import { buildPromptContentBlocks } from "@/shared/promptContent";
import {
  CAPABLE_HISTORY_PREFIX,
  CAPABLE_HISTORY_PREFIX_ASSISTANT_MARKER,
  CAPABLE_HISTORY_PREFIX_USER_MARKER,
  capableHistoryItemText,
  capableHistoryPrefixEvents,
  capableHistoryUserMessagePayload,
  defaultCapableHistorySeedParams,
  type CapableHistorySeedParams,
} from "./helpers/androidCapableHistorySeed.ts";

/**
 * The B1 device journey's seed must carry the SAME user-message payload shape
 * production paints, because the Android client renders user text from
 * `payload.content` blocks: a `{ text }`-only payload renders a blank user
 * card while the raw transcript still contains the text (the c632 gap). These
 * focused checks pin the builder, the shared payload schema, the canonical
 * event placement, and the test-side text projection.
 */

interface SeedItemEvent {
  readonly type: string;
  readonly itemId?: string;
  readonly payload?: unknown;
}

function seedItemEvents(params: CapableHistorySeedParams): SeedItemEvent[] {
  return capableHistoryPrefixEvents(params) as unknown as SeedItemEvent[];
}

describe("capable-history seed user-message payload", () => {
  it("is the canonical production content-block shape, built and validated by shared code", () => {
    const params = defaultCapableHistorySeedParams();
    const payload = capableHistoryUserMessagePayload(params.userText);

    expect(payload.content).toEqual(buildPromptContentBlocks(params.userText));
    expect(messageItemPayloadSchema.safeParse(payload).success).toBe(true);
    expect(payload.content).toEqual([{ kind: "text", text: params.userText }]);
  });

  it("is attached to item.started only, exactly like the supervisor's optimistic paint", () => {
    const params = defaultCapableHistorySeedParams();
    const events = seedItemEvents(params);
    const started = events.find(
      (event) => event.type === "item.started" && event.itemId === params.userItemId,
    );
    const completed = events.find(
      (event) => event.type === "item.completed" && event.itemId === params.userItemId,
    );

    expect(started).toBeDefined();
    expect(messageItemPayloadSchema.safeParse(started?.payload).success).toBe(true);
    expect(completed).toBeDefined();
    expect(completed && "payload" in completed).toBe(false);
  });

  it("projects both prefix markers through the production text projection", () => {
    const params = defaultCapableHistorySeedParams();
    const events = seedItemEvents(params);
    const userPayload = events.find(
      (event) => event.type === "item.started" && event.itemId === params.userItemId,
    )?.payload as Record<string, unknown> | undefined;

    expect(capableHistoryItemText(userPayload, null)).toBe(params.userText);
    expect(capableHistoryItemText(null, { assistant_text: params.assistantText })).toBe(
      params.assistantText,
    );
    expect(CAPABLE_HISTORY_PREFIX.userText).toContain(CAPABLE_HISTORY_PREFIX_USER_MARKER);
    expect(CAPABLE_HISTORY_PREFIX.assistantText).toContain(CAPABLE_HISTORY_PREFIX_ASSISTANT_MARKER);
  });

  it("keeps the legacy scalar and empty shapes distinguishable", () => {
    expect(capableHistoryItemText({ text: "legacy" }, null)).toBe("legacy");
    expect(capableHistoryItemText({ content: [{ kind: "image" }] }, null)).toBeNull();
    expect(capableHistoryItemText(null, null)).toBeNull();
    expect(capableHistoryItemText('{"content":"not-an-array"}', null)).toBeNull();
  });
});
