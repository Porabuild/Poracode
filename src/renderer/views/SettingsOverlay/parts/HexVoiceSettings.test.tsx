import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { HexVoiceModel, HexVoiceSetup } from "@/shared/contracts/hexVoice";
import { HexVoiceSettings } from "./HexVoiceSettings";

const mocks = vi.hoisted(() => ({
  setup: vi.fn<() => Promise<HexVoiceSetup>>(),
  list: vi.fn<(language: string) => Promise<HexVoiceModel[]>>(),
  prepare: vi.fn<(model: string, language: string) => Promise<void>>(),
  cancelPreparation: vi.fn<(id: string) => Promise<void>>(),
  install: vi.fn<() => Promise<HexVoiceSetup>>(),
  cancelInstall: vi.fn<() => Promise<HexVoiceSetup>>(),
  removeEngine: vi.fn<() => Promise<HexVoiceSetup>>(),
  set: vi.fn<(key: string, value: unknown) => void>(),
  openExternal: vi.fn<(...args: unknown[]) => void>(),
}));
vi.mock("@/renderer/speech/useHexVoiceSession", () => ({ useHexVoiceSession: () => mocks }));
vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (state: unknown) => unknown) =>
    selector({ audio: { hexModel: "parakeet_v3" }, setAudioSetting: mocks.set }),
}));
vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: () => true,
  readBridge: () => ({ openExternal: mocks.openExternal }),
}));

const installed: HexVoiceSetup = {
  hostName: "workstation",
  platform: "linux",
  arch: "x64",
  engine: {
    state: "installed",
    source: "managed",
    version: "3.1.1",
    availableVersion: "3.1.1",
    downloadBytes: 69_129_928,
  },
  preparation: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.setup.mockResolvedValue(installed);
  mocks.list.mockResolvedValue([
    {
      id: "parakeet_v3",
      name: "Parakeet v3",
      installed: false,
      verified: false,
      downloadBytes: 740_000_000,
      languages: ["en", "ru"],
      supportsLanguageDetection: false,
    },
  ]);
  mocks.prepare.mockResolvedValue(undefined);
});

it("shows the processing host and an explicit download action without downloading on selection", async () => {
  render(<HexVoiceSettings language="ru" />);
  const download = await screen.findByRole("button", { name: "Download model · 740 MB" });
  expect(mocks.list).toHaveBeenCalledWith("ru");
  expect(screen.getByText(/Recordings are processed on workstation/)).toBeVisible();
  expect(mocks.prepare).not.toHaveBeenCalled();
  fireEvent.click(download);
  await waitFor(() => expect(mocks.prepare).toHaveBeenCalledWith("parakeet_v3", "ru"));
});

it("opens management without installing and keeps installation alive when closed", async () => {
  const missing: HexVoiceSetup = {
    ...installed,
    engine: { ...installed.engine, state: "missing", source: null, version: null },
  };
  mocks.setup.mockResolvedValue(missing);
  const installing: HexVoiceSetup = {
    ...missing,
    engine: { ...missing.engine, state: "installing", progress: 42 },
  };
  mocks.install.mockImplementation(async () => {
    mocks.setup.mockResolvedValue(installing);
    return installing;
  });
  render(<HexVoiceSettings language="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Set up Hex…" }));
  expect(await screen.findByRole("dialog", { name: "Manage Hex" })).toBeVisible();
  expect(mocks.install).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button", { name: "Install Hex · 70 MB" }));
  await waitFor(() => expect(mocks.install).toHaveBeenCalledOnce());
  await screen.findByText("Installation continues when you close this dialog.");
  fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(mocks.cancelInstall).not.toHaveBeenCalled();
  expect(screen.getByText("42%")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Manage Hex…" }));
  const reopened = await screen.findByRole("dialog", { name: "Manage Hex" });
  expect(within(reopened).getByText("42%")).toBeVisible();
  fireEvent.click(within(reopened).getByRole("button", { name: "Cancel installation" }));
  await waitFor(() => expect(mocks.cancelInstall).toHaveBeenCalledOnce());
  expect(mocks.list).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("does not cancel host preparation on unmount and recovers progress when reopened", async () => {
  const first = render(<HexVoiceSettings language="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Download model · 740 MB" }));
  await waitFor(() => expect(mocks.prepare).toHaveBeenCalledOnce());
  first.unmount();
  expect(mocks.cancelPreparation).not.toHaveBeenCalled();
  mocks.setup.mockResolvedValue({
    ...installed,
    preparation: {
      id: "host-preparation",
      model: "parakeet_v3",
      language: "en",
      phase: "preparing",
      progress: 42,
    },
  });
  render(<HexVoiceSettings language="ru" />);
  expect(await screen.findByText("42%")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Cancel download" }));
  await waitFor(() => expect(mocks.cancelPreparation).toHaveBeenCalledWith("host-preparation"));
});

it("offers built-in transcription when the host cannot install Hex", async () => {
  mocks.setup.mockResolvedValue({
    ...installed,
    engine: { ...installed.engine, state: "unsupported", source: null, error: "incompatible" },
  });
  render(<HexVoiceSettings language="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Set up Hex…" }));
  await screen.findByText(/Managed installation is not available/);
  expect(screen.queryByRole("button", { name: /Install Hex/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Use built-in transcription" }));
  expect(mocks.set).toHaveBeenCalledWith("transcriptionBackend", "transformers");
});

it("requires confirmation to remove a managed engine and never offers to remove an external one", async () => {
  mocks.removeEngine.mockResolvedValue(installed);
  const first = render(<HexVoiceSettings language="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Manage Hex…" }));
  fireEvent.click(await screen.findByRole("button", { name: "Remove managed engine" }));
  const confirmation = await screen.findByRole("alertdialog");
  expect(mocks.removeEngine).not.toHaveBeenCalled();
  fireEvent.click(within(confirmation).getByRole("button", { name: "Remove engine" }));
  await waitFor(() => expect(mocks.removeEngine).toHaveBeenCalledOnce());
  first.unmount();
  mocks.setup.mockResolvedValue({
    ...installed,
    engine: { ...installed.engine, source: "external" },
  });
  render(<HexVoiceSettings language="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Manage Hex…" }));
  const externalDialog = await screen.findByRole("dialog", { name: "Manage Hex" });
  expect(within(externalDialog).getByText(/Using your existing Hex installation/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Remove managed engine" })).not.toBeInTheDocument();
});
