import { cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import "@/renderer/tailwind.css";
import type { CanonicalContentBlock } from "@/shared/contracts";
import { ContentSurface } from "@/renderer/components/common/ContentSurface";
import { ThreadComposer } from "@/renderer/components/thread/ThreadComposer";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import { UserMessage } from "./UserMessage";

afterEach(cleanup);

async function renderChatSurfaces(width: number) {
  const { page } = (await import("vitest/browser")) as unknown as {
    page: { viewport: (width: number, height: number) => Promise<void> };
  };
  await page.viewport(width, 700);
  const { container, getByText } = renderWithI18n(
    <>
      <ContentSurface variant="row">Reference row</ContentSurface>
      <UserMessage
        threadId="surface-thread"
        checkpointRevert={null}
        item={{
          id: "prompt",
          type: "user_message",
          state: "completed",
          streams: {},
          payload: { content: [{ kind: "text", text: "Review the changes in this branch." }] },
        }}
      />
      <ThreadComposer
        controls={[]}
        placeholder="Send a message…"
        prompt=""
        submitDisabled
        submitLabel="Send message"
        onPromptChange={vi.fn<(value: string) => void>()}
        onSubmit={vi.fn<() => void>()}
      />
    </>,
  );
  const prompt = container.querySelector("[data-user-message]");
  const composer = container.querySelector(".poracode-composer-shell");
  if (!prompt || !composer) throw new Error("Missing user prompt or composer");
  const row = getComputedStyle(getByText("Reference row"));
  return { prompt, composer, row };
}

it.each([390, 1024])("shares the prompt and composer resting edge at %i px", async (width) => {
  const { prompt, composer, row } = await renderChatSurfaces(width);
  for (const surface of [prompt, composer]) {
    expect(getComputedStyle(surface).borderRadius).toBe("8px");
    expect(getComputedStyle(surface).borderTopWidth).toBe("1px");
    expect(getComputedStyle(surface).borderTopColor).toBe(row.borderTopColor);
  }
  expect(getComputedStyle(prompt).backgroundColor).toBe(row.backgroundColor);
});

it("matches the desktop prompt actions and distinguishes composer focus", async () => {
  const { prompt, composer, row } = await renderChatSurfaces(1024);
  const actions = prompt.querySelector(".poracode-message-action-strip");
  if (!actions) throw new Error("Missing desktop prompt actions");
  expect(getComputedStyle(actions).backgroundColor).toBe(row.backgroundColor);
  const editor = composer.querySelector<HTMLElement>("[contenteditable=true], textarea");
  if (!editor) throw new Error("Missing composer editor");
  editor.focus();
  await vi.waitFor(() =>
    expect(getComputedStyle(composer).borderTopColor).not.toBe(row.borderTopColor),
  );
});

it("keeps the fallback composer editor unframed inside the light composer shell", async () => {
  const root = document.documentElement;
  const previous = root.getAttribute("data-theme");
  root.setAttribute("data-theme", "light");
  try {
    const { composer } = await renderChatSurfaces(1024);
    const editor = composer.querySelector("textarea.poracode-composer-editor");
    if (!editor) throw new Error("Missing fallback composer editor");
    expect(getComputedStyle(editor).outlineStyle).toBe("none");
  } finally {
    if (previous === null) root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", previous);
  }
});

it.each([390, 800])(
  "aligns goal and slash chips identically to skill, MCP, thread, file, and link chips at %i px",
  async (width) => {
    const { page } = (await import("vitest/browser")) as unknown as {
      page: { viewport: (width: number, height: number) => Promise<void> };
    };
    await page.viewport(width, 700);
    const cases: Array<{ label: string; content: CanonicalContentBlock[] }> = [
      { label: "goal", content: [{ kind: "text", text: "/goal Decrease RAM usage" }] },
      { label: "slash", content: [{ kind: "text", text: "/review Decrease RAM usage" }] },
      {
        label: "skill",
        content: [
          {
            kind: "skill",
            name: "finalize",
            invocation: "$finalize",
            provider: "fixture",
            scope: "project",
          } as CanonicalContentBlock,
          { kind: "text", text: " Decrease RAM usage" },
        ],
      },
      {
        label: "mcp",
        content: [
          { kind: "mcp", id: "browser", name: "Browser" } as CanonicalContentBlock,
          { kind: "text", text: " Decrease RAM usage" },
        ],
      },
      {
        label: "thread",
        content: [
          { kind: "thread", threadId: "t1", title: "Source thread" } as CanonicalContentBlock,
          { kind: "text", text: " Decrease RAM usage" },
        ],
      },
      {
        label: "file",
        content: [
          { kind: "file", path: "src/index.ts" } as CanonicalContentBlock,
          { kind: "text", text: " Decrease RAM usage" },
        ],
      },
      {
        label: "link",
        content: [
          { kind: "file", path: "src/index.ts" } as CanonicalContentBlock,
          { kind: "text", text: " https://example.com Decrease RAM usage" },
        ],
      },
    ];
    const { container } = renderWithI18n(
      <div style={{ "--lc-chat-font-size": "14px" } as React.CSSProperties}>
        {cases.map((entry) => (
          <div key={entry.label} data-chip-case={entry.label}>
            <UserMessage
              threadId="chip-align-thread"
              checkpointRevert={null}
              item={{
                id: entry.label,
                type: "user_message",
                state: "completed",
                streams: {},
                payload: { content: entry.content },
              }}
            />
          </div>
        ))}
      </div>,
    );
    await document.fonts.ready;

    const measured = cases.map((entry) => {
      const body = container.querySelector(
        `[data-chip-case="${entry.label}"] [data-user-message-content]`,
      );
      const chips = body?.querySelectorAll<HTMLElement>(
        ".poracode-slash-chip, .poracode-inline-path-chip",
      );
      const chip = entry.label === "link" ? chips?.[chips.length - 1] : chips?.[0];
      if (!body || !chip) throw new Error(`Missing chip for ${entry.label}`);
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      let textRect: DOMRect | null = null;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const idx = node.textContent?.indexOf("Decrease") ?? -1;
        if (idx >= 0) {
          const range = document.createRange();
          range.setStart(node, idx);
          range.setEnd(node, idx + "Decrease".length);
          textRect = range.getBoundingClientRect();
          break;
        }
      }
      if (!textRect) throw new Error(`Missing text for ${entry.label}`);
      const chipRect = chip.getBoundingClientRect();
      return {
        label: entry.label,
        gapX: textRect.left - chipRect.right,
        centerDelta: (chipRect.top + chipRect.bottom) / 2 - (textRect.top + textRect.bottom) / 2,
      };
    });

    const reference = measured.find((item) => item.label === "skill")!;
    for (const item of measured) {
      expect(Math.abs(item.centerDelta), `${item.label} vertical centering`).toBeLessThanOrEqual(
        0.5,
      );
      expect(
        Math.abs(item.centerDelta - reference.centerDelta),
        `${item.label} vertical parity with skill chip`,
      ).toBeLessThanOrEqual(0.5);
      expect(
        Math.abs(item.gapX - reference.gapX),
        `${item.label} horizontal spacing parity with skill chip`,
      ).toBeLessThanOrEqual(0.5);
    }
  },
);
