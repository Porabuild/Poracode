import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { InlinePromptPieces } from "./PromptChips";
import type { PromptInlinePiece } from "./promptInlinePieces";

describe("InlinePromptPieces", () => {
  it("uses a target for goal commands and preserves slash and skill icons", () => {
    const pieces: PromptInlinePiece[] = [
      { kind: "chip", key: "goal", chip: { kind: "command", command: "goal" } },
      { kind: "chip", key: "help", chip: { kind: "command", command: "help" } },
      {
        kind: "chip",
        key: "skill",
        chip: { kind: "command", command: "goal", skillName: "goal" },
      },
    ];
    const { container } = render(
      <AppProvider>
        <InlinePromptPieces pieces={pieces} />
      </AppProvider>,
    );
    const icons = container.querySelectorAll(".poracode-slash-chip__slash");
    expect(icons[0]?.querySelector(".lucide-target")).toHaveAttribute("aria-hidden", "true");
    expect(icons[1]).toHaveTextContent("/");
    expect(icons[2]?.querySelector(".lucide-sparkles")).not.toBeNull();
  });

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
