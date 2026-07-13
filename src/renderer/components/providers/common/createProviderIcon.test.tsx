import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createProviderIcon } from "./createProviderIcon";

const PRIMARY_PATH = "M0 0 H10 V10 H0 Z";
const SECONDARY_PATH = "M2 2 H8 V8 H2 Z";

describe("createProviderIcon", () => {
  it("passes title, fill rule, secondary path, and default tone to StatusIcon", () => {
    const TestIcon = createProviderIcon({
      cssPrefix: "test-provider-icon",
      path: PRIMARY_PATH,
      secondaryPath: SECONDARY_PATH,
      fillRule: "evenodd",
      viewBox: "0 0 10 10",
      defaultTone: "working",
    });

    const { container } = render(<TestIcon className="extra-class" title="Test provider" />);

    expect(container.firstElementChild).toHaveClass(
      "poracode-provider-icon--working",
      "test-provider-icon--working",
      "extra-class",
    );
    const svg = screen.getByRole("img", { name: "Test provider" });
    expect(svg).toHaveAttribute("viewBox", "0 0 10 10");

    const paths = Array.from(svg.querySelectorAll("path"));
    expect(
      paths.some(
        (path) =>
          path.getAttribute("d") === SECONDARY_PATH &&
          path.getAttribute("fill-rule") === "evenodd" &&
          path.getAttribute("clip-rule") === "evenodd",
      ),
    ).toBe(true);
    expect(paths.some((path) => path.getAttribute("d") === PRIMARY_PATH)).toBe(true);
  });

  it("uses the provided tone and hides untitled SVGs from accessibility", () => {
    const TestIcon = createProviderIcon({
      cssPrefix: "test-provider-icon",
      path: PRIMARY_PATH,
      viewBox: "0 0 10 10",
    });

    const { container } = render(<TestIcon tone="done" />);

    expect(container.firstElementChild).toHaveClass(
      "poracode-provider-icon--done",
      "test-provider-icon--done",
    );
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).not.toHaveAttribute("role");
  });
});
