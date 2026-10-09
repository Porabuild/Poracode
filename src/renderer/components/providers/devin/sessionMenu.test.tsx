import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ComposerAddMenu } from "@/renderer/components/composer/ComposerAddMenu";
import { DevinSessionControls } from "./liveSessionControls";
import { DEVIN_SESSION_ACTION_IDS } from "./sessionActionIds";

const bridge = vi.hoisted(() => ({
  listThreadSessionActions: vi.fn<() => Promise<{ actions: { id: string }[] }>>(async () => ({
    actions: [DEVIN_REVISE, DEVIN_RULES, "devin.config.list", "devin.config.set"].map((id) => ({
      id,
    })),
  })),
  invokeThreadSessionAction: vi.fn<
    (input: {
      threadId: string;
      actionId: string;
      payload: Record<string, unknown>;
    }) => Promise<Record<string, unknown>>
  >(async () => ({
    rules: [
      {
        name: "Project instructions",
        path: "/project/AGENTS.md",
        provider: "internal-provider-id",
        scope: "project",
        trigger: "always_on",
      },
    ],
  })),
}));
// Literal fixtures match the declared action contract without mocking any UI components.
const DEVIN_REVISE = "devin.command.revise";
const DEVIN_RULES = "devin.rules.list";
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge, isRemoteSession: () => false }));

function Fixture() {
  return (
    <DevinSessionControls
      thread={{ id: "menu-fixture", agentKind: "devin", status: "idle" } as Thread}
      presentationMode="gui"
      isDisabled={false}
    >
      {(actions) => (
        <ComposerAddMenu
          mcpServers={[]}
          showFileOption={false}
          onPickFiles={() => {}}
          sessionActions={actions}
        />
      )}
    </DevinSessionControls>
  );
}

async function openActions() {
  fireEvent.click(await screen.findByRole("button", { name: "Add attachment or capability" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Session actions" }));
}

describe("Devin session add menu with real HeroUI overlays", () => {
  it("opens command revision from plus, closes both menus, and dismisses the dialog with Escape", async () => {
    render(<Fixture />);
    await screen.findByRole("button", { name: "Add attachment or capability" });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    await openActions();
    expect(screen.queryByRole("menuitem", { name: "Session settings" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Revise command" }));
    expect(await screen.findByRole("dialog", { name: "Revise command" })).toBeDefined();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    const input = screen.getByRole("textbox", { name: "Command to revise" });
    fireEvent.keyDown(input, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await openActions();
    expect(screen.getByRole("menuitem", { name: "Rules" })).toBeDefined();
  });

  it("keeps inventory failures and retry inside the plus submenu", async () => {
    bridge.listThreadSessionActions.mockClear();
    bridge.listThreadSessionActions.mockRejectedValueOnce(new Error("socket hang up"));
    render(<Fixture />);
    await screen.findByRole("button", { name: "Add attachment or capability" });
    await waitFor(() => expect(bridge.listThreadSessionActions).toHaveBeenCalled());
    expect(screen.queryByText("socket hang up")).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(await screen.findByRole("button", { name: "Add attachment or capability" }));
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Session actions" }), {
      key: "ArrowRight",
      code: "ArrowRight",
    });
    expect(await screen.findByText("socket hang up")).toBeDefined();
    fireEvent.click(await screen.findByRole("menuitem", { name: /Retry session controls/ }));
    await waitFor(() => expect(bridge.listThreadSessionActions).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
    await openActions();
    expect(screen.getByRole("menuitem", { name: "Rules" })).toBeDefined();
  });

  it("shows readable rules in a dialog without provider implementation fields", async () => {
    bridge.invokeThreadSessionAction.mockClear();
    render(<Fixture />);
    await openActions();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rules" }));
    expect(await screen.findByText("Project instructions")).toBeDefined();
    expect(screen.getByText("/project/AGENTS.md")).toBeDefined();
    expect(screen.getByText("Project · Always applied")).toBeDefined();
    expect(screen.queryByText(/internal-provider-id|always_on|provider:/)).toBeNull();
    expect(bridge.invokeThreadSessionAction).toHaveBeenCalledExactlyOnceWith({
      threadId: "menu-fixture",
      actionId: DEVIN_SESSION_ACTION_IDS.rules,
      payload: {},
    });
  });
});
