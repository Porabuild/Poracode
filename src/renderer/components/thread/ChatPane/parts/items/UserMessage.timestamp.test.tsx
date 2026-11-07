import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { UserMessage } from "./UserMessage";

const threadId = "thread-1";

function user(id: string): RuntimeChatItem {
  return {
    id,
    type: "user_message",
    state: "completed",
    streams: {},
    payload: { content: [{ kind: "text", text: `prompt ${id}` }] },
  };
}

function assistant(id: string): RuntimeChatItem {
  return {
    id,
    type: "assistant_message",
    state: "completed",
    streams: { assistant_text: `answer ${id}` },
  };
}

function seed(items: RuntimeChatItem[]) {
  useAppStore.setState({
    runtimeItemIdsByThread: { [threadId]: items.map((entry) => entry.id) },
    runtimeItemsByIdByThread: {
      [threadId]: Object.fromEntries(items.map((entry) => [entry.id, entry])),
    },
  });
}

function renderMessage(item: RuntimeChatItem) {
  return render(
    <AppProvider>
      <UserMessage threadId={threadId} item={item} checkpointRevert={null} />
    </AppProvider>,
  );
}

describe("UserMessage timestamp", () => {
  beforeEach(() => {
    useAppStore.setState({
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeCompletedTurnsByThread: {},
    });
  });

  it("shows the start time of the turn the prompt opened in the hover strip", () => {
    const first = user("u1");
    const second = user("u2");
    seed([first, assistant("a1"), second, assistant("a2")]);
    const firstStart = new Date(2026, 9, 23, 9, 5).getTime();
    const secondStart = new Date(2026, 9, 23, 9, 30).getTime();
    useAppStore.getState().hydrateThreadCompletedTurns(threadId, [
      { startedAt: firstStart, endedAt: firstStart + 5000, anchorItemId: "a1" },
      { startedAt: secondStart, endedAt: secondStart + 5000, anchorItemId: "a2" },
    ]);

    const { container } = renderMessage(second);
    const time = container.querySelector("time");
    expect(time).toHaveAttribute("datetime", new Date(secondStart).toISOString());
    expect(time?.closest(".poracode-message-action-strip")).not.toBeNull();
  });

  it("omits the timestamp while the turn has not completed", () => {
    const only = user("u1");
    seed([only, assistant("a1")]);
    const { container } = renderMessage(only);
    expect(container.querySelector("time")).toBeNull();
  });

  it("omits the timestamp when several prompts precede one turn end", () => {
    const first = user("u1");
    const steer = user("u2");
    seed([first, assistant("a0"), steer, assistant("a1")]);
    const start = new Date(2026, 9, 23, 9, 5).getTime();
    useAppStore
      .getState()
      .hydrateThreadCompletedTurns(threadId, [
        { startedAt: start, endedAt: start + 5000, anchorItemId: "a1" },
      ]);
    expect(renderMessage(first).container.querySelector("time")).toBeNull();
    expect(renderMessage(steer).container.querySelector("time")).toBeNull();
  });
});
