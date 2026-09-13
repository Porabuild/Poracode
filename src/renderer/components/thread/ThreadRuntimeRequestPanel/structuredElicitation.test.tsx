import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { asStructuredElicitationDetails, StructuredElicitationForm } from "./structuredElicitation";

const openExternal = vi.hoisted(() => vi.fn<(url: string) => void>());
vi.mock("@/renderer/utils/openExternal", () => ({
  openExternalWithFeedback: (url: string) => openExternal(url),
}));

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

function renderForm(details: unknown = kimiFormDetails()) {
  const onSubmit = vi.fn<(response: unknown, outcome: string) => void>();
  const params = asStructuredElicitationDetails(details);
  expect(params).toBeDefined();
  const view = render(
    <AppProvider>
      <StructuredElicitationForm isDisabled={false} onSubmit={onSubmit} params={params!} />
    </AppProvider>,
  );
  return { onSubmit, unmount: view.unmount };
}

describe("StructuredElicitationForm", () => {
  it("renders a checkbox per anyOf choice of a multi-select array", () => {
    renderForm();

    expect(screen.getByLabelText("Run tests")).toBeDefined();
    expect(screen.getByLabelText("Run lint")).toBeDefined();
  });

  it("submits the picked anyOf values as the array answer", () => {
    const { onSubmit } = renderForm();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Log in via browser" } });
    fireEvent.click(screen.getByLabelText("Run lint"));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).toHaveBeenCalledWith(
      { action: "accept", content: { q0: "Log in via browser", q1: ["Lint"] } },
      "answered",
    );
  });

  it("keeps Submit disabled until every required key — array included — is filled", () => {
    renderForm();
    const submit = screen.getByRole("button", { name: "Submit" });

    expect(submit.getAttribute("data-disabled")).not.toBeNull();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Paste a token" } });
    expect(submit.getAttribute("data-disabled")).not.toBeNull();

    fireEvent.click(screen.getByLabelText("Run tests"));
    expect(submit.getAttribute("data-disabled")).toBeNull();
  });

  it("still reads oneOf item schemas and plain enums", () => {
    renderForm({
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
  it("submits typed values and excludes hidden and empty optional fields", () => {
    const { onSubmit } = renderForm({
      structuredElicitation: {
        mode: "form",
        message: "Settings",
        sourceText: "Test agent",
        requestedSchema: {
          type: "object",
          required: ["enabled", "count", "detail"],
          properties: {
            enabled: { type: "boolean", title: "Enabled", default: false },
            count: { type: "integer", title: "Count", minimum: 1, maximum: 5 },
            detail: {
              type: "string",
              title: "Detail",
              visibleWhen: [{ field: "enabled", equals: true }],
            },
            optional: { type: "string", title: "Optional" },
          },
        },
      },
    });
    const submit = screen.getByRole("button", { name: "Submit" });
    expect(screen.queryByRole("textbox", { name: "Detail" })).toBeNull();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Count" }), {
      target: { value: "1.5" },
    });
    expect(submit.getAttribute("data-disabled")).not.toBeNull();
    expect(screen.getByText("Enter a valid value.")).toBeDefined();
    expect(screen.getByText(/Minimum: 1/)).toBeDefined();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Count" }), { target: { value: "2" } });
    expect(screen.queryByText("Enter a valid value.")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Enabled" }));
    expect(screen.getByRole("textbox", { name: "Detail" })).toBeDefined();
    expect(submit.getAttribute("data-disabled")).not.toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Detail" }), {
      target: { value: "typed then hidden" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Enabled" }));
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith(
      { action: "accept", content: { enabled: false, count: 2 } },
      "answered",
    );
  });

  it("accepts custom multi-select values and enforces cardinality", () => {
    const { onSubmit } = renderForm({
      structuredElicitation: {
        mode: "form",
        message: "Tags",
        sourceText: "Test agent",
        requestedSchema: {
          type: "object",
          required: ["tags"],
          properties: {
            tags: {
              type: "array",
              title: "Tags",
              minItems: 1,
              maxItems: 1,
              allowCustom: true,
              items: { enum: ["existing"] },
            },
          },
        },
      },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Other" }), {
      target: { value: "custom" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(
      screen.getByRole("button", { name: "Add" }).getAttribute("data-disabled"),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "existing" }));
    expect(
      screen.getByRole("button", { name: "Submit" }).getAttribute("data-disabled"),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "existing" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledWith(
      { action: "accept", content: { tags: ["custom"] } },
      "answered",
    );
  });

  it("opens http(s) elicitation links through openExternal and rejects other schemes", () => {
    expect(
      asStructuredElicitationDetails({
        mcpElicitation: {
          mode: "url",
          message: "Auth",
          serverName: "example",
          url: "javascript:alert(1)",
          elicitationId: "e1",
        },
      }),
    ).toBeUndefined();

    renderForm({
      structuredElicitation: {
        mode: "form",
        message: "Docs",
        sourceText: "Test agent",
        links: [
          { url: "https://example.test/docs", title: "Docs" },
          { url: "javascript:alert(1)", title: "Bad" },
        ],
        requestedSchema: { type: "object", properties: {} },
      },
    });
    expect(screen.getByText("Docs")).toBeDefined();
    expect(screen.queryByText("Bad")).toBeNull();
    fireEvent.click(screen.getByText("Docs"));
    expect(openExternal).toHaveBeenCalledWith("https://example.test/docs");
  });

  it("opens URL-mode elicitation through openExternal", () => {
    renderForm({
      mcpElicitation: {
        mode: "url",
        message: "Auth",
        serverName: "example",
        url: "https://example.test/login",
        elicitationId: "e1",
      },
    });
    fireEvent.click(screen.getByText("Open required URL"));
    expect(openExternal).toHaveBeenCalledWith("https://example.test/login");
  });
});
