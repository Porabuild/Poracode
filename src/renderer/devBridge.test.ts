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

type SmokeGlobal = typeof globalThis & {
  __poracodeDev?: {
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
