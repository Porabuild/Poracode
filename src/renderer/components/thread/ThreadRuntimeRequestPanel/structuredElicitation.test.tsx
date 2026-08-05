import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { asStructuredElicitationDetails, StructuredElicitationForm } from "./structuredElicitation";

/**
 * The form-mode request Kimi Code v2's acp-server builds for an
 * AskUserQuestion: single-select questions become `type: "string"` + `oneOf`,
 * multi-select ones `type: "array"` + `items.anyOf`, and every key is
 * required. The `anyOf` half regressed once — the array rendered zero
 * checkboxes, so the required key could never be filled and Submit stayed
 * disabled forever.
 */
function kimiFormDetails() {
  return {
    acpElicitation: {
      mode: "form",
      message: "Which authentication method?\nWhich checks should run?",
      agentName: "Kimi Code",
      requestedSchema: {
        type: "object",
        properties: {
          q0: {
            type: "string",
            title: "Auth",
            oneOf: [
              { const: "Paste a token", title: "Paste a token" },
              { const: "Log in via browser", title: "Log in via browser" },
            ],
          },
          q1: {
            type: "array",
            title: "Checks",
            minItems: 1,
            items: {
              anyOf: [
                { const: "Tests", title: "Run tests" },
                { const: "Lint", title: "Run lint" },
              ],
            },
          },
        },
        required: ["q0", "q1"],
      },
    },
  };
}

function renderKimiForm(details: unknown = kimiFormDetails()) {
  const onSubmit = vi.fn<(response: unknown, outcome: string) => void>();
  const params = asStructuredElicitationDetails(details);
  expect(params).toBeDefined();
  render(
    <AppProvider>
      <StructuredElicitationForm isDisabled={false} onSubmit={onSubmit} params={params!} />
    </AppProvider>,
  );
  return { onSubmit };
}

describe("StructuredElicitationForm", () => {
  it("renders a checkbox per anyOf choice of a multi-select array", () => {
    renderKimiForm();

    expect(screen.getByLabelText("Run tests")).toBeDefined();
    expect(screen.getByLabelText("Run lint")).toBeDefined();
  });

  it("submits the picked anyOf values as the array answer", () => {
    const { onSubmit } = renderKimiForm();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Log in via browser" } });
    fireEvent.click(screen.getByLabelText("Run lint"));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).toHaveBeenCalledWith(
      { action: "accept", content: { q0: "Log in via browser", q1: ["Lint"] } },
      "answered",
    );
  });

  it("keeps Submit disabled until every required key — array included — is filled", () => {
    renderKimiForm();
    const submit = screen.getByRole("button", { name: "Submit" });

    expect(submit.getAttribute("data-disabled")).not.toBeNull();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Paste a token" } });
    expect(submit.getAttribute("data-disabled")).not.toBeNull();

    fireEvent.click(screen.getByLabelText("Run tests"));
    expect(submit.getAttribute("data-disabled")).toBeNull();
  });

  it("still reads oneOf item schemas and plain enums", () => {
    renderKimiForm({
      acpElicitation: {
        mode: "form",
        message: "Pick",
        requestedSchema: {
          type: "object",
          properties: {
            legacy: {
              type: "array",
              title: "Legacy",
              items: { oneOf: [{ const: "a", title: "Alpha" }] },
            },
            plain: { type: "string", title: "Plain", enum: ["x"], enumNames: ["Ex"] },
          },
        },
      },
    });

    expect(screen.getByLabelText("Alpha")).toBeDefined();
    expect(screen.getByRole("option", { name: "Ex" })).toBeDefined();
  });
});
