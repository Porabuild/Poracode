import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PromptOptions } from "./PromptOptions";

describe("PromptOptions", () => {
  it("submits submitInput instead of the display key when provided", () => {
    const onSelect = vi.fn();

    render(
      <PromptOptions
        options={[
          {
            key: "2",
            label: "Skip",
            submitInput: "2\r",
          },
        ]}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /skip/i }));

    expect(onSelect).toHaveBeenCalledWith("2\r");
  });

  it("falls back to the visible key when no submitInput is provided", () => {
    const onSelect = vi.fn();

    render(
      <PromptOptions
        options={[
          {
            key: "1",
            label: "Continue",
          },
        ]}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(onSelect).toHaveBeenCalledWith("1");
  });
});
