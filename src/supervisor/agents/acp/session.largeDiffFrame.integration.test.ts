import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import type { StructuredSessionListener } from "../base";
import { RuntimeEventBuffer } from "../../runtime/threadSession/runtimeEventBuffer";
import { AcpStructuredSession } from "./session";

const FIXTURE = fileURLToPath(new URL("./fixtures/fake-acp-agent.mjs", import.meta.url));

function projectLocation(): ProjectLocation {
  return process.platform === "win32"
    ? { kind: "windows", path: process.cwd() }
    : { kind: "posix", path: process.cwd() };
}

describe("large ACP diff frames", () => {
  it("completes a cumulative multi-file edit without closing the session", async () => {
    const session = AcpStructuredSession.create(
      {
        command: process.execPath,
        args: [FIXTURE],
        env: { FAKE_PROMPT_EDIT_FILES: "6", FAKE_PROMPT_EDIT_FILE_BYTES: "900000" },
      },
      projectLocation(),
      "large-diff-thread",
    );
    const onClose = vi.fn<StructuredSessionListener["onClose"]>();
    const onError = vi.fn<StructuredSessionListener["onError"]>();
    const onUpdate = vi.fn<StructuredSessionListener["onUpdate"]>();
    const onRuntimeEvent = vi.fn<NonNullable<StructuredSessionListener["onRuntimeEvent"]>>();
    const onOverflow = vi.fn<() => void>();
    const buffer = new RuntimeEventBuffer(() => {}, { onOverflow });
    session.setListener({
      onClose,
      onError,
      onUpdate,
      onRuntimeEvent(event) {
        onRuntimeEvent(event);
        buffer.append(event.threadId, event);
      },
    });

    try {
      await session.activate();
      await session.openThread({ model: "fake" });
      await session.startTurn("edit several files", { model: "fake" });

      expect(onError).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      const events = onRuntimeEvent.mock.calls.map(
        ([event]) =>
          event as {
            type?: string;
            state?: string;
            payload?: {
              changeKind?: string;
              status?: string;
              diffSummary?: { added?: number; removed?: number };
            };
          },
      );
      expect(
        events.some((event) => event.type === "turn.completed" && event.state === "completed"),
      ).toBe(true);
      expect(
        events.some(
          (event) =>
            event.type === "item.completed" &&
            event.payload?.changeKind === "edit" &&
            event.payload?.status === "success" &&
            event.payload.diffSummary?.added === 6 &&
            event.payload.diffSummary.removed === 6,
        ),
      ).toBe(true);
      buffer.flush();
      expect(onOverflow).not.toHaveBeenCalled();
      expect(onUpdate).toHaveBeenLastCalledWith({ status: "idle", attention: "none" });
    } finally {
      buffer.clear();
      await session.dispose();
    }
  }, 60_000);
});
