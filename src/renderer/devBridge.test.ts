import { afterEach, expect, it, vi } from "vitest";
import { installDevBridge } from "./devBridge";

vi.mock("./state/appStore", () => ({ useAppStore: {} }));
vi.mock("./state/agentStatusesStore", () => ({ useAgentStatusesStore: {} }));
vi.mock("./state/panelStore", () => ({ usePanelStore: {} }));
vi.mock("./state/providerUsageStore", () => ({ useProviderUsageStore: {} }));
vi.mock("./state/sharedSettingsStore", () => ({ useSharedSettings: {} }));
vi.mock("./state/pluginsStore", () => ({ usePlugins: {} }));
vi.mock("./state/sidebarUiStore", () => ({ useSidebarUiStore: {} }));
vi.mock("./state/updateStore", () => ({ useUpdateStore: {} }));
vi.mock("./speech/liveVoice", () => ({
  liveVoice: { stop: vi.fn<() => Promise<void>>() },
  useLiveVoice: {},
}));
vi.mock("./state/browserAttachInbox", () => ({ useBrowserAttachInbox: {} }));

vi.mock("./views/FileEditorOverlay/parts/FileEditorPane/parts/localMonacoEditor", () => ({
  default: {},
}));
vi.mock("monaco-editor", () => ({ editor: { getModels: vi.fn<() => unknown[]>() } }));
vi.mock("./lsp", () => ({ lspOrchestrator: {} }));
vi.mock("./state/fileEditorStore", () => ({ useFileEditorStore: {} }));

type SmokeGlobal = typeof globalThis & {
  __poracodeDev?: {
    loadEditorDiagnostics(): Promise<{
      monaco: typeof import("monaco-editor");
      lsp: typeof import("./lsp");
      files: typeof import("./state/fileEditorStore");
    }>;
    loadLiveVoice(): Promise<typeof import("./speech/liveVoice")>;
    loadBrowserAttachInbox(): Promise<typeof import("./state/browserAttachInbox")>;
  };
};
const target = globalThis as SmokeGlobal;

afterEach(() => {
  delete target.__poracodeDev;
  vi.unstubAllEnvs();
});

it("loads the voice and attachment modules through the bundled development bridge", async () => {
  vi.stubEnv("DEV", true);
  installDevBridge();
  expect((await target.__poracodeDev!.loadLiveVoice()).liveVoice.stop).toBeTypeOf("function");
  expect((await target.__poracodeDev!.loadBrowserAttachInbox()).useBrowserAttachInbox).toEqual({});
});

it("does not install renderer smoke module access in production", () => {
  vi.stubEnv("DEV", false);
  installDevBridge();
  expect(target.__poracodeDev).toBeUndefined();
});

it("loads real editor diagnostics lazily through the development bridge", async () => {
  vi.stubEnv("DEV", true);
  installDevBridge();
  const diagnostics = await target.__poracodeDev!.loadEditorDiagnostics();
  expect(diagnostics.monaco.editor.getModels).toBeTypeOf("function");
  expect(diagnostics.lsp.lspOrchestrator).toEqual({});
  expect(diagnostics.files.useFileEditorStore).toEqual({});
});
