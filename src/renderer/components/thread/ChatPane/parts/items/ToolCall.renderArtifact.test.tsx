/**
 * Renders the Claude View tool-call accordion (expanded) and dumps the result
 * viewport HTML to `tmp/claude-view-render.html` so the smoke-test artifact
 * captures what the user actually sees. Skipped unless `WRITE_RENDER_ARTIFACT`
 * is set to keep regular runs clean.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { ToolCall } from "./ToolCall";

const enabled = process.env.WRITE_RENDER_ARTIFACT === "1";

describe.skipIf(!enabled)("ToolCall — render artifact", () => {
  it("writes the highlighted View body to tmp/claude-view-render.html", async () => {
    const item: RuntimeChatItem = {
      id: "toolu_read",
      type: "tool_call",
      state: "completed",
      payload: {
        name: "Read",
        kind: "read",
        status: "success",
        args: { file_path: "src/renderer/hooks/useGitRefresh.ts" },
        result: [
          '1: import { useEffect } from "react";',
          '2: import type { PrData, ProjectLocation } from "@/shared/contracts";',
          '3: import { parseDraftProjectId } from "@/shared/paneId";',
          "4: ",
          "5: export function useGitRefresh(storeHydrated: boolean) {",
          "6:   useEffect(() => {",
          "7:     if (!storeHydrated) return;",
          "8:   }, [storeHydrated]);",
          "9: }",
        ].join("\n"),
      },
      streams: {},
    };

    render(
      <AppProvider>
        <ToolCall item={item} />
      </AppProvider>,
    );

    const trigger = document.querySelector('[data-slot="disclosure-trigger"]');
    if (!(trigger instanceof HTMLElement)) throw new Error("disclosure trigger not found");
    fireEvent.click(trigger);

    const viewport = await waitFor(() => {
      const body = document.querySelector('[data-slot="disclosure-body"]');
      if (!(body instanceof HTMLElement)) throw new Error("disclosure body not found");
      const sibling = body.querySelector(".lc-shiki, pre");
      if (!(sibling instanceof HTMLElement) || !sibling.classList.contains("lc-shiki")) {
        throw new Error("read viewport not yet highlighted");
      }
      return sibling;
    });

    const outPath = resolve(process.cwd(), "tmp/claude-view-render.html");
    writeFileSync(
      outPath,
      `<!doctype html>
<html><head><meta charset="utf-8"><title>Claude View render</title>
<style>body{background:#0d1117;color:#e1e4e8;font-family:system-ui;margin:24px}
.lc-shiki pre{margin:0;padding:12px;border-radius:6px;background:#0d1117}
.lc-shiki .line{display:block}
.note{color:#8b949e;margin-bottom:12px;font-size:13px}</style>
</head><body>
<div class="note">Rendered output of Claude's Read (View) tool with kind: "read" — captured from jsdom render of ToolCall.</div>
${viewport.outerHTML}
</body></html>`,
    );
    expect(outPath).toMatch(/claude-view-render\.html$/);
  });
});
