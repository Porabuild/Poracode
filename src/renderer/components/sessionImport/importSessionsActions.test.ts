import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, ImportableSession, Project } from "@/shared/contracts";
import { shouldRelaunchThreadOnOpen } from "@/shared/threadRelaunch";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { importSessions, resolveImportModel } from "./importSessionsActions";

const importSessionTranscript = vi.hoisted(() =>
  vi.fn<(payload: unknown) => Promise<{ messageCount: number }>>(),
);
const toastDanger = vi.hoisted(() => vi.fn<(message: string) => void>());

vi.mock("@/renderer/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/bridge")>()),
  isWindows: () => false,
  readBridge: () => ({ importSessionTranscript }),
}));
vi.mock("@heroui/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@heroui/react")>()),
  toast: { danger: toastDanger, success: vi.fn<(message: string) => void>() },
}));

const project: Project = {
  id: "fallback",
  name: "fallback",
  location: { kind: "posix", path: "/fallback" },
} as Project;

const session: ImportableSession = {
  id: "agent:ses-1",
  agentKind: "agent",
  providerSessionId: "ses-1",
  path: "/home/u/.agent/sessions/ses-1.jsonl",
  cwd: "/gone",
  cwdExists: false,
  updatedAt: "2026-09-29T00:00:00.000Z",
  preview: "fix the bug",
  model: "agent-model",
};

afterEach(() => {
  useAppStore.setState({ threads: [], projects: [], view: { kind: "home" } });
  importSessionTranscript.mockReset();
  toastDanger.mockReset();
});

function codexStatus(models: readonly { id: string; label: string }[]): AgentStatus {
  return { kind: "codex", capabilities: { models } } as AgentStatus;
}

describe("resolveImportModel", () => {
  afterEach(() => {
    useAgentStatusesStore.setState({ agentStatuses: [] });
    useSharedSettings.setState({ providerConfigs: {} });
  });

  it("fails closed when the catalog is empty and the session has no model", () => {
    useAppStore.setState({ projects: [project] });
    useAgentStatusesStore.setState({ agentStatuses: [codexStatus([])] });
    useSharedSettings.setState({
      providerConfigs: {
        codex: { model: "gpt-5.4", mode: "agent", approvalPolicy: "on-request", sandboxMode: "" },
      },
    });
    const { model: _model, ...withoutModel } = session;

    expect(resolveImportModel({ ...withoutModel, agentKind: "codex" }, project.id)).toBe("");
  });

  it("keeps the session model when the catalog is empty", () => {
    useAppStore.setState({ projects: [project] });
    useAgentStatusesStore.setState({ agentStatuses: [codexStatus([])] });

    expect(
      resolveImportModel({ ...session, agentKind: "codex", model: "gpt-5.4" }, project.id),
    ).toBe("gpt-5.4");
  });

  it("uses a saved model only when the catalog offers it", () => {
    useAppStore.setState({ projects: [project] });
    useAgentStatusesStore.setState({
      agentStatuses: [codexStatus([{ id: "gpt-5.4", label: "5.4" }])],
    });
    useSharedSettings.setState({
      providerConfigs: {
        codex: { model: "gpt-5.4", mode: "agent", approvalPolicy: "on-request", sandboxMode: "" },
      },
    });
    const { model: _model, ...withoutModel } = session;

    expect(resolveImportModel({ ...withoutModel, agentKind: "codex" }, project.id)).toBe("gpt-5.4");
  });
});

describe("importSessions", () => {
  it("creates a thread that resumes through the normal reopen path", async () => {
    useAppStore.setState({ projects: [project] });
    importSessionTranscript.mockResolvedValue({ messageCount: 2 });

    const result = await importSessions({ sessions: [session], fallbackProjectId: "fallback" });

    const [thread] = useAppStore.getState().threads;
    expect(result).toMatchObject({ imported: 1, failed: 0 });
    expect(thread).toMatchObject({
      projectId: "fallback",
      agentKind: "agent",
      presentationMode: "gui",
      status: "inactive",
      sessionRef: { providerSessionId: "ses-1" },
      config: { model: "agent-model", importedFrom: { path: session.path } },
    });
    // Opening it relaunches with an empty prompt, like any restored thread —
    // no resume-with-prompt special case in the spawn pipeline.
    expect(shouldRelaunchThreadOnOpen(thread!)).toBe(true);
    expect(importSessionTranscript).toHaveBeenCalledWith({
      threadId: thread!.id,
      agentKind: "agent",
      path: session.path,
      providerSessionId: "ses-1",
    });
  });

  it("does not import a session another thread already holds", async () => {
    useAppStore.setState({ projects: [project] });
    importSessionTranscript.mockResolvedValue({ messageCount: 1 });
    await importSessions({ sessions: [session], fallbackProjectId: "fallback" });

    const again = await importSessions({ sessions: [session], fallbackProjectId: "fallback" });

    expect(useAppStore.getState().threads).toHaveLength(1);
    expect(importSessionTranscript).toHaveBeenCalledTimes(1);
    expect(again.threadIds.get(session.id)).toBe(useAppStore.getState().threads[0]!.id);
  });

  it("rolls the thread back when the replay fails", async () => {
    useAppStore.setState({ projects: [project] });
    importSessionTranscript.mockRejectedValue(new Error("boom"));

    const result = await importSessions({ sessions: [session], fallbackProjectId: "fallback" });

    expect(result).toMatchObject({ imported: 0, failed: 1 });
    expect(useAppStore.getState().threads).toEqual([]);
    expect(toastDanger).toHaveBeenCalledWith("boom");
  });
});
