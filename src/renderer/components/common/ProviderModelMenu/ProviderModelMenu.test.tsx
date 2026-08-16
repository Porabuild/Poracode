import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/renderer/components/providers/opencode";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { ProviderModelMenu, type ProviderModelMenuProvider } from "./ProviderModelMenu";

const layoutMock = vi.hoisted(() => ({ compact: false }));

vi.mock("@/renderer/adaptiveLayout", () => ({
  useCompactLayout: () => layoutMock.compact,
}));

function makeProvider(modelCount: number): ProviderModelMenuProvider {
  return makeNamedProvider("codex", "Codex", modelCount);
}

function makeNamedProvider(
  kind: string,
  label: string,
  modelCount: number,
): ProviderModelMenuProvider {
  return {
    kind,
    label,
    capabilities: {
      models: Array.from({ length: modelCount }, (_, index) => ({
        id: `model-${index + 1}`,
        label: `Model ${index + 1}`,
      })),
      efforts: [],
      modelEfforts: {},
      modes: ["agent"],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "terminal",
      settingDefs: [],
    },
  };
}

function makeSubProviderBackedProvider(): ProviderModelMenuProvider {
  const models = [
    ...Array.from({ length: 40 }, (_, index) => ({
      id: `github-copilot/model-${index + 1}`,
      label: `Copilot Model ${index + 1}`,
    })),
    ...Array.from({ length: 40 }, (_, index) => ({
      id: `openai/model-${index + 1}`,
      label: `OpenAI Model ${index + 1}`,
    })),
  ];

  return {
    kind: "opencode",
    label: "OpenCode",
    capabilities: {
      models,
      subProviders: [
        { id: "github-copilot", label: "Copilot" },
        { id: "openai", label: "OpenAI" },
      ],
      efforts: [],
      modelEfforts: {},
      modes: ["agent"],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "terminal",
      settingDefs: [],
    },
  };
}

function makeCursorProvider(): ProviderModelMenuProvider {
  return {
    kind: "cursor",
    label: "Cursor",
    capabilities: {
      models: [
        { id: "auto", label: "Auto" },
        { id: "composer-2", label: "Composer 2" },
        { id: "gpt-5.5", label: "GPT-5.5" },
        { id: "gpt-5.1-codex-max", label: "Codex 5.1 Max" },
      ],
      contextSizes: [
        { id: "272k", label: "272K" },
        { id: "1m", label: "1M" },
      ],
      modelContextSizes: {
        "gpt-5.5": ["272k", "1m"],
      },
      fastModels: ["composer-2", "gpt-5.5"],
      efforts: ["high"],
      modelEfforts: {
        auto: [],
        "composer-2": [],
        "gpt-5.5": ["high"],
        "gpt-5.1-codex-max": ["low", "medium", "high", "xhigh"],
      },
      modes: ["agent"],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "terminal",
      settingDefs: [],
    },
  };
}

function hasComposedHeader(providerLabel: string, subProviderLabel: string): boolean {
  return screen.getAllByText(providerLabel).some((element) => {
    const headerText = element.closest('[role="presentation"]')?.textContent ?? "";
    return headerText.includes(providerLabel) && headerText.includes(subProviderLabel);
  });
}

