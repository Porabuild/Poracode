import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { MarkdownPreview } from "@/renderer/views/FileEditorOverlay/parts/MarkdownPreview";
import ItemMarkdownInner from "./ItemMarkdownInner";

function renderMarkdown(text: string) {
  return render(
    <AppProvider>
      <ItemMarkdownInner text={text} />
    </AppProvider>,
  );
}

describe("chat math rendering", () => {
  it("typesets dollar inline and display math", () => {
    const { container } = renderMarkdown(
      "Your forward operation is $Z=XW$ for image $i$.\n\n$$\n\\frac{\\partial L}{\\partial W}\n$$\n",
    );
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(3);
    expect(container.querySelector(".katex-display")).not.toBeNull();
    expect(container.textContent).not.toContain("$Z=XW$");
  });

  it("typesets LaTeX inline and display delimiters", () => {
    const { container } = renderMarkdown(
      "Weight \\(W_{dj}\\) changes \\(Z_{ij}\\).\n\n\\[\n\\frac{\\partial L}{\\partial W_{dj}}\n\\]\n",
    );
    expect(container.querySelectorAll(".katex-html").length).toBeGreaterThanOrEqual(3);
    expect(container.querySelector(".katex-display .katex-html")).not.toBeNull();
  });

  it("leaves an unclosed display opener as text", () => {
    const { container } = renderMarkdown(
      "Before \\[ \\frac{1}{2} still open\n\nAfter the formula.",
    );
    expect(container.querySelector(".katex")).toBeNull();
    expect(container.textContent).toContain("After the formula.");
    expect(container.textContent).toContain("still open");
  });

  it("does not typeset math inside fenced or inline code", () => {
    const { container } = renderMarkdown(
      "```text\n$Z=XW$\n\\[ \\frac{1}{2} \\]\n```\n\nOutside $i$ and `$not math$`.\n",
    );
    const code = container.querySelector("pre");
    expect(code?.textContent).toContain("$Z=XW$");
    expect(code?.textContent).toContain("\\frac{1}{2}");
    expect(code?.querySelector(".katex")).toBeNull();
    expect(container.textContent).toContain("$not math$");
    expect(container.querySelectorAll(".katex")).toHaveLength(1);
  });

  it("typesets a math fence as display math", () => {
    const { container } = renderMarkdown("```math\n\\frac{\\partial L}{\\partial W}\n```\n");
    expect(container.querySelector(".katex-display")).not.toBeNull();
    expect(container.querySelector("pre")).toBeNull();
  });

  it("keeps an escaped bracket escape as text", () => {
    const { container } = renderMarkdown("See \\\\[1\\\\] for the note.");
    expect(container.querySelector(".katex")).toBeNull();
    expect(container.textContent).toContain("\\[1\\]");
  });

  it("typesets the same delimiters in the file preview", () => {
    const { container } = render(
      <AppProvider>
        <MarkdownPreview content={"Inline \\(x^2\\) and\n\n$$\ny=x\n$$\n"} />
      </AppProvider>,
    );
    expect(container.querySelectorAll(".katex").length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });
});
