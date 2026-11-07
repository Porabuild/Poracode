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

const parakeetModel: HexVoiceModel = {
  id: "parakeet_v3",
  name: "Parakeet v3",
  installed: false,
  verified: false,
  downloadBytes: 740_000_000,
  languages: ["en", "ru"],
  supportsLanguageDetection: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.setup.mockResolvedValue(installed);
  mocks.list.mockResolvedValue([parakeetModel]);
  mocks.prepare.mockResolvedValue(undefined);
});

it("shows one setup row and downloads only on explicit action", async () => {
  render(<HexVoiceSettings language="ru" />);
  fireEvent.click(await screen.findByRole("button", { name: "Manage…" }));
  const dialog = await screen.findByRole("dialog", { name: "Hex setup" });
  expect(within(dialog).getByText(/Recordings are processed on workstation/)).toBeVisible();
  await waitFor(() => expect(mocks.list).toHaveBeenCalledWith("ru"));
  expect(mocks.prepare).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Download · 740 MB" }));
  await waitFor(() => expect(mocks.prepare).toHaveBeenCalledWith("parakeet_v3", "ru"));
  expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Use built-in transcription" }),
  ).not.toBeInTheDocument();
});

it("opens setup without installing and keeps installation alive when closed", async () => {
  const missing: HexVoiceSetup = {
    ...installed,
    engine: { ...installed.engine, state: "missing", source: null, version: null },
  };
  mocks.setup.mockResolvedValue(missing);
  const installingSetup: HexVoiceSetup = {
    ...missing,
    engine: { ...missing.engine, state: "installing", progress: 42 },
  };
  mocks.install.mockImplementation(async () => {
    mocks.setup.mockResolvedValue(installingSetup);
    return installingSetup;
  });
  render(<HexVoiceSettings language="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Set up…" }));
  const dialog = await screen.findByRole("dialog", { name: "Hex setup" });
  expect(mocks.install).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole("button", { name: "Install · 70 MB" }));
  await waitFor(() => expect(mocks.install).toHaveBeenCalledOnce());
  await screen.findByText("Installing engine… 42%. Continues if you close this dialog.");
  const progress = within(dialog).getByRole("progressbar", {
    name: "Engine installation progress",
  });
  expect(progress).toHaveAttribute("aria-valuenow", "42");
  const closeButtons = within(dialog).getAllByRole("button", { name: "Close" });
  fireEvent.click(closeButtons[closeButtons.length - 1]!);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(mocks.cancelInstall).not.toHaveBeenCalled();
  expect(screen.getByText("Installing engine… 42%")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Manage…" }));
  const reopened = await screen.findByRole("dialog", { name: "Hex setup" });
  const engineSection = within(reopened).getByRole("region", { name: "Engine" });
  fireEvent.click(within(engineSection).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(mocks.cancelInstall).toHaveBeenCalledOnce());
  expect(mocks.list).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("does not cancel host preparation on unmount and recovers progress when reopened", async () => {
  const first = render(<HexVoiceSettings language="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Manage…" }));
  await screen.findByRole("dialog", { name: "Hex setup" });
  fireEvent.click(await screen.findByRole("button", { name: "Download · 740 MB" }));
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
  expect(await screen.findByText(/42%/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Manage…" }));
  const dialog = await screen.findByRole("dialog", { name: "Hex setup" });
  const progress = within(dialog).getByRole("progressbar", {
    name: "Model preparation progress",
  });
  expect(progress).toHaveAttribute("aria-valuenow", "42");
  const modelSection = within(dialog).getByRole("region", { name: "Voice model" });
  fireEvent.click(within(modelSection).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(mocks.cancelPreparation).toHaveBeenCalledWith("host-preparation"));
});

it("explains unsupported hosts without offering installation", async () => {
  mocks.setup.mockResolvedValue({
    ...installed,
    engine: { ...installed.engine, state: "unsupported", source: null, error: "incompatible" },
  });
  render(<HexVoiceSettings language="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Set up…" }));
  expect(await screen.findByText(/requires glibc 2\.39/)).toBeVisible();
  expect(screen.queryByRole("button", { name: /^Install/ })).not.toBeInTheDocument();
});

