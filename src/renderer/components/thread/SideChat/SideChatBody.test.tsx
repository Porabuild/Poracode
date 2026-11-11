import { useState } from "react";
import { createEvent, fireEvent, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { SideChatBootstrap, SideChatSelection } from "@/shared/ipc/sideChat";
import { planWorkToggle } from "../../providers/composerControlBuilders";

const mocks = vi.hoisted(() => ({ start: vi.fn<(...args: unknown[]) => void>() }));
vi.mock("./useSideChatSession", () => ({
  useSideChatSession: (entry: SideChatBootstrap) => {
    const [selection, setSelection] = useState<SideChatSelection>({
      agentKind: "test",
      config: { model: "test", mode: "agent" },
    });
    const [prompt, setPrompt] = useState("");
    const [draftSegments, setDraftSegments] = useState(entry.segments ?? []);
    return {
      prompt,
      setPrompt,
      draftSegments,
      setDraftSegments,
      selection,
      setSelection,
      hasProject: true,
      start: mocks.start,
    };
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

it("keeps side-chat selections as removable chips and sends their full text", () => {
  mocks.start.mockClear();
  const entry = {
    source: {},
    title: "Side chat",
    segments: [{ kind: "text", content: "first line\nsecond line", selection: true }],
  } as SideChatBootstrap;
  render(<SideChatBody entry={entry} surface="panel" />);
  const input = screen.getByRole("textbox");
  expect(input).toHaveValue("");
  expect(screen.getByText("first line second line")).toBeInTheDocument();
  fireEvent.change(input, { target: { value: "Explain this" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(mocks.start).toHaveBeenCalledWith("first line\nsecond line\n\nExplain this", [
    { kind: "text", content: "first line\nsecond line", selection: true },
    { kind: "text", content: "\n\nExplain this" },
  ]);
  const remove = screen.getByRole("button", { name: "Remove" });
  const mouseDown = createEvent.mouseDown(remove);
  fireEvent(remove, mouseDown);
  expect(mouseDown.defaultPrevented).toBe(true);
  remove.focus();
  fireEvent.click(remove, { detail: 0 });
  expect(screen.queryByText("first line second line")).not.toBeInTheDocument();
  expect(input).toHaveValue("Explain this");
  expect(input).toHaveFocus();
});
