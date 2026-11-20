import { cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import "@/renderer/tailwind.css";
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
