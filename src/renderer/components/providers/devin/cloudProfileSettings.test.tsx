import { fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { emptyDevinCloudDefaultsForm, type DevinCloudDefaultsForm } from "./profileConfigUi";
import { DevinCloudChatSetup } from "./cloudProfileSettings";

vi.mock("@/renderer/components/common", () => ({
  Input: (props: {
    "aria-label"?: string;
    placeholder?: string;
    value?: string;
    onChange?: (event: { target: { value: string } }) => void;
  }) => (
    <input
      aria-label={props["aria-label"]}
      placeholder={props.placeholder}
      value={props.value}
      onChange={props.onChange}
    />
  ),
  Select: (props: {
    "aria-label"?: string;
    value?: string | null;
    placeholder?: string;
    options: readonly { id: string; label: string }[];
    onChange: (value: string) => void;
  }) => (
    <select
      aria-label={props["aria-label"]}
      value={props.value ?? ""}
      onChange={(event) => props.onChange(event.target.value)}
    >
      {!props.value ? <option value="">{props.placeholder ?? "Select…"}</option> : null}
      {props.options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

/** Controlled harness mirroring how the profile editor owns this state. */
function Harness(props: { initial: DevinCloudDefaultsForm }) {
  const [form, setForm] = useState(props.initial);
  return <DevinCloudChatSetup form={form} onChange={setForm} />;
}

describe("DevinCloudChatSetup", () => {
  it("renders the three native choices at keep, with the honest scope helpers", () => {
    render(<Harness initial={emptyDevinCloudDefaultsForm()} />);
    expect(screen.getByLabelText("Cloud repositories")).toHaveValue("keep");
    expect(screen.getByLabelText("Cloud persona")).toHaveValue("keep");
    expect(screen.getByLabelText("Cloud platform")).toHaveValue("keep");
    // No conditional input is mounted while every choice is "keep".
    expect(screen.queryByLabelText("Cloud repository list")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Persona ID")).not.toBeInTheDocument();
    expect(screen.getByText(/Choose the workspace for new cloud chats/i)).toBeInTheDocument();
    expect(screen.getByText(/Existing cloud sessions keep their workspace/i)).toBeInTheDocument();
    expect(
      screen.getByText(/In CLI mode, configure the workspace from the terminal/i),
    ).toBeInTheDocument();
    // Keep-native is a real option value, not a placeholder.
    expect(screen.getAllByRole("option", { name: "Keep current choice" })).toHaveLength(3);
    // No guessed account choices: only the three native platform values.
    expect(screen.getByRole("option", { name: "Linux" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "macOS" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Windows" })).toBeInTheDocument();
  });

  it("reveals the comma-separated repository entry for specific repositories", () => {
    render(<Harness initial={emptyDevinCloudDefaultsForm()} />);
    fireEvent.change(screen.getByLabelText("Cloud repositories"), {
      target: { value: "list" },
    });
    const input = screen.getByLabelText("Cloud repository list");
    expect(input).toBeInTheDocument();
    expect(screen.getByText(/Enter repository names separated by commas/i)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "SDSLeon/zed, SDSLeon/lightcode" } });
    expect(screen.queryByText(/must be unique/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/at most 100 repositories/i)).not.toBeInTheDocument();
  });

  it("flags duplicates, oversized lists, and malformed entries under the list input", () => {
    render(
      <Harness
        initial={{
          ...emptyDevinCloudDefaultsForm(),
          repositoryMode: "list",
          repositoriesText: "acme/web, acme/web",
        }}
      />,
    );
    expect(screen.getByText(/Repository entries must be unique/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Cloud repository list"), {
      target: {
        value: Array.from({ length: 101 }, (_, i) => `acme/r${i}`).join(", "),
      },
    });
    expect(screen.getByText(/at most 100 repositories/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Cloud repository list"), {
      target: { value: "acme/web\u0007" },
    });
    expect(screen.getByText(/1–512 characters without control characters/i)).toBeInTheDocument();
  });

  it("treats the empty persona as the explicit Agent, and requires a slug for a custom one", () => {
    render(<Harness initial={{ ...emptyDevinCloudDefaultsForm(), personaMode: "agent" }} />);
    expect(screen.getByLabelText("Cloud persona")).toHaveValue("agent");
    expect(screen.queryByLabelText("Persona ID")).not.toBeInTheDocument();
    expect(screen.queryByText(/Enter a persona ID/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Cloud persona"), { target: { value: "custom" } });
    expect(screen.getByText(/Enter a persona ID or keep the current choice/i)).toBeInTheDocument();
    expect(screen.getByText(/available in your Devin cloud organization/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Persona ID"), { target: { value: "ops" } });
    expect(screen.queryByText(/Enter a persona ID/i)).not.toBeInTheDocument();
  });

  it("writes the exact platform through onChange and shows the org-failure honesty note", () => {
    render(<Harness initial={emptyDevinCloudDefaultsForm()} />);
    fireEvent.change(screen.getByLabelText("Cloud platform"), { target: { value: "macos" } });
    expect(screen.getByLabelText("Cloud platform")).toHaveValue("macos");
    expect(
      screen.getByText(/Availability depends on your Devin organization/i),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Cloud platform"), { target: { value: "keep" } });
    expect(screen.getByLabelText("Cloud platform")).toHaveValue("keep");
    expect(
      screen.queryByText(/Availability depends on your Devin organization/i),
    ).not.toBeInTheDocument();
  });

  it("ignores unknown select values without changing the form", () => {
    render(<Harness initial={emptyDevinCloudDefaultsForm()} />);
    fireEvent.change(screen.getByLabelText("Cloud persona"), { target: { value: "bogus" } });
    expect(screen.getByLabelText("Cloud persona")).toHaveValue("keep");
    expect(screen.queryByLabelText("Persona ID")).not.toBeInTheDocument();
  });
});