describe("ProviderModelMenu", () => {
  beforeEach(() => {
    layoutMock.compact = false;
    useSharedSettings.setState({
      favoriteModels: [],
      recentModels: [],
      hiddenModels: {},
    });
  });

  it("uses divider headers without an initial hover highlight in the mobile drawer", async () => {
    layoutMock.compact = true;
    render(
      <ProviderModelMenu
        providers={[makeSubProviderBackedProvider(), makeNamedProvider("codex", "Codex", 2)]}
        currentAgentKind="opencode"
        currentModel="github-copilot/model-1"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select model" }));

    const listbox = await screen.findByRole("listbox", { name: "Models" });
    expect(listbox).toHaveAttribute("data-mobile", "true");
    expect(listbox.querySelector('[role="option"][aria-selected="true"]')).not.toHaveAttribute(
      "data-active",
    );

    const providerHeader = within(listbox)
      .getAllByText("OpenCode")
      .map((label) => label.closest('[role="presentation"]'))
      .find(Boolean);
    const subProviderHeader = within(listbox)
      .getAllByText("Copilot")
      .map((label) => label.closest('[role="presentation"]'))
      .find(Boolean);
    expect(providerHeader).toHaveClass(
      "poracode-model-menu-header",
      "poracode-model-menu-header--provider",
    );
    expect(subProviderHeader).toHaveClass(
      "poracode-model-menu-header",
      "poracode-model-menu-header--sub",
    );

    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    expect(listbox.querySelector('[data-active="true"]')).not.toBeNull();
  });

  it("hides the list scrollbar for long model lists", async () => {
    render(
      <ProviderModelMenu
        providers={[makeProvider(500)]}
        currentAgentKind="codex"
        currentModel="model-1"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select model" }));

    const listbox = await screen.findByRole("listbox", { name: "Models" });
    expect(listbox).toHaveClass("no-scrollbar");
    expect(listbox.querySelector(".poracode-model-menu-bottom-spacer")).toHaveAttribute(
      "data-scroll-end-gap",
      "6",
    );
    expect(screen.queryByText("Model 500")).not.toBeInTheDocument();

    fireEvent.scroll(listbox, { target: { scrollTop: 500 * 28 } });

    expect(await screen.findByText("Model 500")).toBeInTheDocument();
  });

  it("keeps the desktop popover width fixed while windowing model rows", async () => {
    render(
      <ProviderModelMenu
        providers={[makeProvider(500)]}
        currentAgentKind="codex"
        currentModel="model-1"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select model" }));

    const listbox = await screen.findByRole("listbox", { name: "Models" });
    const fixedWidthPopover = listbox.closest(".w-96");
    expect(fixedWidthPopover).not.toBeNull();

    fireEvent.scroll(listbox, { target: { scrollTop: 500 * 28 } });

    expect(await screen.findByText("Model 500")).toBeInTheDocument();
    expect(listbox.closest(".w-96")).toBe(fixedWidthPopover);
  });

  it("renders normalized model rate descriptions as muted row hints", async () => {
    const provider = makeProvider(1);
    provider.capabilities.models = [
      {
        id: "opus",
        label: "Opus",
        description: "2x",
      },
    ];

    render(
      <ProviderModelMenu
        providers={[provider]}
        currentAgentKind="codex"
        currentModel="opus"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select model" }));

    expect(await screen.findByRole("option", { name: /Opus/u })).toHaveTextContent("· 2x");
  });

  it("ignores provider prose model descriptions", async () => {
    const provider = makeProvider(1);
    provider.capabilities.models = [
      {
        id: "opus",
        label: "Opus",
        description: "2x Factory token rate",
      },
    ];

    render(
      <ProviderModelMenu
        providers={[provider]}
        currentAgentKind="codex"
        currentModel="opus"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select model" }));

    expect(await screen.findByRole("option", { name: /Opus/u })).toHaveTextContent("Opus");
    expect(screen.getByRole("option", { name: /Opus/u })).not.toHaveTextContent("Factory");
  });

  it("keeps raw model descriptions available without rendering them in the row", async () => {
    const provider = makeProvider(1);
    provider.capabilities.models = [
      {
        id: "opus",
        label: "Opus",
        description: "2x",
        tooltipDescription: "2x Factory token rate",
      },
    ];

    render(
      <ProviderModelMenu
        providers={[provider]}
        currentAgentKind="codex"
        currentModel="opus"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select model" }));
    const row = await screen.findByRole("option", { name: /Opus/u });
    expect(row).toHaveTextContent("· 2x");
    expect(screen.queryByText("2x Factory token rate")).not.toBeInTheDocument();
  });

  it("keeps the current provider header rendered while scrolling deep into a long section", async () => {
    render(
      <ProviderModelMenu
        providers={[
          makeNamedProvider("codex", "Codex Long", 500),
          makeNamedProvider("claude", "Claude Short", 3),
        ]}
        currentAgentKind="codex"
        currentModel="model-1"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select model" }));

    const listbox = await screen.findByRole("listbox", { name: "Models" });
    fireEvent.scroll(listbox, { target: { scrollTop: 220 * 28 } });

    expect(await screen.findByText("Codex Long")).toBeInTheDocument();
  });

  it("keeps the outgoing sticky header until the next provider header fully reaches the top", async () => {
    render(
      <ProviderModelMenu
        providers={[
          makeNamedProvider("claude", "Claude", 3),
          makeNamedProvider("codex", "Codex", 3),
        ]}
        currentAgentKind="claude"
        currentModel="model-1"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select model" }));

    const listbox = await screen.findByRole("listbox", { name: "Models" });
    fireEvent.scroll(listbox, { target: { scrollTop: 32 + 3 * 28 - 1 } });

    await waitFor(() => {
      const stickyHeader = document.body.querySelector("[data-sticky-windowed-header]");
      expect(stickyHeader).not.toBeNull();
      expect(stickyHeader).toHaveClass("h-0");
      expect(stickyHeader).toHaveTextContent("Claude");
    });
    expect(
      within(listbox)
        .getAllByText("Claude")
        .some((element) =>
          element.closest('[role="presentation"]')?.classList.contains("invisible"),
        ),
    ).toBe(true);
    expect(within(listbox).getByText("Codex").closest('[role="presentation"]')).toHaveClass(
      "relative",
      "z-30",
    );

    fireEvent.scroll(listbox, { target: { scrollTop: 32 + 3 * 28 } });

    await waitFor(() => {
      expect(document.body.querySelector("[data-sticky-windowed-header]")).toBeNull();
    });
    const codexHeaderAtBoundary = within(listbox)
      .getByText("Codex")
      .closest('[role="presentation"]');
    expect(codexHeaderAtBoundary).toHaveClass("relative", "z-30");
    expect(codexHeaderAtBoundary).not.toHaveClass("invisible");

    fireEvent.scroll(listbox, { target: { scrollTop: 32 + 3 * 28 + 1 } });

    await waitFor(() => {
      const stickyHeader = document.body.querySelector("[data-sticky-windowed-header]");
      expect(stickyHeader).not.toBeNull();
      expect(stickyHeader).toHaveTextContent("Codex");
    });
    expect(
      within(listbox)
        .getAllByText("Codex")
        .some((element) =>
          element.closest('[role="presentation"]')?.classList.contains("invisible"),
        ),
    ).toBe(true);
  });

  it("renders the active sub-provider in the sticky provider header while scrolling", async () => {
    render(
      <ProviderModelMenu
        providers={[makeSubProviderBackedProvider(), makeNamedProvider("claude", "Claude", 3)]}
        currentAgentKind="opencode"
        currentModel="github-copilot/model-1"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select model" }));

    const listbox = await screen.findByRole("listbox", { name: "Models" });
    fireEvent.scroll(listbox, { target: { scrollTop: 8 * 28 } });

    await waitFor(() => expect(hasComposedHeader("OpenCode", "Copilot")).toBe(true));

    fireEvent.scroll(listbox, { target: { scrollTop: 32 + 32 + 40 * 28 - 1 } });

    const incomingSubHeader = within(listbox).getByText("OpenAI").closest('[role="presentation"]');
    expect(incomingSubHeader).not.toHaveClass("relative", "z-30", "invisible");

    fireEvent.scroll(listbox, { target: { scrollTop: 52 * 28 } });

    await waitFor(() => expect(hasComposedHeader("OpenCode", "OpenAI")).toBe(true));
  });

  it("filters long model lists by search", async () => {
    render(
      <ProviderModelMenu
        providers={[makeProvider(500)]}
        currentAgentKind="codex"
        currentModel="model-1"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select model" }));
    fireEvent.change(await screen.findByPlaceholderText("Search models..."), {
      target: { value: "model 500" },
    });

    expect(await screen.findByText("Model 500")).toBeInTheDocument();
    expect(screen.queryByText("Model 499")).not.toBeInTheDocument();
  });

  it("window-renders model lists instead of switching render paths by size", async () => {
    render(
      <ProviderModelMenu
        providers={[makeProvider(3)]}
        currentAgentKind="codex"
        currentModel="model-1"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select model" }));

    const listbox = await screen.findByRole("listbox", { name: "Models" });
    expect(listbox).toHaveClass("no-scrollbar");
    expect(screen.getByText("Model 3")).toBeInTheDocument();
  });

  it("selects models for provider kinds containing colons", async () => {
    const onChange = vi.fn<(next: { agentKind: string; model: string }) => void>();

    render(
      <ProviderModelMenu
        providers={[makeNamedProvider("acp-generic:glm-acp-agent", "GLM Agent", 2)]}
        currentAgentKind="acp-generic:glm-acp-agent"
        currentModel="model-1"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select model" }));
    fireEvent.click(await screen.findByText("Model 2"));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        agentKind: "acp-generic:glm-acp-agent",
        model: "model-2",
      });
    });
  });

  it("resets the window when a long list shrinks so rows do not render blank", async () => {
    const { rerender } = render(
      <ProviderModelMenu
        providers={[makeProvider(500)]}
        currentAgentKind="codex"
        currentModel="model-1"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select model" }));

    const listbox = await screen.findByRole("listbox", { name: "Models" });
    fireEvent.scroll(listbox, { target: { scrollTop: 500 * 28 } });

    rerender(
      <ProviderModelMenu
        providers={[makeProvider(3)]}
        currentAgentKind="codex"
        currentModel="model-1"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    const rerenderedListbox = await screen.findByRole("listbox", { name: "Models" });
    expect(within(rerenderedListbox).getAllByRole("option").length).toBeGreaterThan(0);
  });

  it("aggregates favorites into a sticky section when multiple providers are visible", async () => {
    render(
      <ProviderModelMenu
        providers={[
          makeNamedProvider("codex", "Codex", 3),
          makeNamedProvider("claude", "Claude", 3),
        ]}
        currentAgentKind="codex"
        currentModel="model-1"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Select model" });
    fireEvent.click(trigger);

    const addButtons = await screen.findAllByRole("button", { name: "Add to favorites" });
    fireEvent.click(addButtons[1]!);

    expect(screen.queryByText("Favorites")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove from favorites" })).toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.click(trigger);

    expect((await screen.findAllByText("Favorites")).length).toBeGreaterThan(0);
  });

  it("shows shortcut sub-provider labels before provider icons", async () => {
    useSharedSettings.setState({
      favoriteModels: [
        { agentKind: "opencode", modelId: "github-copilot/model-1", presentationMode: "gui" },
      ],
      recentModels: [{ agentKind: "opencode", modelId: "openai/model-1", presentationMode: "gui" }],
    });

    render(
      <ProviderModelMenu
        providers={[makeSubProviderBackedProvider(), makeNamedProvider("claude", "Claude", 3)]}
        currentAgentKind="opencode"
        currentModel="github-copilot/model-2"
        presentationMode="gui"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select model" }));

    const assertShortcutRailOrder = async (modelLabel: string, subProviderLabel: string) => {
      let row: Element | null | undefined;
      await waitFor(() => {
        row = screen
          .getAllByText(modelLabel)
          .map((element) => element.closest('[role="option"]'))
          .find((option) => option?.textContent?.includes(subProviderLabel));
        expect(row).not.toBeUndefined();
      });
      expect(row).not.toBeNull();
      const label = within(row as HTMLElement).getByText(subProviderLabel);
      const providerIcon = (row as HTMLElement).querySelector(".poracode-provider-icon");
      expect(providerIcon).not.toBeNull();
      expect(label.compareDocumentPosition(providerIcon as Element)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    };

    await assertShortcutRailOrder("Copilot Model 1", "Copilot");
    await assertShortcutRailOrder("OpenAI Model 1", "OpenAI");
  });

  it("lets a long sub-provider label truncate before the model name", async () => {
    const baseProvider = makeSubProviderBackedProvider();
    const longSubProvider = {
      ...baseProvider,
      capabilities: {
        ...baseProvider.capabilities,
        subProviders: [
          { id: "github-copilot", label: "An Extremely Long Sub-Provider Display Name" },
          { id: "openai", label: "OpenAI" },
        ],
      },
    };
    useSharedSettings.setState({
      favoriteModels: [
        { agentKind: "opencode", modelId: "github-copilot/model-1", presentationMode: "gui" },
      ],
    });

    render(
      <ProviderModelMenu
        providers={[longSubProvider, makeNamedProvider("claude", "Claude", 3)]}
        currentAgentKind="opencode"
        currentModel="github-copilot/model-2"
        presentationMode="gui"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select model" }));

    let row: Element | null | undefined;
    await waitFor(() => {
      row = screen
        .getAllByText("Copilot Model 1")
        .map((element) => element.closest('[role="option"]'))
        .find((option) => option?.textContent?.includes("An Extremely Long Sub-Provider"));
      expect(row).not.toBeUndefined();
    });
    expect(row).not.toBeNull();

    const modelName = within(row as HTMLElement).getByText("Copilot Model 1");
    const subProviderLabel = within(row as HTMLElement).getByText(
      "An Extremely Long Sub-Provider Display Name",
    );
    const subProviderRail = subProviderLabel.parentElement as HTMLElement;

    // The model name owns the flexible space, so it only truncates once the
    // sub-provider rail has fully shrunk. The rail is additionally width-capped
    // so the model always keeps the majority of the row.
    expect(modelName.parentElement?.className).toContain("flex-1");
    expect(subProviderRail.className).toContain("max-w-[45%]");
    expect(subProviderRail.className).not.toContain("shrink-0");
    expect(subProviderLabel.className).toContain("min-w-0");
    expect(subProviderLabel.className).toContain("truncate");
  });

  it("keeps shortcut favorites and recents scoped to the current presentation mode", async () => {
    useSharedSettings.setState({
      favoriteModels: [
        { agentKind: "codex", modelId: "gui-fav", presentationMode: "gui" },
        { agentKind: "codex", modelId: "terminal-fav", presentationMode: "terminal" },
      ],
      recentModels: [
        { agentKind: "codex", modelId: "gui-recent", presentationMode: "gui" },
        { agentKind: "codex", modelId: "terminal-recent", presentationMode: "terminal" },
      ],
    });

    render(
      <ProviderModelMenu
        providers={[
          makeNamedProvider("codex", "Codex", 1),
          makeNamedProvider("claude", "Claude", 1),
        ]}
        currentAgentKind="codex"
        currentModel="model-1"
        presentationMode="gui"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select model" }));

    const listbox = await screen.findByRole("listbox", { name: "Models" });
    expect(within(listbox).getByText("Gui Fav")).toBeInTheDocument();
    expect(within(listbox).getByText("Gui Recent")).toBeInTheDocument();
    expect(within(listbox).queryByText("Terminal Fav")).not.toBeInTheDocument();
    expect(within(listbox).queryByText("Terminal Recent")).not.toBeInTheDocument();
  });

  it("keeps hidden models out of the favorites and recents sections", async () => {
    useSharedSettings.setState({
      favoriteModels: [{ agentKind: "codex", modelId: "model-2", presentationMode: "gui" }],
      recentModels: [
        { agentKind: "codex", modelId: "model-4[1m]", presentationMode: "gui" },
        { agentKind: "codex", modelId: "model-3", presentationMode: "gui" },
      ],
      hiddenModels: { codex: ["model-2", "model-4"] },
    });

    // Callers strip hidden models from the capabilities they pass in, so the
    // visible catalog only carries model-1 and model-3.
    const codex = makeNamedProvider("codex", "Codex", 3);
    codex.capabilities.models = codex.capabilities.models.filter((m) => m.id !== "model-2");

    render(
      <ProviderModelMenu
        providers={[codex, makeNamedProvider("claude", "Claude", 1)]}
        currentAgentKind="codex"
        currentModel="model-1"
        presentationMode="gui"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select model" }));

    const listbox = await screen.findByRole("listbox", { name: "Models" });
    expect(within(listbox).getByText("Recent")).toBeInTheDocument();
    expect(within(listbox).getAllByText("Model 3").length).toBeGreaterThan(0);
    expect(within(listbox).queryAllByText("Favorites")).toHaveLength(0);
    expect(within(listbox).queryAllByText("Model 2")).toHaveLength(0);
    expect(within(listbox).queryAllByText(/Model 4/u)).toHaveLength(0);
  });

  it("does not duplicate favorites into a separate section when only one provider is visible", async () => {
    useSharedSettings.setState({
      favoriteModels: [{ agentKind: "codex", modelId: "model-2", presentationMode: "gui" }],
      recentModels: [],
    });

    render(
      <ProviderModelMenu
        providers={[makeProvider(3)]}
        currentAgentKind="codex"
        currentModel="model-1"
        presentationMode="gui"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select model" }));

    const listbox = await screen.findByRole("listbox", { name: "Models" });
    expect(within(listbox).queryByText("Favorites")).not.toBeInTheDocument();
    const optionLabels = within(listbox)
      .getAllByRole("option")
      .map((o) => o.textContent?.trim());
    expect(optionLabels[0]).toContain("Model 2");
  });

  it("hoists the selected favorite to the top of the single-provider list when reopened", async () => {
    useSharedSettings.setState({
      favoriteModels: [{ agentKind: "codex", modelId: "model-500", presentationMode: "gui" }],
      recentModels: [],
    });

    render(
      <ProviderModelMenu
        providers={[makeProvider(500)]}
        currentAgentKind="codex"
        currentModel="model-500"
        presentationMode="gui"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select model" }));

    const listbox = await screen.findByRole("listbox", { name: "Models" });
    expect(within(listbox).queryByText("Favorites")).not.toBeInTheDocument();
    expect(await within(listbox).findByText("Model 500")).toBeInTheDocument();
    await waitFor(() => expect(listbox.scrollTop).toBe(0));
  });

  it("keeps the scrollbar hidden for short lists too", async () => {
    render(
      <ProviderModelMenu
        providers={[makeProvider(3)]}
        currentAgentKind="codex"
        currentModel="model-1"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select model" }));

    expect(await screen.findByRole("listbox", { name: "Models" })).toHaveClass("no-scrollbar");
  });

  it("shows the selected model sub-provider in the trigger", () => {
    render(
      <ProviderModelMenu
        providers={[
          {
            kind: "opencode",
            label: "OpenCode",
            capabilities: {
              models: [{ id: "opencode/big-pickle", label: "Big Pickle" }],
              subProviders: [{ id: "opencode", label: "OpenCode" }],
              efforts: [],
              modelEfforts: {},
              modes: ["agent"],
              approvalPolicies: [],
              sandboxModes: [],
              supportsResume: true,
              supportsDirectInput: true,
              liveInputMode: "terminal",
              presentationMode: "terminal",
              settingDefs: [],
            },
          },
        ]}
        currentAgentKind="opencode"
        currentModel="opencode/big-pickle"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Select model" });
    expect(within(trigger).getByText("Big Pickle")).toBeInTheDocument();
    expect(within(trigger).getByText("OpenCode")).toBeInTheDocument();
  });

  it("shows Cursor base model rows without embedding speed or context controls", async () => {
    render(
      <ProviderModelMenu
        providers={[makeCursorProvider()]}
        currentAgentKind="cursor"
        currentModel="gpt-5.5"
        lockedAgentKind="cursor"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Select model" });
    expect(within(trigger).getByText("GPT-5.5")).toBeInTheDocument();

    fireEvent.click(trigger);

    const listbox = await screen.findByRole("listbox", { name: "Models" });
    expect(within(listbox).getByText("GPT-5.5")).toBeInTheDocument();
    expect(screen.queryByText("Speed")).not.toBeInTheDocument();
    expect(screen.queryByText("Context")).not.toBeInTheDocument();
  });

  it("shows only the Cursor ACP base model name in the trigger", () => {
    render(
      <ProviderModelMenu
        providers={[
          {
            kind: "cursor",
            label: "Cursor",
            capabilities: {
              models: [
                {
                  id: "gpt-5.5[context=272k,reasoning=medium,fast=false]",
                  label: "GPT-5.5 · 272K · Medium",
                },
              ],
              efforts: [],
              modelEfforts: {
                "gpt-5.5[context=272k,reasoning=medium,fast=false]": [],
              },
              modes: ["agent"],
              approvalPolicies: [],
              sandboxModes: [],
              supportsResume: true,
              supportsDirectInput: true,
              liveInputMode: "terminal",
              presentationMode: "terminal",
              settingDefs: [],
            },
          },
        ]}
        currentAgentKind="cursor"
        currentModel="gpt-5.5[context=272k,reasoning=medium,fast=false]"
        lockedAgentKind="cursor"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Select model" });
    expect(within(trigger).getByText("GPT-5.5")).toBeInTheDocument();
    expect(within(trigger).queryByText("272K")).not.toBeInTheDocument();
    expect(within(trigger).queryByText("Medium")).not.toBeInTheDocument();
  });

  it("uses Cursor base model rows even when other providers are present", async () => {
    render(
      <ProviderModelMenu
        providers={[makeNamedProvider("codex", "Codex", 2), makeCursorProvider()]}
        currentAgentKind="cursor"
        currentModel="composer-2"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select model" }));

    const listbox = await screen.findByRole("listbox", { name: "Models" });
    expect(within(listbox).getByText("Composer 2")).toBeInTheDocument();
  });

  it("normalizes old Cursor variant current models without injecting extra rows", async () => {
    render(
      <ProviderModelMenu
        providers={[makeCursorProvider()]}
        currentAgentKind="cursor"
        currentModel="gpt-5.1-codex-xhigh"
        lockedAgentKind="cursor"
        onChange={vi.fn<(next: { agentKind: string; model: string }) => void>()}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Select model" });
    expect(within(trigger).getByText("Codex 5.1 Max")).toBeInTheDocument();

    fireEvent.click(trigger);

    const listbox = await screen.findByRole("listbox", { name: "Models" });
    expect(within(listbox).getByText("Codex 5.1 Max")).toBeInTheDocument();
    expect(within(listbox).queryByText("Gpt 5.1 Codex Xhigh")).not.toBeInTheDocument();
    expect(within(listbox).queryByText("Gpt 5.1 Codex Max Xhigh")).not.toBeInTheDocument();
    expect(within(listbox).queryByText("Codex 5.1 Extra High")).not.toBeInTheDocument();
  });
});
