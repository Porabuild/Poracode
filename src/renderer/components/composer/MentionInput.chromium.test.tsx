import { createRef } from "react";
import { act, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import "@/renderer/tailwind.css";
import type { PromptSegment } from "@/shared/contracts";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import {
  findInlineTextMatch,
  measureInlineBaseline,
  measureTextBaseline,
  setViewport,
} from "@/renderer/testUtils/inlineLayout";
import { MentionInput, type MentionInputHandle } from "./MentionInput";

afterEach(cleanup);

type CaseSpec = { label: string; slashCommand: string } | { label: string; segment: PromptSegment };

const CHIP_CASES: CaseSpec[] = [
  { label: "goal", slashCommand: "goal" },
  { label: "slash", slashCommand: "review" },
  {
    label: "skill",
    segment: {
      kind: "skill",
      name: "finalize",
      invocation: "$finalize",
      provider: "fixture",
      scope: "project",
    },
  },
  { label: "mcp", segment: { kind: "mcp", id: "browser", name: "Browser" } },
  {
    label: "thread",
    segment: { kind: "thread", threadId: "t1", title: "Source thread" },
  },
  { label: "file", segment: { kind: "file", path: "SKILL.md" } },
  {
    label: "selection",
    segment: { kind: "text", content: "Selected snippet", selection: true },
  },
  {
    label: "diff_comment",
    segment: {
      kind: "diff_comment",
      path: "src/app.ts",
      lineNumber: 42,
      side: "new",
      staged: false,
      body: "Verify alignment",
    },
  },
];

function typeSlashCommand(editor: HTMLElement, handle: MentionInputHandle, command: string) {
  editor.focus();
  const textNode = document.createTextNode(`/${command}`);
  editor.replaceChildren(textNode);
  const range = document.createRange();
  range.setStart(textNode, textNode.length);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  fireEvent.input(editor);
  handle.insertSlashCommand(command);
}

function populateCases(
  container: HTMLElement,
  refs: Array<React.RefObject<MentionInputHandle | null>>,
  plainRef: React.RefObject<MentionInputHandle | null>,
) {
  CHIP_CASES.forEach((entry, idx) => {
    const handle = refs[idx]!.current!;
    if ("slashCommand" in entry) {
      const editor = container.querySelector<HTMLElement>(
        `[data-composer-case="${entry.label}"] .poracode-mention-input`,
      )!;
      typeSlashCommand(editor, handle, entry.slashCommand);
      handle.insertText("Composer text");
    } else {
      handle.restoreFromSegments([entry.segment, { kind: "text", content: " Composer text" }]);
    }
  });
  plainRef.current?.restoreFromSegments([{ kind: "text", content: "Composer text" }]);
}

it.each([
  { width: 390, compact: false },
  { width: 800, compact: false },
  { width: 390, compact: true },
  { width: 800, compact: false, fontFamily: '"Segoe UI", Arial, sans-serif', fontSize: "13px" },
])(
  "aligns goal, slash, skill, MCP, thread, file, selection, and diff_comment badges in MentionInput (%o)",
  async ({ width, compact, fontFamily, fontSize }) => {
    await setViewport(width, 700);

    const refs = CHIP_CASES.map(() => createRef<MentionInputHandle>());
    const plainRef = createRef<MentionInputHandle>();
    const { container } = renderWithI18n(
      <div
        style={{
          ...(fontFamily ? { fontFamily } : {}),
        }}
      >
        {CHIP_CASES.map((entry, idx) => (
          <div key={entry.label} data-composer-case={entry.label}>
            <MentionInput
              ref={refs[idx]}
              compact={compact}
              placeholder="Message"
              projectLocation={undefined}
              onTextChange={vi.fn<(hasText: boolean) => void>()}
              onSubmit={vi.fn<(segments: PromptSegment[]) => void>()}
            />
          </div>
        ))}
        <div data-composer-case="plain">
          <MentionInput
            ref={plainRef}
            compact={compact}
            placeholder="Plain"
            projectLocation={undefined}
            onTextChange={vi.fn<(hasText: boolean) => void>()}
            onSubmit={vi.fn<(segments: PromptSegment[]) => void>()}
          />
        </div>
      </div>,
    );

    if (fontSize) {
      container
        .querySelectorAll<HTMLElement>(".poracode-mention-input")
        .forEach((editor) => (editor.style.fontSize = fontSize));
    }

    act(() => {
      populateCases(container, refs, plainRef);
    });

    await document.fonts.ready;
    await vi.waitFor(() => {
      expect(container.querySelector(".poracode-selection-chip__trigger")).not.toBeNull();
    });

    const plainEditor = container.querySelector<HTMLElement>(
      '[data-composer-case="plain"] .poracode-mention-input',
    );
    if (!plainEditor) throw new Error("Missing plain composer");
    const plainHeight = plainEditor.getBoundingClientRect().height;

    const measured = CHIP_CASES.map((entry) => {
      const editor = container.querySelector<HTMLElement>(
        `[data-composer-case="${entry.label}"] .poracode-mention-input`,
      );
      const chip = editor?.querySelector<HTMLElement>(
        ".poracode-slash-chip, .poracode-mention-chip",
      );
      const nameEl = chip?.querySelector<HTMLElement>(
        ".poracode-slash-chip__name, .poracode-mention-chip__name",
      );
      if (!editor || !chip || !nameEl) throw new Error(`Missing chip for ${entry.label}`);

      const textMatch = findInlineTextMatch(
        editor,
        "Composer",
        ".poracode-slash-chip, .poracode-mention-chip",
      );
      const chipRect = chip.getBoundingClientRect();
      const textBaseline = measureTextBaseline(textMatch.node, textMatch.offset);
      const chipBaseline = measureInlineBaseline(nameEl);

      return {
        label: entry.label,
        editorHeightDelta: editor.getBoundingClientRect().height - plainHeight,
        baselineDelta: chipBaseline - textBaseline,
        centerDelta:
          (chipRect.top + chipRect.bottom) / 2 - (textMatch.rect.top + textMatch.rect.bottom) / 2,
      };
    });

    const reference = measured.find((item) => item.label === "skill")!;
    for (const item of measured) {
      expect(Math.abs(item.editorHeightDelta), `${item.label} line height`).toBeLessThanOrEqual(
        0.5,
      );
      expect(Math.abs(item.baselineDelta), `${item.label} baseline alignment`).toBeLessThanOrEqual(
        0.5,
      );
      expect(
        Math.abs(item.baselineDelta - reference.baselineDelta),
        `${item.label} baseline parity with skill chip`,
      ).toBeLessThanOrEqual(0.5);
      expect(Math.abs(item.centerDelta), `${item.label} vertical centering`).toBeLessThanOrEqual(
        0.5,
      );
      expect(
        Math.abs(item.centerDelta - reference.centerDelta),
        `${item.label} vertical parity with skill chip`,
      ).toBeLessThanOrEqual(0.5);
    }
  },
);

it("keeps badge baselines aligned across wrapped multiline composer content", async () => {
  await setViewport(520, 700);

  const ref = createRef<MentionInputHandle>();
  const { container } = renderWithI18n(
    <div style={{ width: "420px" }}>
      <MentionInput
        ref={ref}
        placeholder="Message"
        projectLocation={undefined}
        onTextChange={vi.fn<(hasText: boolean) => void>()}
        onSubmit={vi.fn<(segments: PromptSegment[]) => void>()}
      />
    </div>,
  );

  act(() => {
    typeSlashCommand(
      container.querySelector<HTMLElement>(".poracode-mention-input")!,
      ref.current!,
      "goal",
    );
    ref.current!.insertSegments(
      [
        {
          kind: "thread",
          threadId: "t1",
          title: "Find and prioritize improvements",
        },
        { kind: "text", content: " FirstLineText continues across the line until wrap " },
        { kind: "mcp", id: "browser", name: "Poracode" },
        { kind: "text", content: " " },
        { kind: "file", path: "SKILL.md" },
        { kind: "text", content: " SecondLineText" },
      ],
      { atEnd: true },
    );
  });

  await document.fonts.ready;

  const editor = container.querySelector<HTMLElement>(".poracode-mention-input")!;
  const goalName = editor.querySelector<HTMLElement>(
    '[data-slash-command="goal"] .poracode-slash-chip__name',
  )!;
  const threadName = editor.querySelector<HTMLElement>(
    ".poracode-thread-mention-chip .poracode-slash-chip__name",
  )!;
  const fileName = editor.querySelector<HTMLElement>(".poracode-mention-chip__name")!;

  const firstLineMatch = findInlineTextMatch(
    editor,
    "FirstLineText",
    ".poracode-slash-chip, .poracode-mention-chip",
  );
  const secondLineMatch = findInlineTextMatch(
    editor,
    "SecondLineText",
    ".poracode-slash-chip, .poracode-mention-chip",
  );

  expect(secondLineMatch.rect.top).toBeGreaterThan(firstLineMatch.rect.bottom - 1);

  const firstBaseline = measureTextBaseline(firstLineMatch.node, firstLineMatch.offset);
  const secondBaseline = measureTextBaseline(secondLineMatch.node, secondLineMatch.offset);

  expect(Math.abs(measureInlineBaseline(goalName) - firstBaseline)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(measureInlineBaseline(threadName) - firstBaseline)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(measureInlineBaseline(fileName) - secondBaseline)).toBeLessThanOrEqual(0.5);
});
