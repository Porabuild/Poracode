import type { Monaco } from "@monaco-editor/react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { useFileEditorStore } from "@/renderer/state/fileEditorStore";
import { useLspSync } from "./useLspSync";

const lsp = vi.hoisted(() => ({
  ensureServer: vi.fn<() => Promise<null>>().mockResolvedValue(null),
  stopProject: vi.fn<(projectId: string) => Promise<void>>().mockResolvedValue(undefined),
  getSession: vi.fn<(projectId: string, path: string) => undefined>(),
}));

vi.mock("@/renderer/lsp", () => ({ lspOrchestrator: lsp }));
vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (select: (state: { editorLspEnabled: boolean }) => boolean) =>
    select({ editorLspEnabled: true }),
}));

describe("useLspSync workspace scope", () => {
  beforeEach(() => {
    useFileEditorStore.getState().clearSession();
  });
  afterEach(cleanup);

  function mountSync(projectId: string) {
    const path = "C:/Users/example/source.ts";
    useFileEditorStore.getState().setRootContext({
      projectId,
      projectName: "Workspace",
      rootLabel: "Workspace",
      projectLocation: { kind: "windows", path: "C:\\Users\\example" },
    });
    useFileEditorStore.setState({
      buffers: {
        [path]: {
          path,
          status: "ready",
          modifiedAtMs: 1,
          content: "const value = 1;",
          savedContent: "const value = 1;",
          lineEnding: "lf",
          hasBom: false,
          isDirty: false,
          isLoading: false,
        },
      },
    });
    const hook = renderHook(() =>
      useLspSync({ monaco: {} as Monaco, activePath: path, bufferStatus: "ready" }),
    );
    hook.result.current.notifyDidSave(path);
    return hook;
  }

  it("does not start project language services for Home file opens or saves", () => {
    const hook = mountSync(HOME_PROJECT_ID);

    expect(lsp.ensureServer).not.toHaveBeenCalled();
    expect(lsp.getSession).not.toHaveBeenCalled();
    hook.unmount();
    expect(lsp.stopProject).not.toHaveBeenCalled();
  });

  it("keeps language services and cleanup for project file opens", async () => {
    const hook = mountSync("local-project");

    await waitFor(() => expect(lsp.ensureServer).toHaveBeenCalledTimes(1));
    expect(lsp.getSession).toHaveBeenCalledWith("local-project", "C:/Users/example/source.ts");
    hook.unmount();
    expect(lsp.stopProject).toHaveBeenCalledWith("local-project");
  });
});
