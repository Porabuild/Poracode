import { describe, expect, it } from "vitest";
import { makeDraftPaneId } from "@/shared/paneId";
import { selectHiddenHostedAgentTerminalIds } from "./hostedAgentTerminalIds";

const terminalThread = {
  id: "term-a",
  archived: false,
  done: false,
  presentationMode: "terminal" as const,
};

describe("selectHiddenHostedAgentTerminalIds", () => {
  it("parks keep-alive terminals that are not in the current thread view", () => {
    expect(
      selectHiddenHostedAgentTerminalIds({
        keepAlivePaneIds: ["term-a", "term-b"],
        view: { kind: "thread", panes: ["term-b"] },
        threads: [terminalThread, { ...terminalThread, id: "term-b" }],
      }),
    ).toEqual(["term-a"]);
  });

  it("parks every keep-alive terminal on Home so the surface survives", () => {
    expect(
      selectHiddenHostedAgentTerminalIds({
        keepAlivePaneIds: ["term-a"],
        view: { kind: "home" },
        threads: [terminalThread],
      }),
    ).toEqual(["term-a"]);
  });

  it("skips the visible pane, drafts, GUI, archived, and done threads", () => {
    const draftId = makeDraftPaneId("project");
    expect(
      selectHiddenHostedAgentTerminalIds({
        keepAlivePaneIds: ["term-a", draftId, "gui-a", "archived-a", "done-a"],
        view: { kind: "thread", panes: ["term-a"] },
        threads: [
          terminalThread,
          { id: "gui-a", archived: false, done: false, presentationMode: "gui" },
          { ...terminalThread, id: "archived-a", archived: true },
          { ...terminalThread, id: "done-a", done: true },
        ],
      }),
    ).toEqual([]);
  });
});
