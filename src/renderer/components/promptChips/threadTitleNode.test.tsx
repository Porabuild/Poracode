import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { threadTitleNode } from "./threadTitleNode";

function renderTitle(title: string) {
  return render(<AppProvider>{threadTitleNode(title)}</AppProvider>);
}

describe("threadTitleNode", () => {
  it("returns an ordinary title as the string itself", () => {
    expect(threadTitleNode("Fix the login bug")).toBe("Fix the login bug");
    expect(threadTitleNode("costs $5 today")).toBe("costs $5 today");
  });

  it("renders a $skill token as the skill chip the message uses", () => {
    const { container } = renderTitle("$finalize the release");
    const chip = container.querySelector(".poracode-slash-chip");
    expect(chip).toHaveAttribute("data-skill-name", "finalize");
    expect(chip?.querySelector(".poracode-slash-chip__name")).toHaveTextContent("finalize");
    expect(container).toHaveTextContent("finalize the release");
    expect(container).not.toHaveTextContent("$finalize");
  });

  it("renders a leading slash command as a command chip", () => {
    const { container } = renderTitle("/goal ship it");
    const chip = container.querySelector(".poracode-slash-chip");
    expect(chip?.querySelector(".poracode-slash-chip__slash")).toHaveTextContent("/");
    expect(chip?.querySelector(".poracode-slash-chip__name")).toHaveTextContent("goal");
  });

  it("never nests a button inside the row's button", () => {
    const { container } = renderTitle("$finalize and /goal");
    expect(container.querySelector("button")).toBeNull();
  });
});
