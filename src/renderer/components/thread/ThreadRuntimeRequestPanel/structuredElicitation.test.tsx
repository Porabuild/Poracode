import { fireEvent, render, screen, within } from "@testing-library/react";
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

/** Opens the in-app HeroUI picker for `label` and chooses the option named `option`. */
async function pickChoice(label: string, option: string) {
  // The trigger's accessible name also carries the current value ("— Auth").
  const trigger = screen.getByRole("button", { name: new RegExp(`${label}$`, "u") });
  expect(trigger.tagName).not.toBe("SELECT");
  expect(trigger.getAttribute("aria-label")).toBe(label);
  fireEvent.click(trigger);
  const listbox = await screen.findByRole("listbox");
  fireEvent.click(within(listbox).getByRole("option", { name: option }));
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

  it("submits checkbox values for a multi-select array", async () => {
    const { onSubmit } = renderForm();

    await pickChoice("Auth", "Log in via browser");
    fireEvent.click(screen.getByLabelText("Run lint"));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).toHaveBeenCalledWith(
      { action: "accept", content: { q0: "Log in via browser", q1: ["Lint"] } },
      "answered",
    );
  });

  it("leaves an unpicked optional choice unset instead of submitting a fake option id", () => {
    const { onSubmit } = renderForm({
      acpElicitation: {
        mode: "form",
        message: "Pick",
        requestedSchema: {
          type: "object",
          properties: {
            mode: { type: "string", title: "Mode", oneOf: [{ const: "fast", title: "Fast" }] },
          },
        },
      },
    });

    expect(screen.getByRole("button", { name: /Mode$/u }).textContent).toContain("—");
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).toHaveBeenCalledWith({ action: "accept", content: {} }, "answered");
  });

  it("submits a closed-choice option id from a non-SELECT control", async () => {
    const { onSubmit } = renderForm({
      acpElicitation: {
        mode: "form",
        message: "Pick",
        requestedSchema: {
          type: "object",
          properties: {
            mode: { type: "string", title: "Mode", oneOf: [{ const: "fast", title: "Fast" }] },
          },
        },
      },
    });

    await pickChoice("Mode", "Fast");
    expect(screen.getByRole("button", { name: /Mode$/u }).tagName).not.toBe("SELECT");
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).toHaveBeenCalledWith(
      { action: "accept", content: { mode: "fast" } },
      "answered",
    );
  });

  it("keeps Submit disabled until every required key — array included — is filled", async () => {
    renderForm();
    const submit = screen.getByRole("button", { name: "Submit" });

    expect(submit.getAttribute("data-disabled")).not.toBeNull();

    await pickChoice("Auth", "Paste a token");
    expect(submit.getAttribute("data-disabled")).not.toBeNull();

    fireEvent.click(screen.getByLabelText("Run tests"));
    expect(submit.getAttribute("data-disabled")).toBeNull();
  });

  it("still reads oneOf item schemas and plain enums", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: /Plain$/u }));
    expect(await screen.findByRole("option", { name: "Ex" })).toBeDefined();
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

  it("submits a typed custom answer for a one-choice string that allows another value", () => {
    const { onSubmit } = renderForm({
      acpElicitation: {
        mode: "form",
        message: "Color",
        requestedSchema: {
          type: "object",
          required: ["q0"],
          properties: {
            q0: {
              type: "string",
              title: "Color",
              allowCustom: true,
              oneOf: [
                { const: "Blue", title: "Blue" },
                { const: "Green", title: "Green" },
              ],
            },
          },
        },
      },
    });

    const input = screen.getByRole("combobox", { name: "Color" });
    expect(input.tagName).toBe("INPUT");
    expect(input.tagName).not.toBe("SELECT");
    expect(screen.queryByRole("button", { name: /Color$/u })).toBeNull();
    fireEvent.change(input, { target: { value: "Q17_OTHER" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).toHaveBeenCalledWith(
      { action: "accept", content: { q0: "Q17_OTHER" } },
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
