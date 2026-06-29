// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { QrScanner } from "./QrScanner";

describe("QrScanner", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, "mediaDevices");
    Reflect.deleteProperty(window, "isSecureContext");
  });

  it("surfaces camera playback failures instead of leaving the scanner stuck", async () => {
    const stop = vi.fn<() => void>();
    Object.defineProperty(window, "isSecureContext", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn<() => Promise<MediaStream>>().mockResolvedValue({
          getTracks: () => [{ stop }],
        } as unknown as MediaStream),
      },
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("play failed"));

    render(<QrScanner onResult={() => undefined} onCancel={() => undefined} />);

    await waitFor(() => {
      expect(screen.getByText("Couldn't start the camera")).toBeInTheDocument();
    });
    expect(stop).toHaveBeenCalledOnce();
  });
});
