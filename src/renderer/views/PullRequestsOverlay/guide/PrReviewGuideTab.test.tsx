import { createHash } from "node:crypto";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { AgentStatus, ForgePrReviewGuideResult } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

const bridge = vi.hoisted(() => ({
  forgeGetPrReviewGuide: vi.fn<(...args: unknown[]) => Promise<ForgePrReviewGuideResult>>(),
  forgeWritePrReviewGuide: vi.fn<(...args: unknown[]) => Promise<ForgePrReviewGuideResult>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge, isRemoteSession: () => false }));
import { PrReviewGuideTab } from "./PrReviewGuideTab";

const input = {
  projectLocation: { kind: "posix" as const, path: "/repo" },
  forgeAccount: { forge: "gitlab" as const, host: "https://git.example", login: "alice" },
  forgeRepository: "team/app",
  prNumber: 7,
};
const rawDiff = "displayed diff";
const ready: ForgePrReviewGuideResult = {
  diffHash: createHash("sha256").update(rawDiff).digest("hex"),
  status: "ready",
  stale: false,
  guide: {
    version: 1,
    fingerprint: "one",
    createdAt: "2026-10-20T00:00:00Z",
    model: "writer-model",
    summary: "The complete change",
    stops: [
      {
        title: "First stop",
        body: "Read behavior",
        files: ["a.ts"],
        lookClosely: true,
        excerpts: [
          { path: "a.ts", side: "RIGHT", startLine: 1, endLine: 1, text: "currentCode()" },
        ],
        questions: [],
      },
      {
        title: "Mechanical changes",
        body: "Generated snapshots",
        files: ["snapshot.txt"],
        lookClosely: false,
        excerpts: [],
        questions: [],
      },
    ],
  },
};
const writer: AgentStatus = {
  kind: "fixture-writer",
  label: "Writer",
  installed: true,
  authState: "authenticated",
  capabilities: {
    supportsOneShot: true,
    supportsReadOnlyOneShotWorkspace: true,
    models: [{ id: "writer-model", label: "Writer model" }],
    efforts: [],
    modelEfforts: {},
    modes: [],
    sandboxModes: [],
    approvalPolicies: [],
    supportsResume: false,
    supportsDirectInput: true,
    liveInputMode: "terminal",
    presentationMode: "terminal",
    settingDefs: [],
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  bridge.forgeGetPrReviewGuide.mockResolvedValue(ready);
  bridge.forgeWritePrReviewGuide.mockResolvedValue({
    status: "generating",
    stale: false,
    guide: null,
  });
  useAgentStatusesStore.setState({ agentStatuses: [writer], wslAgentStatuses: [] });
  useSharedSettings.setState({
    commitGenProvider: "auto",
    commitGenModel: "",
    commitGenEffort: "",
    commitGenFast: false,
    commitGenSelection: undefined,
  });
});

it("navigates stops, opens files and offers the finish action on the last stop", async () => {
  const select = vi.fn<(path: string) => void>();
  render(
    <PrReviewGuideTab
      input={input}
      rawDiff={rawDiff}
      disabled={false}
      onSelectFile={select}
      finishReview={<button type="button">Finish review</button>}
    />,
  );
  expect(await screen.findByText("First stop")).toBeInTheDocument();
  expect(await screen.findByText("currentCode()")).toBeInTheDocument();
  expect(screen.getByText("Look closely")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "a.ts" }));
  expect(select).toHaveBeenCalledWith("a.ts");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Mechanical changes")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Finish review" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByText("First stop")).toBeInTheDocument();
});

it("asks about the current stop, a suggested question and the exact excerpt", async () => {
  const ask = vi.fn<(context: string) => void>();
  bridge.forgeGetPrReviewGuide.mockResolvedValue({
    ...ready,
    guide: {
      ...ready.guide!,
      stops: [{ ...ready.guide!.stops[0]!, questions: ["Why does this change behavior?"] }],
    },
  });
  const view = render(
    <PrReviewGuideTab
      input={input}
      rawDiff={rawDiff}
      disabled={false}
      onSelectFile={() => {}}
      onAskAgent={ask}
      finishReview={null}
    />,
  );
  await screen.findByText("First stop");
  const actions = screen.getAllByRole("button", { name: "Ask agent" });
  fireEvent.click(actions[0]!);
  expect(JSON.parse(ask.mock.calls[0]![0])).toEqual({
    title: "First stop",
    body: "Read behavior",
    files: ["a.ts"],
  });
  fireEvent.click(screen.getByRole("button", { name: "Why does this change behavior?" }));
  expect(JSON.parse(ask.mock.calls[1]![0]).question).toBe("Why does this change behavior?");
  fireEvent.click(actions[1]!);
  expect(JSON.parse(ask.mock.calls[2]![0]).excerpt).toEqual(ready.guide!.stops[0]!.excerpts[0]);
  view.rerender(
    <PrReviewGuideTab
      input={input}
      rawDiff="newer diff"
      disabled={false}
      onSelectFile={() => {}}
      onAskAgent={ask}
      finishReview={null}
    />,
  );
  expect(screen.queryByRole("button", { name: "Ask agent" })).not.toBeInTheDocument();
});

