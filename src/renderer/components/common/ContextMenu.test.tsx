import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu } from "./ContextMenu";

describe("ContextMenu", () => {
  it("does not wrap its child in an extra DOM element", () => {
    const { container } = render(
      <ContextMenu items={[]} onAction={vi.fn()}>
        <button type="button">Row</button>
      </ContextMenu>,
    );

    expect(container.firstElementChild?.tagName).toBe("BUTTON");
    expect(screen.getByRole("button", { name: "Row" })).toBe(container.firstElementChild);
  });
});
