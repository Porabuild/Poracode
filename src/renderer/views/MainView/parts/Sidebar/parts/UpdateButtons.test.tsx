import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useUpdateStore } from "@/renderer/state/updateStore";
import { UpdateButtons } from "./UpdateButtons";

describe("UpdateButtons", () => {
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

  it("renders nothing outside a download phase", () => {
    const { container } = render(<UpdateButtons />);
    expect(container).toBeEmptyDOMElement();
  });

  it("reports determinate progress on the expanded downloading row", () => {
    useUpdateStore.setState({
      phase: "downloading",
      version: "1.2.3",
      downloadPercent: 42.4,
      downloadTransferred: 424,
      downloadTotal: 1000,
    });
    render(<UpdateButtons />);
    const bar = screen.getByRole("progressbar", { name: "Downloading update" });
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(bar).toHaveAttribute("aria-valuetext", "42% · 424 B / 1000 B");
    // The row is icon + bar + percent; label and bytes live on aria + tooltip.
    expect(bar).not.toHaveTextContent("Downloading update");
    expect(bar).not.toHaveTextContent("424 B");
  });

  it("stays indeterminate before the first real total", () => {
    useUpdateStore.setState({ phase: "downloading", version: "1.2.3" });
    const { getByRole } = render(<UpdateButtons />);
    expect(getByRole("progressbar", { name: "Downloading update" })).not.toHaveAttribute(
      "aria-valuenow",
    );
  });

  it("renders the install button once downloaded", () => {
    useUpdateStore.setState({ phase: "downloaded", version: "1.2.3" });
    const { getByRole } = render(<UpdateButtons />);
    expect(getByRole("button", { name: "Install v1.2.3" })).toBeInTheDocument();
  });
});
