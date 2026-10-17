import { useState } from "react";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { SideChatBootstrap, SideChatSelection } from "@/shared/ipc/sideChat";
import { planWorkToggle } from "../../providers/composerControlBuilders";

vi.mock("./useSideChatSession", () => ({
  useSideChatSession: () => {
    const [selection, setSelection] = useState<SideChatSelection>({
      agentKind: "test",
      config: { model: "test", mode: "agent" },
    });
    return { prompt: "", selection, setSelection, hasProject: true };
  },
}));
vi.mock("./useSideChatDraftControls", () => ({
  useSideChatDraftControls: (
    _source: unknown,
    _project: unknown,
    selection: SideChatSelection,
    setSelection: (selection: SideChatSelection) => void,
  ) => [
    planWorkToggle({
      isPlanMode: selection.config.mode === "plan",
      isDisabled: false,
      onChange: (selected) =>
        setSelection({
          ...selection,
          config: { ...selection.config, mode: selected ? "plan" : "agent" },
        }),
    }),
  ],
}));
vi.mock("./SideChatModelText", () => ({ SideChatModelText: () => null }));
vi.mock("./SideChatThreadView", () => ({ SideChatThreadView: () => null }));

import { SideChatBody } from "./SideChatBody";

it("can add, remove, and re-add Plan from a side-chat draft", () => {
  const entry = { source: {}, title: "Side chat" } as SideChatBootstrap;
  render(<SideChatBody entry={entry} surface="panel" />);
  expect(screen.queryByRole("button", { name: "Work" })).not.toBeInTheDocument();
  for (let index = 0; index < 2; index++) {
    fireEvent.click(screen.getByRole("button", { name: "Add attachment or capability" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Plan" }));
    expect(screen.queryByRole("button", { name: "Remove Plan" })).not.toBeInTheDocument();
  }
});
