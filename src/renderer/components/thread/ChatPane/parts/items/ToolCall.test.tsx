import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { ToolCall } from "./ToolCall";

describe("ToolCall — Claude View (Read) rich rendering", () => {
  it("renders the rich file body directly without args/result labels", async () => {
    const item: RuntimeChatItem = {
      id: "toolu_read",
      type: "tool_call",
      state: "completed",
      payload: {
        name: "Read",
        kind: "read",
        status: "success",
        args: { file_path: "src/renderer/hooks/useGitRefresh.ts" },
        result: ['1: import { useEffect } from "react";', "2: export const x = 1;"].join("\n"),
      },
      streams: {},
    };

    render(
      <AppProvider>
        <ToolCall item={item} />
      </AppProvider>,
    );

    fireEvent.click(getDisclosureTrigger());

    const resultViewport = await waitFor(() => {
      const viewport = findRichViewport();
      if (!viewport.classList.contains("lc-shiki")) {
        throw new Error("read viewport not yet highlighted");
      }
      return viewport;
    });

    // No labeled args/result headers — only the rich view of the file body.
    expect(findSectionHeader("args")).toBeNull();
    expect(findSectionHeader("result")).toBeNull();

    // The "1: " / "2: " line-number prefixes that the read tool emits should
    // be stripped before highlighting.
    expect(resultViewport.textContent).toContain("import { useEffect }");
    expect(resultViewport.textContent).toContain("export const x = 1;");
    expect(resultViewport.textContent).not.toMatch(/^\s*1:\s/);
    expect(resultViewport.textContent).not.toMatch(/\n\s*2:\s/);

    // Shiki produces token <span style="color:..."> nodes — confirm the body
    // is rendered as colored spans, not as a single plain <pre>.
    expect(resultViewport.querySelectorAll('span[style*="color"]').length).toBeGreaterThan(0);
  });

  it("falls back to plain rendering when the read result has no detectable language", async () => {
    const item: RuntimeChatItem = {
      id: "toolu_read_unknown",
      type: "tool_call",
      state: "completed",
      payload: {
        name: "Read",
        kind: "read",
        status: "success",
        args: { file_path: "notes-without-extension" },
        result: "plain note body",
      },
      streams: {},
    };

    render(
      <AppProvider>
        <ToolCall item={item} />
      </AppProvider>,
    );

    fireEvent.click(getDisclosureTrigger());

    const resultViewport = await waitFor(() => {
      const viewport = findRichViewport();
      if (!viewport.textContent?.includes("plain note body")) {
        throw new Error("read viewport not populated yet");
      }
      return viewport;
    });

    // No labeled args/result headers — only the rich view of the file body.
    expect(findSectionHeader("args")).toBeNull();
    expect(findSectionHeader("result")).toBeNull();

    // A read result with an unknown language renders in a plain <pre>, not the
    // Shiki container.
    expect(resultViewport.tagName.toLowerCase()).toBe("pre");
    expect(resultViewport.classList.contains("lc-shiki")).toBe(false);
  });
});

function getDisclosureTrigger(): HTMLElement {
  const trigger = document.querySelector('[data-slot="disclosure-trigger"]');
  if (!(trigger instanceof HTMLElement)) {
    throw new Error("disclosure trigger not found");
  }
  return trigger;
}

function findSectionHeader(label: string): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll("div")).find((el) => el.textContent?.trim() === label) ??
    null
  );
}

function findRichViewport(): HTMLElement {
  const body = document.querySelector('[data-slot="disclosure-body"]');
  if (!(body instanceof HTMLElement)) throw new Error("disclosure body not found");
  const viewport = body.querySelector(".lc-shiki, pre");
  if (!(viewport instanceof HTMLElement)) throw new Error("rich viewport not found");
  return viewport;
}
