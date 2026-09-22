import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ResourceAdmissionSettings } from "./ResourceAdmissionSettings";

const zeroLimits = {
  maxActiveAgentSessions: 0,
  maxActiveTerminalShells: 0,
  maxActiveGenerationHelpers: 0,
};

describe("ResourceAdmissionSettings", () => {
  beforeEach(() => {
    localStorage.clear();
    useSharedSettings.setState({ hostResourceAdmission: { ...zeroLimits } });
  });

  it("shows each limit with the slot-vs-process explanation", () => {
    useSharedSettings.setState({
      hostResourceAdmission: {
        maxActiveAgentSessions: 8,
        maxActiveTerminalShells: 4,
        maxActiveGenerationHelpers: 2,
      },
    });

    render(<ResourceAdmissionSettings />);

    expect(screen.getByText("Max active agent sessions")).toBeInTheDocument();
    expect(screen.getByText("Max active terminal shells")).toBeInTheDocument();
    expect(screen.getByText("Max active generation helpers")).toBeInTheDocument();
    expect(
      screen.getAllByText(/Counts logical execution slots, not OS processes or memory/u),
    ).toHaveLength(3);
    expect(screen.getAllByText(/0 means unlimited\./u)).toHaveLength(3);

    const agentInput = screen.getByLabelText(
      "Max active agent sessions, 0 for unlimited",
    ) as HTMLInputElement;
    expect(agentInput.value).toBe("8");
  });

  it("updates only the edited limit and persists it", () => {
    render(<ResourceAdmissionSettings />);
    const input = screen.getByLabelText("Max active terminal shells, 0 for unlimited");

    fireEvent.change(input, { target: { value: "6" } });
    fireEvent.blur(input);

    const expected = {
      maxActiveAgentSessions: 0,
      maxActiveTerminalShells: 6,
      maxActiveGenerationHelpers: 0,
    };
    expect(useSharedSettings.getState().hostResourceAdmission).toEqual(expected);
    expect(
      JSON.parse(localStorage.getItem("poracode-shared-settings") ?? "null").hostResourceAdmission,
    ).toEqual(expected);
  });

  it("keeps the last value when the field is cleared", () => {
    useSharedSettings.setState({
      hostResourceAdmission: { ...zeroLimits, maxActiveAgentSessions: 5 },
    });
    render(<ResourceAdmissionSettings />);
    const input = screen.getByLabelText("Max active agent sessions, 0 for unlimited");

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(useSharedSettings.getState().hostResourceAdmission.maxActiveAgentSessions).toBe(5);
  });
});
