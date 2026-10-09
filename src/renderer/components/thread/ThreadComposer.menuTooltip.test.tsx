// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ThreadComposer, type ComposerControl } from "./ThreadComposer";

/**
 * Collapsed composer menus must not override OptionMenu's own tooltip: the
 * menu derives the selected option's readable label (the localized accessible
 * placeholder when the value is unset). Supplying the raw `control.value` here
 * is how collapsed family Lead/Sidekick tooltips ended up showing opaque
 * option ids like `claude-fable-5-1-medium`.
 */
const capturedProps: Array<Record<string, unknown>> = [];

vi.mock("@/renderer/components/common/OptionMenu", () => ({
  OptionMenu: (props: Record<string, unknown>) => {
    capturedProps.push(props);
    return <div data-testid="option-menu-capture" />;
  },
}));

describe("ThreadComposer collapsed menu tooltips", () => {
  it("leaves the tooltip derivation to OptionMenu and keeps the accessible identity", () => {
    const controls: ComposerControl[] = [
      {
        kind: "menu",
        value: "claude-fable-5-1-medium",
        options: [
          { id: "claude-fable-5-1-medium", label: "Claude Fable 5.1 Medium" },
          { id: "gpt-5-6-luna-high", label: "GPT-5.6 Luna High" },
        ],
        placeholder: "Lead",
        hideLabelOnWrap: true,
        tier: 4,
      },
      {
        kind: "toggle",
        label: "Fast",
        isSelected: false,
        iconKind: "fast",
        iconOnly: true,
        hideLabelOnWrap: true,
        onChange: vi.fn<(selected: boolean) => void>(),
      },
    ];
    render(
      <ThreadComposer
        controls={controls}
        placeholder="Send a message..."
        prompt=""
        submitDisabled
        submitLabel="Send message"
        onPromptChange={vi.fn<(value: string) => void>()}
        onSubmit={vi.fn<() => void>()}
      />,
    );

    const menus = capturedProps.filter((props) => props.placeholder === "Lead");
    expect(menus.length).toBeGreaterThan(0);
    for (const props of menus) {
      // No tooltip override: OptionMenu derives the selected option label.
      expect(props.tooltip).toBeUndefined();
      // The localized accessible identity survives the collapse.
      expect(props.hideLabelOnWrap).toBe(true);
    }
  });
});
