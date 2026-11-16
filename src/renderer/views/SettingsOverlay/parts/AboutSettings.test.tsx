import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const bridgeMock = vi.hoisted(() => ({
  openExternal: vi.fn<(url: string) => Promise<void>>(),
  checkForUpdate: vi.fn<() => Promise<void>>(),
  installUpdate: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    appVersion: "1.0.0",
    channel: "stable",
    electronVersion: "43.1.0",
    openExternal: bridgeMock.openExternal,
    checkForUpdate: bridgeMock.checkForUpdate,
    installUpdate: bridgeMock.installUpdate,
  }),
}));

import { useUpdateStore } from "@/renderer/state/updateStore";
import { AboutSettings } from "./AboutSettings";

describe("AboutSettings update download", () => {
  beforeEach(() => {
    useUpdateStore.setState({
      phase: "idle",
      version: null,
      downloadPercent: 0,
      errorMessage: null,
      downloadTransferred: null,
      downloadTotal: null,
      downloadBytesPerSecond: null,
    });
  });

  it("does not show a stuck 0% before the first download-progress event", () => {
    useUpdateStore.setState({ phase: "downloading", version: "1.6.3-nightly.202608160500" });
    render(<AboutSettings />);

    expect(screen.getByRole("progressbar", { name: "Downloading update" })).not.toHaveAttribute(
      "aria-valuenow",
    );
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("shows percent once a real total arrives", () => {
    useUpdateStore.setState({
      phase: "downloading",
      version: "1.6.3-nightly.202608160500",
      downloadPercent: 42.4,
      downloadTransferred: 424,
      downloadTotal: 1000,
    });
    render(<AboutSettings />);

    expect(screen.getByRole("progressbar", { name: "Downloading update" })).toHaveAttribute(
      "aria-valuenow",
      "42",
    );
    expect(screen.getByText("42%")).toBeInTheDocument();
  });
});

describe("AboutSettings", () => {
  it("shows app details and links without the retired data import action", () => {
    useUpdateStore.setState({ phase: "idle" });
    render(<AboutSettings />);

    expect(screen.getByText("1.0.0")).toBeVisible();
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Website" })).toBeVisible();
    expect(screen.queryByText(/Lightcode/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Import/ })).not.toBeInTheDocument();
  });
});