it("requires confirmation to remove a managed engine and never offers to remove an external one", async () => {
  mocks.removeEngine.mockResolvedValue(installed);
  const first = render(<HexVoiceSettings language="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Manage…" }));
  const dialog = await screen.findByRole("dialog", { name: "Hex setup" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
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
  fireEvent.click(await screen.findByRole("button", { name: "Manage…" }));
  const externalDialog = await screen.findByRole("dialog", { name: "Hex setup" });
  expect(within(externalDialog).getByText(/Using your existing Hex installation/)).toBeVisible();
  expect(within(externalDialog).queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
});

it("shows external engines without a version", async () => {
  mocks.setup.mockResolvedValue({
    ...installed,
    engine: { ...installed.engine, source: "external", version: null },
  });
  render(<HexVoiceSettings language="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Manage…" }));
  const dialog = await screen.findByRole("dialog", { name: "Hex setup" });
  expect(
    within(dialog).getByText("Using your existing Hex installation. Poracode will not modify it."),
  ).toBeVisible();
  expect(within(dialog).queryByText(/null/)).not.toBeInTheDocument();
});

it("shows a failed cancel under the engine step", async () => {
  const missing: HexVoiceSetup = {
    ...installed,
    engine: { ...installed.engine, state: "missing", source: null, version: null },
  };
  const installingSetup: HexVoiceSetup = {
    ...missing,
    engine: { ...missing.engine, state: "installing", progress: 42 },
  };
  mocks.setup.mockResolvedValue(missing);
  mocks.install.mockImplementation(async () => {
    mocks.setup.mockResolvedValue(installingSetup);
    return installingSetup;
  });
  mocks.cancelInstall.mockRejectedValue(new Error("Cancel failed"));
  render(<HexVoiceSettings language="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Set up…" }));
  const dialog = await screen.findByRole("dialog", { name: "Hex setup" });
  fireEvent.click(await screen.findByRole("button", { name: "Install · 70 MB" }));
  await waitFor(() => expect(mocks.install).toHaveBeenCalledOnce());
  const engineSection = within(dialog).getByRole("region", { name: "Engine" });
  fireEvent.click(await within(engineSection).findByRole("button", { name: "Cancel" }));
  expect(await within(engineSection).findByRole("alert")).toHaveTextContent("Cancel failed");
  const modelSection = within(dialog).getByRole("region", { name: "Voice model" });
  expect(within(modelSection).queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("status", { hidden: true })).toHaveTextContent("Cancel failed");
});

it("shows a failed removal under the engine step", async () => {
  mocks.removeEngine.mockRejectedValue(new Error("Remove failed"));
  render(<HexVoiceSettings language="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Manage…" }));
  const dialog = await screen.findByRole("dialog", { name: "Hex setup" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
  const confirmation = await screen.findByRole("alertdialog");
  fireEvent.click(within(confirmation).getByRole("button", { name: "Remove engine" }));
  await waitFor(() => expect(mocks.removeEngine).toHaveBeenCalledOnce());
  fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }));
  const engineSection = within(dialog).getByRole("region", { name: "Engine" });
  expect(await within(engineSection).findByRole("alert")).toHaveTextContent("Remove failed");
  const modelSection = within(dialog).getByRole("region", { name: "Voice model" });
  expect(within(modelSection).queryByRole("alert")).not.toBeInTheDocument();
});

it("names the model while it prepares", async () => {
  mocks.prepare.mockImplementation(async () => {
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
  });
  render(<HexVoiceSettings language="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Manage…" }));
  const dialog = await screen.findByRole("dialog", { name: "Hex setup" });
  fireEvent.click(await within(dialog).findByRole("button", { name: "Download · 740 MB" }));
  await waitFor(() => expect(mocks.prepare).toHaveBeenCalledWith("parakeet_v3", "en"));
  expect(
    await within(dialog).findByText(
      "Preparing Parakeet v3… 42%. Continues if you close this dialog.",
    ),
  ).toBeVisible();
  expect(screen.getByRole("status", { hidden: true })).toHaveTextContent(
    "Preparing Parakeet v3… 42%",
  );
});

it("keeps both progress tracks mounted so the dialog height is stable", async () => {
  render(<HexVoiceSettings language="en" />);
  fireEvent.click(await screen.findByRole("button", { name: "Manage…" }));
  const dialog = await screen.findByRole("dialog", { name: "Hex setup" });
  expect(within(dialog).queryByRole("progressbar")).not.toBeInTheDocument();
  expect(dialog.querySelectorAll('[aria-hidden="true"].h-1')).toHaveLength(2);
});
