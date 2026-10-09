import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ListImportableSessionsPayload } from "@/shared/contracts";
import { createCodexSessionImport } from "@/supervisor/agents/codex/sessionImport";
import { SessionImportScanner } from "@/supervisor/sessionImport/scanner";
import { useAppStore } from "@/renderer/state/appStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ImportSessionsPanel } from "./ImportSessionsPanel";

const scan = vi.hoisted(() => ({
  list: (_payload: unknown): Promise<unknown> => Promise.reject(new Error("no scanner")),
}));

vi.mock("@/renderer/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/renderer/bridge")>()),
  isWindows: () => false,
  readBridge: () => ({ listImportableSessions: (payload: unknown) => scan.list(payload) }),
}));

let home: string;

function writeRollout(id: string, prompt: string, cwd: string) {
  const dir = join(home, "sessions", "2026", "09", "29");
  mkdirSync(dir, { recursive: true });
  const lines = [
    { type: "session_meta", payload: { id, cwd } },
    {
      type: "response_item",
      payload: { type: "message", role: "user", content: [{ type: "input_text", text: prompt }] },
    },
  ];
  writeFileSync(
    join(dir, `rollout-2026-09-29T01-00-00-${id}.jsonl`),
    `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`,
  );
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "poracode-import-panel-"));
  writeRollout("019a0bc7-0000-0000-0000-00000000000a", "Find the violet lantern", "/repo/alpha");
  writeRollout("019a0bc7-0000-0000-0000-00000000000b", "Rename the button", "/repo/beta");
  const scanner = new SessionImportScanner(() => [
    { agentKind: "codex", source: createCodexSessionImport(home) },
  ]);
  scan.list = vi.fn<(payload: unknown) => Promise<unknown>>((payload) =>
    scanner.list(payload as ListImportableSessionsPayload),
  );
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  useAppStore.setState({ threads: [], projects: [] });
});

describe("ImportSessionsPanel", () => {
  it("keeps a preview-text match after the debounced rescan", async () => {
    render(<ImportSessionsPanel />);
    await screen.findByText("Find the violet lantern");

    fireEvent.change(screen.getByLabelText("Search sessions"), { target: { value: "violet" } });
    expect(screen.queryByText("Rename the button")).toBeNull();

    // The rescan for the debounced query replaces the list with the server's
    // answer; the match must survive it and stay selectable.
    await waitFor(() => expect(scan.list).toHaveBeenCalledWith({ query: "violet" }), {
      timeout: 3000,
    });
    await waitFor(() => expect(screen.getByRole("list")).toHaveAttribute("aria-busy", "false"));
    const match = screen.getByRole("checkbox", { name: "Find the violet lantern" });
    expect(match).not.toBeDisabled();
    fireEvent.click(match);
    expect(screen.getByRole("button", { name: "Import 1 session" })).not.toBeDisabled();
  });
});