it("hides all excerpts of a stale guide while retaining its text and rewrite action", async () => {
  bridge.forgeGetPrReviewGuide.mockResolvedValue({ ...ready, stale: true });
  render(
    <PrReviewGuideTab
      input={input}
      rawDiff={rawDiff}
      disabled={false}
      onSelectFile={() => {}}
      finishReview={null}
    />,
  );
  expect(await screen.findByText(/This guide is out of date/)).toBeInTheDocument();
  expect(screen.getByText("First stop")).toBeInTheDocument();
  expect(screen.queryByText("currentCode()")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Rewrite guide" })).toBeEnabled();
});

it("starts one scoped writer with the selected model and preserves the original request after leaving", async () => {
  bridge.forgeGetPrReviewGuide.mockResolvedValue({ status: "empty", stale: false, guide: null });
  const view = render(
    <PrReviewGuideTab
      input={input}
      rawDiff={rawDiff}
      disabled={false}
      onSelectFile={() => {}}
      finishReview={null}
    />,
  );
  await waitFor(() => expect(screen.getByRole("button", { name: "Write guide" })).toBeEnabled());
  fireEvent.change(screen.getByRole("textbox", { name: "Review guide instructions" }), {
    target: { value: "Show risks first" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Write guide" }));
  await waitFor(() =>
    expect(bridge.forgeWritePrReviewGuide).toHaveBeenCalledExactlyOnceWith({
      ...input,
      agentKind: writer.kind,
      selection: { model: "writer-model", effort: "", fast: false },
      instructions: "Show risks first",
    }),
  );
  expect(await screen.findByText(/You can leave this review/)).toBeInTheDocument();
  view.unmount();
  expect(bridge.forgeWritePrReviewGuide).toHaveBeenCalledTimes(1);
});

it("hides excerpts from a newer guide until its diff is displayed", async () => {
  bridge.forgeGetPrReviewGuide.mockResolvedValue({ ...ready, diffHash: "0".repeat(64) });
  render(
    <PrReviewGuideTab
      input={input}
      rawDiff={rawDiff}
      disabled={false}
      onSelectFile={() => {}}
      finishReview={null}
    />,
  );
  expect(await screen.findByText("First stop")).toBeInTheDocument();
  expect(screen.getByText(/This guide is out of date/)).toBeInTheDocument();
  expect(screen.queryByText("currentCode()")).not.toBeInTheDocument();
});

it("renders matching excerpts without WebCrypto on a plaintext LAN origin", async () => {
  vi.stubGlobal("crypto", undefined);
  try {
    const view = render(
      <PrReviewGuideTab
        input={input}
        rawDiff={rawDiff}
        disabled={false}
        onSelectFile={() => {}}
        finishReview={null}
      />,
    );
    expect(await screen.findByText("currentCode()")).toBeInTheDocument();
    view.unmount();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("waits until the selected review is ready and never offers an unqualified writer", async () => {
  useAgentStatusesStore.setState({
    agentStatuses: [
      {
        ...writer,
        capabilities: { ...writer.capabilities, supportsReadOnlyOneShotWorkspace: false },
      },
    ],
  });
  const view = render(
    <PrReviewGuideTab
      input={input}
      rawDiff={rawDiff}
      disabled
      onSelectFile={() => {}}
      finishReview={null}
    />,
  );
  expect(bridge.forgeGetPrReviewGuide).not.toHaveBeenCalled();
  view.rerender(
    <PrReviewGuideTab
      input={input}
      rawDiff={rawDiff}
      disabled={false}
      onSelectFile={() => {}}
      finishReview={null}
    />,
  );
  expect(await screen.findByText("First stop")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Rewrite guide" })).toBeDisabled();
});

it("keeps cached guide navigation available without permitting a rewrite", async () => {
  render(
    <PrReviewGuideTab
      input={input}
      rawDiff={rawDiff}
      disabled={false}
      readOnly
      onSelectFile={() => {}}
      finishReview={null}
    />,
  );
  expect(await screen.findByText("First stop")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Rewrite guide" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Mechanical changes")).toBeInTheDocument();
  expect(bridge.forgeWritePrReviewGuide).not.toHaveBeenCalled();
});
