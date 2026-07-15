import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ToggleSwitch } from "./ToggleSwitch";

function TestSwitch() {
  const [selected, setSelected] = useState(false);
  return <ToggleSwitch aria-label="Test setting" isSelected={selected} onChange={setSelected} />;
}

describe("ToggleSwitch", () => {
  it("changes through its interactive control and keeps the default cursor", () => {
    render(<TestSwitch />);

    const input = screen.getByRole("switch", { name: "Test setting" });
    const track = input.closest(".switch")?.querySelector(".switch__control");
    expect(input).not.toBeChecked();
    expect(input.closest(".cursor-default")).not.toBeNull();
    expect(track).not.toBeNull();

    fireEvent.click(track!);

    expect(input).toBeChecked();
  });
});
