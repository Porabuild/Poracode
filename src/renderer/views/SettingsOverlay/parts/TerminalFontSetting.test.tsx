import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { TerminalFontSetting } from "./TerminalFontSetting";

const runtime = vi.hoisted(() => ({ native: false }));

vi.mock("@/renderer/clientRuntime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/clientRuntime")>()),
  hasClientCapability: () => runtime.native,
}));

beforeEach(() => {
  runtime.native = false;
  useSharedSettings.setState({ terminalFontFamily: "" });
});
afterEach(() => Reflect.deleteProperty(window, "queryLocalFonts"));
function inventory(
  query = vi.fn<() => Promise<Array<{ family: string }>>>(async () => [
    { family: "Menlo" },
    { family: "Courier New" },
  ]),
) {
  Object.defineProperty(window, "queryLocalFonts", { configurable: true, value: query });
  return query;
}

describe("TerminalFontSetting", () => {
  it("automatically enumerates fonts in the native app", async () => {
    runtime.native = true;
    const query = inventory();
    render(<TerminalFontSetting />);
    await waitFor(() => expect(query).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByText("Loading fonts…")).toBeNull());
    fireEvent.click(screen.getByLabelText("Terminal font face"));
    expect(await screen.findByRole("option", { name: "Menlo" })).toBeInTheDocument();
  });

  it("lists installed fonts from a browser gesture, persists selection, and lets Default clear it", async () => {
    const query = inventory();
    render(<TerminalFontSetting />);
    expect(query).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Load installed fonts" }));
    await waitFor(() => expect(screen.queryByText("Loading fonts…")).toBeNull());
    fireEvent.click(screen.getByLabelText("Terminal font face"));
    fireEvent.click(await screen.findByRole("option", { name: "Menlo" }));
    expect(useSharedSettings.getState().terminalFontFamily).toBe("Menlo");
    expect(JSON.parse(localStorage.getItem("poracode-shared-settings")!)).toMatchObject({
      terminalFontFamily: "Menlo",
    });
    fireEvent.click(screen.getByLabelText("Terminal font face"));
    fireEvent.click(await screen.findByRole("option", { name: "Default" }));
    expect(useSharedSettings.getState().terminalFontFamily).toBe("");
  });

  it("keeps a saved missing family visible without clearing the preference", async () => {
    inventory();
    useSharedSettings.setState({ terminalFontFamily: "Removed Mono" });
    render(<TerminalFontSetting />);
    fireEvent.click(screen.getByRole("button", { name: "Load installed fonts" }));
    await waitFor(() => expect(screen.queryByText("Loading fonts…")).toBeNull());
    fireEvent.click(screen.getByLabelText("Terminal font face"));
    expect(await screen.findByRole("option", { name: /Removed Mono/ })).toHaveTextContent(
      "Unavailable — using default",
    );
    expect(useSharedSettings.getState().terminalFontFamily).toBe("Removed Mono");
  });

  it("leaves the selector usable after denial and permits retry", async () => {
    inventory(
      vi.fn<() => Promise<Array<{ family: string }>>>().mockRejectedValue(new Error("denied")),
    );
    useSharedSettings.setState({ terminalFontFamily: "Menlo" });
    render(<TerminalFontSetting />);
    fireEvent.click(screen.getByRole("button", { name: "Load installed fonts" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Could not access installed fonts");
    expect(screen.getByRole("button", { name: "Load installed fonts" })).toBeEnabled();
    fireEvent.click(screen.getByLabelText("Terminal font face"));
    fireEvent.click(await screen.findByRole("option", { name: "Default" }));
    expect(useSharedSettings.getState().terminalFontFamily).toBe("");
  });

  it("keeps Default and the saved font usable on unsupported clients", () => {
    useSharedSettings.setState({ terminalFontFamily: "Menlo" });
    render(<TerminalFontSetting />);
    expect(
      screen.getByText("Installed-font selection is unavailable in this client."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Terminal font face")).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Load installed fonts" })).toBeNull();
  });
});
