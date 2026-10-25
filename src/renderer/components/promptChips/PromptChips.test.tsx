import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { InlinePromptPieces } from "./PromptChips";
import type { PromptInlinePiece } from "./promptInlinePieces";

describe("InlinePromptPieces", () => {
  it("renders every chip kind display-only, with no nested button", () => {
    const pieces: PromptInlinePiece[] = [
      { kind: "chip", key: "file", chip: { kind: "file", path: "src/app/main.ts" } },
      { kind: "chip", key: "mcp", chip: { kind: "mcp", name: "github" } },
      { kind: "chip", key: "thread", chip: { kind: "thread", threadId: "t1", title: "Earlier" } },
      { kind: "text", key: "text", text: " done" },
    ];
    const { container } = render(
      <AppProvider>
        <InlinePromptPieces pieces={pieces} />
      </AppProvider>,
    );
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector(".poracode-inline-path-chip--static")).toHaveTextContent(
      "main.ts",
    );
    expect(container.querySelector("[data-mcp-name='github']")).not.toBeNull();
    expect(container).toHaveTextContent("Earlier");
    expect(container).toHaveTextContent("done");
  });
});
