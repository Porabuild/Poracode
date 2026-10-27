import { fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import { usePanelStore } from "@/renderer/state/panelStore";

const { crossagentsContent } = vi.hoisted(() => ({
  crossagentsContent: vi.fn<(content: ReactNode) => void>(),
}));

vi.mock("@/renderer/components/mcp/McpServersManager", () => ({
  McpServersManager: (props: { builtInSettings?: Record<string, { content?: ReactNode }> }) => {
    crossagentsContent(props.builtInSettings?.crossagents?.content);
    return <>{props.builtInSettings?.crossagents?.content}</>;
  },
}));

vi.mock("./CrossagentRoutingSection", () => ({ CrossagentRoutingSection: () => null }));

import { McpServersSettings } from "./McpServersSettings";

describe("McpServersSettings Crews link", () => {
  it("opens Crews settings from the Crossagents row", () => {
    renderWithI18n(<McpServersSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Crews" }));
    expect(usePanelStore.getState().settingsSection).toBe("crews");
    expect(crossagentsContent).toHaveBeenCalled();
  });
});
