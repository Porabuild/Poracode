import { render } from "@testing-library/react";
import { I18nProvider } from "@lingui/react";
import { beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@/renderer/i18n/i18n";
import type { Thread } from "@/shared/contracts";
import type { SideChatBootstrap } from "@/shared/ipc/sideChat";
const mocks = vi.hoisted(() => ({
  thread: undefined as Thread | undefined,
  readThread: vi.fn<(id: string | undefined) => void>(),
}));
vi.mock("@/renderer/state/useThread", () => ({
  useThread: (id: string | undefined) => {
    mocks.readThread(id);
    return mocks.thread;
  },
  useProject: () => undefined,
}));
vi.mock("@/renderer/hooks/uiSelectors", () => ({
  useThreadAgentStatuses: () => [
    {
      kind: "neutral-gui",
      label: "Test Agent",
      capabilities: {
        models: [
          { id: "base", label: "Base model" },
          { id: "child", label: "Child model" },
        ],
      },
    },
  ],
}));
import { SideChatModelText } from "./SideChatModelText";
const source = {
  id: "parent",
  agentKind: "neutral-gui",
  projectId: "project",
  config: { model: "base", effort: "max" },
} as Thread;
const entry = {
  id: "entry",
  source,
  title: "Side chat",
  prompt: "",
  context: null,
} as SideChatBootstrap;
beforeEach(() => {
  mocks.thread = undefined;
  vi.clearAllMocks();
});
it("shows provider, model and effort for an empty side conversation", () => {
  const ui = render(
    <I18nProvider i18n={i18n}>
      <SideChatModelText entry={entry} />
    </I18nProvider>,
  );
  expect(ui.container.textContent).toBe("Test Agent · Base model · Max");
});
it("reads the bound child in the panel and a newly launched child in a detached window", () => {
  mocks.thread = { ...source, id: "bound", config: { model: "child", effort: "high" } };
  const ui = render(
    <I18nProvider i18n={i18n}>
      <SideChatModelText entry={{ ...entry, existingThreadId: "bound" }} />
    </I18nProvider>,
  );
  expect(mocks.readThread).toHaveBeenLastCalledWith("bound");
  expect(ui.container.textContent).toBe("Test Agent · Child model · High");
  mocks.thread = { ...source, id: "launched", config: { model: "child", effort: "high" } };
  ui.rerender(
    <I18nProvider i18n={i18n}>
      <SideChatModelText entry={entry} threadId="launched" />
    </I18nProvider>,
  );
  expect(mocks.readThread).toHaveBeenLastCalledWith("launched");
  expect(ui.container.textContent).toBe("Test Agent · Child model · High");
});
