import { describe, expect, it } from "vitest";
import { TURN_CONVERSATION_SNAPSHOT_MAX_LENGTH, turnClientContextSchema } from "@/shared/contracts";
import { sideChatLaunchInput } from "./sideChatLaunchInput";

describe("private side conversation context", () => {
  it("paints only the question and preserves user attachments", () => {
    const segments = [
      { kind: "text" as const, content: "Why?" },
      { kind: "attachment" as const, path: "/fixture/image.png" },
    ];
    const launch = sideChatLaunchInput("Why?", segments, "private parent marker");
    expect(launch.prompt).toBe("Why?");
    expect(launch.segments).toEqual(segments);
    expect(JSON.stringify(launch.segments)).not.toContain("private parent marker");
    expect(launch.clientContext?.conversationSnapshot?.text).toBe("private parent marker");
  });
  it("bounds large snapshots and preserves the original request and recent context", () => {
    const launch = sideChatLaunchInput(
      "Why?",
      [],
      `original request ${"x".repeat(100_000)} recent result`,
    );
    const snapshot = launch.clientContext?.conversationSnapshot?.text;
    expect(snapshot?.length).toBeLessThanOrEqual(TURN_CONVERSATION_SNAPSHOT_MAX_LENGTH);
    expect(snapshot).toContain("original request");
    expect(snapshot).toContain("recent result");
    expect(snapshot).toContain("[intermediate conversation context omitted]");
    expect(turnClientContextSchema.safeParse(launch.clientContext).success).toBe(true);
  });
});
