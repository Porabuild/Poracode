/** Two completed turns (including a tool-only turn) or a live continuation. */
export function buildTurnTimingStory(
  live: boolean,
  state: {
    thread: Record<string, unknown>;
    runtimeItems: Array<Record<string, unknown>>;
    completedTurns: unknown[];
  },
) {
  let { thread, runtimeItems, completedTurns } = state;
  const now = Date.now();
  const iso = (offset: number) => new Date(now + offset).toISOString();
  if (!live) {
    runtimeItems = [
      {
        id: "timing-user-1",
        type: "user_message",
        state: "completed",
        payload: { content: [{ kind: "text", text: "Review the first change" }] },
        streams: {},
      },
      {
        id: "timing-answer-1",
        type: "assistant_message",
        state: "completed",
        payload: { content: [] },
        streams: { assistant_text: "The first change is complete." },
      },
      {
        id: "timing-user-2",
        type: "user_message",
        state: "completed",
        payload: { content: [{ kind: "text", text: "Inspect the related files" }] },
        streams: {},
      },
      {
        id: "timing-tool-1",
        type: "tool_call",
        state: "completed",
        payload: { title: "Inspect source files", name: "inspect", args: {} },
        streams: {},
      },
      {
        id: "timing-tool-2",
        type: "tool_call",
        state: "completed",
        payload: { title: "Inspect the tests", name: "inspect", args: {} },
        streams: {},
      },
    ];
    completedTurns = [
      { startedAt: iso(-90_000), endedAt: iso(-80_000), anchorItemId: "timing-answer-1" },
      { startedAt: iso(-70_000), endedAt: iso(-60_000), anchorItemId: "timing-tool-2" },
    ];
  }
  thread = {
    ...thread,
    status: live ? "working" : "idle",
    attention: live ? "working" : "none",
    canResumeWithConfig: true,
    ...(live ? { activeTurnStartedAt: iso(-65_000) } : {}),
    lastTurnStartedAt: iso(-70_000),
    lastTurnEndedAt: iso(-60_000),
  };
  if (!live) delete thread.activeTurnStartedAt;
  return { thread, runtimeItems, completedTurns };
}
