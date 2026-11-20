import "fake-indexeddb/auto";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import { agentStatusSchema } from "@/shared/contracts/agent";
import { defaultMemorySettings } from "@/shared/memory";
import { MemorySettings } from "./MemorySettings";

vi.mock("@/renderer/state/memoryCatalog", () => ({
  // Keep the unrelated catalog status request pending in these settings tests.
  runMemoryCatalogCommand: () => new Promise(() => {}),
}));

const agent = agentStatusSchema.parse({
  kind: "test-agent",
  label: "Test agent",
  installed: true,
  authState: "authenticated",
  capabilities: {
    supportsOneShot: true,
    models: [
      { id: "flash", label: "Flash" },
      { id: "pro", label: "Pro" },
      { id: "plain", label: "Plain" },
    ],
    modelEfforts: { flash: ["low", "medium"], pro: ["medium", "high"], plain: [] },
  },
});

function reasoningFor(title: "Capture model" | "Dream model") {
  return within(screen.getByRole("group", { name: title })).getByRole("button", {
    name: "Reasoning",
  });
}

function pickOption(option: HTMLElement) {
  fireEvent.pointerDown(option, { button: 0, pointerId: 1, clientX: 5, clientY: 5 });
  fireEvent.mouseDown(option, { button: 0 });
  fireEvent.pointerUp(option, { button: 0, pointerId: 1, clientX: 5, clientY: 5 });
  fireEvent.mouseUp(option, { button: 0 });
  fireEvent.click(option, { button: 0 });
}

function pickReasoning(title: "Capture model" | "Dream model", label: string) {
  fireEvent.click(reasoningFor(title));
  pickOption(screen.getByRole("option", { name: label }));
}

describe("Memory model reasoning", () => {
  beforeEach(() => {
    useAgentStatusesStore.setState({ agentStatuses: [agent], wslAgentStatuses: [] });
    useSharedSettings.setState({ memory: { ...defaultMemorySettings, enabled: true } });
  });

  afterEach(() => {
    cleanup();
    useAgentStatusesStore.setState({ agentStatuses: [], wslAgentStatuses: [] });
    useSharedSettings.setState({ memory: defaultMemorySettings });
    localStorage.clear();
  });

  it("saves per-model effort independently and restores the default without changing the model", () => {
    renderWithI18n(<MemorySettings />);

    expect(reasoningFor("Capture model")).toHaveTextContent("Default");
    fireEvent.click(reasoningFor("Capture model"));
    expect(screen.queryByRole("option", { name: "High" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });

    pickReasoning("Capture model", "Low");
    pickReasoning("Dream model", "High");

    expect(useSharedSettings.getState().memory).toMatchObject({
      captureProvider: agent.kind,
      captureModel: "flash",
      captureEffort: "low",
      dreamProvider: agent.kind,
      dreamModel: "pro",
      dreamEffort: "high",
    });
    expect(reasoningFor("Capture model")).toHaveTextContent("Low");
    expect(reasoningFor("Dream model")).toHaveTextContent("High");

    pickReasoning("Capture model", "Default");
    expect(useSharedSettings.getState().memory).toMatchObject({
      captureModel: "flash",
      captureEffort: "",
      dreamEffort: "high",
    });
    fireEvent.click(
      within(screen.getByRole("group", { name: "Dream model" })).getByRole("button", {
        name: "Reset",
      }),
    );
    expect(useSharedSettings.getState().memory).toMatchObject({
      dreamProvider: "auto",
      dreamModel: "",
      dreamEffort: "",
    });
  });

  it("does not offer an effort choice for a model without tiers and disables it when memory is off", () => {
    useSharedSettings.setState({
      memory: {
        ...defaultMemorySettings,
        enabled: false,
        captureProvider: agent.kind,
        captureModel: "plain",
      },
    });
    renderWithI18n(<MemorySettings />);

    expect(
      within(screen.getByRole("group", { name: "Capture model" })).queryByRole("button", {
        name: "Reasoning",
      }),
    ).not.toBeInTheDocument();
    expect(reasoningFor("Dream model")).toBeDisabled();
  });

  it("changes the exact member for model-bound effort and keeps it on a family re-pick", async () => {
    useAgentStatusesStore.setState({
      agentStatuses: [
        {
          ...agent,
          capabilities: {
            ...agent.capabilities,
            modelFamilies: [
              {
                model: "pro",
                label: "Pro family",
                selectors: [],
                bindings: { effort: "model", fast: "config" },
                members: [
                  { model: "pro", selections: {}, effort: "high" },
                  { model: "plain", selections: {}, effort: "low" },
                ],
              },
            ],
          },
        },
      ],
    });
    renderWithI18n(<MemorySettings />);

    expect(reasoningFor("Dream model")).toHaveTextContent("High");
    pickReasoning("Dream model", "Low");
    fireEvent.click(screen.getByRole("button", { name: "Dream model" }));
    const search = await screen.findByPlaceholderText("Search models...");
    fireEvent.change(search, { target: { value: "Pro family" } });
    pickOption(await screen.findByRole("option", { name: /Pro family/ }));

    expect(reasoningFor("Dream model")).toHaveTextContent("Low");
    expect(useSharedSettings.getState().memory).toMatchObject({
      dreamProvider: agent.kind,
      dreamModel: "plain",
      dreamEffort: "",
    });
  });
});
