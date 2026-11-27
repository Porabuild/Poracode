import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { ReactNode } from "react";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import type { PersistedRuntimeItem } from "@/shared/ipc/schemas";
import { ConversationSearchFocusView } from "./ConversationSearchFocusView";
import type { ConversationSearchFocus } from "./loadRuntimeItemThroughHistory";

vi.mock("@heroui/react", () => ({
  Button: ({ children, onPress }: { children: ReactNode; onPress: () => void }) => (
    <button type="button" onClick={onPress}>
      {children}
    </button>
  ),
}));

// The exact-item + bounded-window reads that produce `focus` are synthetic
// (buildDeepConversationCdpFixture / mocked ConversationMatchReaders): the
// "2 reads" scene is a deterministic presentation fixture, not a claim of real
// host support. Hosts without positioned reads keep the legacy paging fallback.
// These tests only prove the read-only window rendered from that synthetic scene.

function userMessage(id: string, text: string): PersistedRuntimeItem {
  return {
    id,
    type: "user_message",
    state: "completed",
    payload: text ? { content: [{ kind: "text", text }] } : {},
    streams: {},
  };
}

function assistantMessage(id: string, text: string): PersistedRuntimeItem {
  return {
    id,
    type: "assistant_message",
    state: "completed",
    payload: {},
    streams: { assistant_text: text },
  };
}

let scrolled: Element[];
let scrollIntoView: Mock<Element["scrollIntoView"]>;

beforeEach(() => {
  scrolled = [];
  scrollIntoView = vi.fn<Element["scrollIntoView"]>(function (this: Element) {
    scrolled.push(this);
  });
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
});

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

describe("ConversationSearchFocusView", () => {
  it("centers the chosen row with readable neighbors and localized role labels", () => {
    const focus: ConversationSearchFocus = {
      threadId: "saved",
      itemId: "exact",
      neighbors: true,
      items: [
        assistantMessage("before", "earlier reply"),
        userMessage("exact", "needle at 40"),
        userMessage("blank", ""), // no suitable text: omitted, never item.type
        userMessage("after", "later question"),
      ],
    };
    renderWithI18n(
      <ConversationSearchFocusView focus={focus} onReturn={() => {}} query="needle" />,
    );

    const exactRow = document.querySelector<HTMLElement>('[data-exact-match="true"]')!;
    expect(exactRow).toBeTruthy();
    // Scoped element scroll: only the chosen row, centered in this window.
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center" });
    expect(scrolled.length).toBeGreaterThan(0);
    expect(scrolled.every((element) => element === exactRow)).toBe(true);

    // Neighbors with suitable text render; the blank neighbor is omitted.
    expect(screen.getByText("earlier reply")).toBeTruthy();
    expect(screen.getByText("later question")).toBeTruthy();
    expect(document.querySelector('[data-row-item-id="blank"]')).toBeNull();
    expect(screen.queryByText("user_message")).toBeNull();

    // Localized roles, readable React text and a literal <mark> highlight.
    expect(screen.getAllByText("You")).toHaveLength(2);
    expect(screen.getByText("Assistant")).toBeTruthy();
    expect(document.querySelectorAll('[data-message-role="assistant"]')).toHaveLength(1);
    expect(exactRow.textContent).toContain("needle at 40");
    expect(exactRow.querySelector("mark")?.textContent).toBe("needle");
    expect(exactRow.innerHTML).not.toContain("<script");

    // Scene state and the return target stay available.
    expect(document.querySelector('[data-conversation-search-focus="true"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Return to conversation" })).toBeTruthy();
  });

  it("uses a short localized fallback instead of leaking an internal item type", () => {
    const focus: ConversationSearchFocus = {
      threadId: "saved",
      itemId: "exact",
      neighbors: false,
      items: [userMessage("exact", "")],
    };
    const onReturn = vi.fn<() => void>();
    renderWithI18n(<ConversationSearchFocusView focus={focus} onReturn={onReturn} />);
    expect(screen.getByText("Message text unavailable")).toBeTruthy();
    expect(screen.queryByText("user_message")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Return to conversation" }));
    expect(onReturn).toHaveBeenCalledOnce();
  });
});
