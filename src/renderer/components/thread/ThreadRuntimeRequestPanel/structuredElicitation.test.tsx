import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { asStructuredElicitationDetails, StructuredElicitationForm } from "./structuredElicitation";

const openExternal = vi.hoisted(() => vi.fn<(url: string) => void>());
vi.mock("@/renderer/utils/openExternal", () => ({
  openExternalWithFeedback: (url: string) => openExternal(url),
}));

/** ACP questions use string choices and arrays of choices, with each answer required. */
function questionFormDetails() {
  return {
    acpElicitation: {
      mode: "form",
      message: "Which authentication method?\nWhich checks should run?",
      agentName: "Test agent",
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

/** Chooses an already-visible answer row. */
function pickChoice(label: string, option: string) {
  const listbox = screen.getByRole("listbox", { name: label });
  fireEvent.click(within(listbox).getByRole("option", { name: (name) => name.endsWith(option) }));
}

function renderForm(details: unknown = questionFormDetails(), isDisabled = false) {
  const onSubmit = vi.fn<(response: unknown, outcome: string) => void>();
  const params = asStructuredElicitationDetails(details);
  expect(params).toBeDefined();
  const view = render(
    <AppProvider>
      <StructuredElicitationForm isDisabled={isDisabled} onSubmit={onSubmit} params={params!} />
    </AppProvider>,
  );
  return { onSubmit, unmount: view.unmount };
}

describe("StructuredElicitationForm", () => {
  it("steps through four required choices, preserves edits, and submits the native content map", () => {
    const headers = ["Picker", "Speed", "Permissions", "Terminal"];
    const { onSubmit } = renderForm({
      acpElicitation: {
        mode: "form",
        message: "How should these settings work?",
        _meta: { request: "original" },
        requestedSchema: {
          type: "object",
          required: ["q0", "q1", "q2", "q3"],
          properties: Object.fromEntries(
            headers.map((title, index) => [
              `q${index}`,
              {
                type: "string",
                title,
                description: `Choose ${title.toLowerCase()}`,
                oneOf: [
                  { const: "first", title: "First choice" },
                  { const: "second", title: "Second choice" },
                ],
              },
            ]),
          ),
        },
      },
    });
    const submit = screen.getByRole("button", { name: /^(Continue|Submit)$/ });
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getAllByRole("listbox")).toHaveLength(1);
    expect(submit.hasAttribute("disabled")).toBe(true);
    fireEvent.click(submit);
    expect(onSubmit).not.toHaveBeenCalled();

    pickChoice("Picker", "First choice");
    expect(screen.getByRole("tab", { name: /Speed/ }).getAttribute("aria-selected")).toBe("true");
    pickChoice("Speed", "Second choice");
    pickChoice("Permissions", "First choice");
    expect(submit.hasAttribute("disabled")).toBe(true);
    pickChoice("Terminal", "Second choice");
    expect(submit.hasAttribute("disabled")).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: /Picker/ }));
    expect(screen.getByRole("option", { name: /First choice/ }).getAttribute("aria-selected")).toBe(
      "true",
    );
    pickChoice("Picker", "Second choice");
    fireEvent.click(screen.getByRole("tab", { name: /Terminal/ }));
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
      {
        action: "accept",
        content: { q0: "second", q1: "second", q2: "first", q3: "second" },
        _meta: { request: "original" },
      },
      "answered",
    );
  });

  it("keeps multi-select answers while navigating and validates every step", () => {
    const { onSubmit } = renderForm();
    fireEvent.click(screen.getByRole("tab", { name: /Checks/ }));
    pickChoice("Checks", "Run tests");
    const submit = screen.getByRole("button", { name: /^(Continue|Submit)$/ });
    expect(submit.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("tab", { name: /Auth/ }));
    pickChoice("Auth", "Paste a token");
    expect(screen.getByRole("option", { name: /Run tests/ }).getAttribute("aria-selected")).toBe(
      "true",
    );
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith(
      { action: "accept", content: { q0: "Paste a token", q1: ["Tests"] } },
      "answered",
    );
  });

  it("keeps the server's request text visible while a field is active", () => {
    renderForm({
      mcpElicitation: {
        mode: "form",
        serverName: "deploy",
        message: "Deploy build 1.4 to production?",
        requestedSchema: {
          type: "object",
          required: ["confirm"],
          properties: { confirm: { type: "boolean", title: "Confirm" } },
        },
      },
    });
    expect(screen.getByText('MCP server "deploy" · Deploy build 1.4 to production?')).toBeDefined();
    expect(screen.getByText("Confirm")).toBeDefined();
    const checkbox = screen.getByRole("checkbox", { name: "Confirm" });
    // Unchecked is a valid answer, so the checkbox must not claim it is required.
    expect(checkbox.hasAttribute("aria-required")).toBe(false);
    // The boolean row shows marker 1, so the digit shortcut toggles it.
    checkbox.focus();
    fireEvent.keyDown(checkbox, { key: "1" });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
  });

  it("offers one dismissal that declines a stepped form", () => {
    const { onSubmit } = renderForm();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(onSubmit).toHaveBeenCalledWith({ action: "decline" }, "declined");
  });

  it("disables question navigation along with the answer controls", () => {
    renderForm(questionFormDetails(), true);
    const tab = screen.getByRole("tab", { name: /Checks/ });
    expect(tab.hasAttribute("disabled")).toBe(true);
    fireEvent.click(tab);
    expect(screen.queryByRole("option", { name: /Run tests/ })).toBeNull();
  });

  it("always steps optional text fields and Enter submits only on the last step", () => {
    const { onSubmit } = renderForm({
      structuredElicitation: {
        mode: "form",
        message: "Notes",
        sourceText: "Agent",
        requestedSchema: {
          type: "object",
          properties: {
            first: { type: "string", title: "First" },
            second: { type: "string", title: "Second" },
          },
        },
      },
    });
    const first = screen.getByRole("textbox", { name: "First" });
    expect(screen.queryByRole("textbox", { name: "Second" })).toBeNull();
    fireEvent.change(first, { target: { value: "one" } });
    fireEvent.keyDown(first, { key: "Enter", shiftKey: true });
    expect(screen.getByRole("textbox", { name: "First" })).toBe(first);
    fireEvent.keyDown(first, { key: "Enter", isComposing: true });
    fireEvent.keyDown(first, { key: "Enter", keyCode: 229 });
    expect(screen.getByRole("textbox", { name: "First" })).toBe(first);
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(first, { key: "Enter" });
    const second = screen.getByRole("textbox", { name: "Second" });
    expect(document.activeElement).toBe(second);
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(second, { target: { value: "two" } });
    fireEvent.click(screen.getByRole("tab", { name: /First/ }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "First" }), { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Second" }), { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
      { action: "accept", content: { first: "one", second: "two" } },
      "answered",
    );
  });

  it("Enter selects an answer row and submits its new value only on the last step", () => {
    const { onSubmit } = renderForm({
      acpElicitation: {
        mode: "form",
        message: "Pick",
        requestedSchema: {
          type: "object",
          required: ["first", "second"],
          properties: {
            first: { type: "string", title: "First", enum: ["a", "b"] },
            second: { type: "string", title: "Second", enum: ["c", "d"] },
          },
        },
      },
    });
    fireEvent.keyDown(screen.getByRole("option", { name: "a" }), { key: "Enter" });
    expect(screen.getByRole("listbox", { name: "Second" })).toBeDefined();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("option", { name: "c" }));
    fireEvent.keyDown(screen.getByRole("option", { name: "d" }), { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
      { action: "accept", content: { first: "a", second: "d" } },
      "answered",
    );
  });

  it("supports arrows and number shortcuts for ACP single and multi-select choices", () => {
    const { onSubmit } = renderForm();
    const first = screen.getByRole("option", { name: /Paste a token/ });
    const second = screen.getByRole("option", { name: /Log in via browser/ });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second, { key: "ArrowUp" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "2" });
    const tests = screen.getByRole("option", { name: /Run tests/ });
    const lint = screen.getByRole("option", { name: /Run lint/ });
    expect(document.activeElement).toBe(tests);
    fireEvent.keyDown(tests, { key: "ArrowUp" });
    expect(document.activeElement).toBe(lint);
    fireEvent.keyDown(lint, { key: "1" });
    fireEvent.keyDown(tests, { key: "2" });
    expect(tests.getAttribute("aria-selected")).toBe("true");
    expect(lint.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(lint, { key: "1" });
    expect(tests.getAttribute("aria-selected")).toBe("false");
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(lint, { key: "Enter" });
    expect(lint.getAttribute("aria-selected")).toBe("false");
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(tests, { key: "Enter" });
    expect(tests.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
      { action: "accept", content: { q0: "Log in via browser", q1: ["Tests"] } },
      "answered",
    );
  });

  it("renders shared multi-select rows for anyOf choices", () => {
    renderForm();

    fireEvent.click(screen.getByRole("tab", { name: /Checks/ }));

    expect(
      screen.getByRole("listbox", { name: "Checks" }).getAttribute("aria-multiselectable"),
    ).toBe("true");
    expect(screen.getByRole("option", { name: /Run tests/ })).toBeDefined();
    expect(screen.getByRole("option", { name: /Run lint/ })).toBeDefined();
  });

  it("submits option ids for a multi-select array", () => {
    const { onSubmit } = renderForm();

    pickChoice("Auth", "Log in via browser");
    pickChoice("Checks", "Run lint");
    fireEvent.click(screen.getByRole("button", { name: /^(Continue|Submit)$/ }));

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

    expect(screen.getByRole("option", { name: "Fast" }).getAttribute("aria-selected")).toBe(
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: /^(Continue|Submit)$/ }));

    expect(onSubmit).toHaveBeenCalledWith({ action: "accept", content: {} }, "answered");
  });

  it("renders numbered answer rows and submits the underlying option id", () => {
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

    pickChoice("Mode", "Fast");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByRole("option", { name: "Fast" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /^(Continue|Submit)$/ }));

    expect(onSubmit).toHaveBeenCalledWith(
      { action: "accept", content: { mode: "fast" } },
      "answered",
    );
  });

  it("can clear an optional choice by pressing its selected row again", () => {
    const { onSubmit } = renderForm({
      structuredElicitation: {
        mode: "form",
        message: "Pick",
        sourceText: "Agent",
        requestedSchema: {
          type: "object",
          properties: {
            choice: {
              type: "string",
              title: "Choice",
              enum: ["first", "second", "third"],
              default: "second",
            },
          },
        },
      },
    });
    const rows = screen.getAllByRole("option");
    expect(rows).toHaveLength(3);
    expect(rows[1]?.getAttribute("aria-selected")).toBe("true");
    pickChoice("Choice", "second");
    expect(rows[1]?.getAttribute("aria-selected")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: /^(Continue|Submit)$/ }));
    expect(onSubmit).toHaveBeenCalledWith({ action: "accept", content: {} }, "answered");
  });

  it("keeps disabled answer rows from changing their value", () => {
    renderForm(questionFormDetails(), true);
    const row = screen.getAllByRole("option")[0]!;
    expect(row.hasAttribute("disabled")).toBe(true);
    fireEvent.click(row);
    expect(row.getAttribute("aria-selected")).toBe("false");
  });

  it("keeps Submit disabled until every required key — array included — is filled", () => {
    renderForm();
    const submit = screen.getByRole("button", { name: /^(Continue|Submit)$/ });

    expect(submit.getAttribute("data-disabled")).not.toBeNull();

    pickChoice("Auth", "Paste a token");
    expect(submit.getAttribute("data-disabled")).not.toBeNull();

    pickChoice("Checks", "Run tests");
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

    expect(screen.getByRole("option", { name: /Alpha/ })).toBeDefined();
    expect(screen.queryByRole("option", { name: "Ex" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /Plain/ }));
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
    const submit = screen.getByRole("button", { name: /^(Continue|Submit)$/ });
    expect(screen.queryByRole("textbox", { name: "Detail" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /Count/ }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Count" }), {
      target: { value: "1.5" },
    });
    expect(submit.getAttribute("data-disabled")).not.toBeNull();
    expect(screen.getByText("Enter a valid value.")).toBeDefined();
    expect(screen.getByText(/Minimum: 1/)).toBeDefined();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Count" }), { target: { value: "2" } });
    expect(screen.queryByText("Enter a valid value.")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /Enabled/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Enabled" }));
    fireEvent.click(screen.getByRole("tab", { name: /Detail/ }));
    expect(screen.getByRole("textbox", { name: "Detail" })).toBeDefined();
    expect(submit.getAttribute("data-disabled")).not.toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Detail" }), {
      target: { value: "typed then hidden" },
    });
    fireEvent.click(screen.getByRole("tab", { name: /Enabled/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Enabled" }));
    expect(screen.queryByRole("tab", { name: /Detail/ })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /Optional/ }));
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
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Other" }), { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    expect((screen.getByRole("textbox", { name: "Other" }) as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
    pickChoice("Tags", "existing");
    expect(
      screen.getByRole("button", { name: /^(Continue|Submit)$/ }).getAttribute("data-disabled"),
    ).not.toBeNull();
    pickChoice("Tags", "existing");
    fireEvent.click(screen.getByRole("button", { name: /^(Continue|Submit)$/ }));
    expect(onSubmit).toHaveBeenCalledWith(
      { action: "accept", content: { tags: ["custom"] } },
      "answered",
    );
  });

  it("Enter in a custom multi-select editor adds the draft instead of submitting an old selection", () => {
    const { onSubmit } = renderForm({
      structuredElicitation: {
        mode: "form",
        message: "Tags",
        sourceText: "Agent",
        requestedSchema: {
          type: "object",
          required: ["tags"],
          properties: {
            tags: {
              type: "array",
              title: "Tags",
              allowCustom: true,
              default: ["existing"],
              items: { enum: ["existing"] },
            },
          },
        },
      },
    });
    const other = screen.getByRole("textbox", { name: "Other" });
    fireEvent.change(other, { target: { value: "new value" } });
    fireEvent.keyDown(other, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("new value")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledWith(
      { action: "accept", content: { tags: ["existing", "new value"] } },
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

    const input = screen.getByRole("textbox", { name: "Color" });
    expect(input.tagName).toBe("INPUT");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Color$/u })).toBeNull();
    fireEvent.change(input, { target: { value: "Q17_OTHER" } });
    fireEvent.click(screen.getByRole("button", { name: /^(Continue|Submit)$/ }));

    expect(onSubmit).toHaveBeenCalledWith(
      { action: "accept", content: { q0: "Q17_OTHER" } },
      "answered",
    );
  });

  it.each([
    { fieldKey: "build", defaultValue: undefined },
    { fieldKey: "build", defaultValue: "keep" },
    { fieldKey: "build", defaultValue: "Custom initial value" },
    { fieldKey: "constructor", defaultValue: "keep" },
    { fieldKey: "toString", defaultValue: "keep" },
    { fieldKey: "__proto__", defaultValue: "keep" },
  ])(
    "keeps option selection separate from custom text for $fieldKey with default $defaultValue",
    ({ fieldKey, defaultValue }) => {
      const { onSubmit } = renderForm({
        structuredElicitation: {
          mode: "form",
          message: "Questions",
          sourceText: "Agent",
          requestedSchema: {
            type: "object",
            properties: {
              [fieldKey]: {
                type: "string",
                title: "Build path",
                description: "Which build change should I leave in the working tree?",
                allowCustom: true,
                ...(defaultValue !== undefined ? { default: defaultValue } : {}),
                oneOf: [
                  { const: "local", title: "Oxc + local maps off" },
                  { const: "keep", title: "Oxc, keep source maps" },
                  { const: "filter", title: "Narrow Babel filter only" },
                  { const: "revert", title: "Revert experiments" },
                ],
              },
            },
          },
        },
      });
      const input = screen.getByRole("textbox", { name: "Build path" }) as HTMLInputElement;
      const keep = screen.getByRole("option", { name: /Oxc, keep source maps/ });
      expect(input.value).toBe(defaultValue === "Custom initial value" ? defaultValue : "");
      expect(input.placeholder).toBe("Something else…");
      expect(keep.getAttribute("aria-selected")).toBe(String(defaultValue === "keep"));

      fireEvent.change(input, { target: { value: "keep" } });
      expect(input.value).toBe("keep");
      expect(keep.getAttribute("aria-selected")).toBe("false");
      fireEvent.click(keep);
      expect(keep.getAttribute("aria-selected")).toBe("true");
      expect(input.value).toBe("");
      fireEvent.change(input, { target: { value: "another build" } });
      expect(keep.getAttribute("aria-selected")).toBe("false");
      fireEvent.change(input, { target: { value: "" } });
      expect(keep.getAttribute("aria-selected")).toBe("false");
      fireEvent.click(keep);
      expect(input.value).toBe("");
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));
      expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
        { action: "accept", content: { [fieldKey]: "keep" } },
        "answered",
      );
    },
  );

  it("preserves custom text equal to an option id when revisiting a question", () => {
    const details = questionFormDetails();
    const { onSubmit } = renderForm({
      acpElicitation: {
        ...details.acpElicitation,
        requestedSchema: {
          ...details.acpElicitation.requestedSchema,
          properties: {
            ...details.acpElicitation.requestedSchema.properties,
            q0: { ...details.acpElicitation.requestedSchema.properties.q0, allowCustom: true },
          },
        },
      },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Auth" }), {
      target: { value: "Paste a token" },
    });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Auth" }), { key: "Enter" });
    pickChoice("Checks", "Run tests");
    fireEvent.click(screen.getByRole("tab", { name: /Auth/ }));
    expect((screen.getByRole("textbox", { name: "Auth" }) as HTMLInputElement).value).toBe(
      "Paste a token",
    );
    expect(
      screen.getByRole("option", { name: /Paste a token/ }).getAttribute("aria-selected"),
    ).toBe("false");
    fireEvent.click(screen.getByRole("tab", { name: /Checks/ }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
      { action: "accept", content: { q0: "Paste a token", q1: ["Tests"] } },
      "answered",
    );
  });

  it("uses numbered rows and arrow keys when choices also allow a custom answer", () => {
    const details = questionFormDetails();
    const { onSubmit } = renderForm({
      acpElicitation: {
        ...details.acpElicitation,
        requestedSchema: {
          ...details.acpElicitation.requestedSchema,
          properties: {
            ...details.acpElicitation.requestedSchema.properties,
            q0: { ...details.acpElicitation.requestedSchema.properties.q0, allowCustom: true },
          },
        },
      },
    });
    const first = screen.getByRole("option", { name: /Paste a token/ });
    first.focus();
    // The custom answer is the list's last row, so ArrowUp wraps into it.
    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Auth" }));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    const second = screen.getByRole("option", { name: /Log in via browser/ });
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second, { key: "2" });
    expect(screen.getByRole("tab", { name: /Checks/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: /Auth/ }));
    expect(screen.getByRole("textbox", { name: "Auth" }).getAttribute("value")).toBe("");
    const custom = screen.getByRole("textbox", { name: "Auth" });
    fireEvent.change(custom, { target: { value: "custom 12" } });
    fireEvent.keyDown(custom, { key: "1" });
    expect(screen.getByRole("textbox", { name: "Auth" })).toBe(custom);
    fireEvent.keyDown(custom, { key: "Enter" });
    pickChoice("Checks", "Run tests");
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
      { action: "accept", content: { q0: "custom 12", q1: ["Tests"] } },
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
        message: "Read the setup guide",
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
