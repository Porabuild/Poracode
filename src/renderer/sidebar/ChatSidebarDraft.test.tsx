import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftStartInput } from "@/renderer/components/thread/ThreadDraftComposerArea";
import {
  TurnClientContextSource,
  type TurnClientContextCapture,
} from "@/renderer/components/composer/turnClientContext";

const mocks = vi.hoisted(() => ({
  onStart: undefined as undefined | ((input: DraftStartInput) => Promise<void> | void),
  startThreadFromDraft: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined),
  project: { id: "home", name: "Home", remoteServerId: "server-1" },
}));

vi.mock("@/renderer/components/thread/ThreadDraftView", () => ({
  ThreadDraftView: (props: { onStart: typeof mocks.onStart }) => {
    mocks.onStart = props.onStart;
    return null;
  },
}));
vi.mock("@/renderer/actions/threadLaunchActions", () => ({
  startThreadFromDraft: mocks.startThreadFromDraft,
}));
vi.mock("@/renderer/hooks/uiSelectors", () => ({
  useDraftEnvironment: () => ({ agentStatuses: [], isDetectingAgents: false }),
}));
vi.mock("@/renderer/state/appStore", () => {
  const state = {
    projects: [mocks.project],
    consumeDraftContentDiscard: () => undefined,
  };
  const useAppStore = (selector: (value: typeof state) => unknown) => selector(state);
  useAppStore.getState = () => state;
  return { useAppStore };
});
vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: (selector: (value: { runtime: Record<string, unknown> }) => unknown) =>
    selector({ runtime: {} }),
}));

import { ChatSidebarDraft } from "./ChatSidebarDraft";

const input: DraftStartInput = {
  agentKind: "fixture-agent",
  config: { model: "m" },
  prompt: "what is this page?",
  presentationMode: "gui",
};

beforeEach(() => {
  mocks.onStart = undefined;
  mocks.startThreadFromDraft.mockClear();
});

describe("ChatSidebarDraft", () => {
  it("captures browser focus when the first message is sent and launches with it", async () => {
    const clientContext = { browserFocus: { activeTab: { tabId: 4, title: "Page" } } };
    const capture = vi.fn<TurnClientContextCapture>(async () => clientContext);
    render(
      <TurnClientContextSource value={capture}>
        <ChatSidebarDraft projectId="home" />
      </TurnClientContextSource>,
    );
    expect(capture).not.toHaveBeenCalled();

    await mocks.onStart!(input);

    expect(capture).toHaveBeenCalledTimes(1);
    expect(mocks.startThreadFromDraft).toHaveBeenCalledWith(
      mocks.project,
      { ...input, clientContext },
      { preserveActiveGroup: false },
    );
  });

  it("launches unchanged without a context source", async () => {
    render(<ChatSidebarDraft projectId="home" />);
    await mocks.onStart!(input);
    expect(mocks.startThreadFromDraft).toHaveBeenCalledWith(mocks.project, input, {
      preserveActiveGroup: false,
    });
  });
});
