import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { DeepSeekAdvancedSettings } from "./DeepSeekAdvancedSettings";

// Real HeroUI Disclosure / Select / Input / Switch: guards composition that
// mocked component tests cannot catch.
beforeEach(() => {
  useSharedSettings.setState({ agentSettings: {} });
});

describe("DeepSeekAdvancedSettings with real HeroUI components", () => {
  it("renders collapsed by default and reveals grouped settings when expanded", async () => {
    render(<DeepSeekAdvancedSettings agentKind="deepseek" />);
    await act(async () => {});

    const trigger = screen.getByRole("button", { name: /Advanced settings/u });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Capabilities")).toBeInTheDocument();
    expect(screen.getByText("Web search & fetch")).toBeInTheDocument();
    expect(screen.getByText("Execution limits")).toBeInTheDocument();
    expect(screen.getByText("Privacy")).toBeInTheDocument();
    expect(screen.getByLabelText("Code mode (PTC)")).toBeInTheDocument();
    expect(screen.getByLabelText("Shell command timeout (seconds)")).toHaveAttribute(
      "placeholder",
      "60",
    );
    expect(screen.getByLabelText("Upload session log")).toBeInTheDocument();
  });
});
