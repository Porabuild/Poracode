import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
import type { RuntimeEvent, ThreadConfig } from "@/shared/contracts";
import { ClaudeSdkSession } from "@/supervisor/agents/claude/sdkSession";

// Opt-in: requires an authenticated Claude CLI and consumes two live turns.
it.runIf(process.env.PORACODE_LIVE_CLAUDE_STEER === "1")(
  "finishes live foreground Bash before answering a steered follow-up",
  async () => {
    await mkdir(resolve("tmp"), { recursive: true });
    const cwd = await mkdtemp(resolve("tmp/claude-steer-"));
    const config: ThreadConfig = {
      model: "haiku",
      mode: "agent",
      approvalPolicy: "bypassPermissions",
    };
    const events: RuntimeEvent[] = [];
    const statuses: string[] = [];
    const errors: string[] = [];
    const session = await ClaudeSdkSession.create({
      threadId: "live-claude-steer",
      projectLocation: { kind: "posix", path: cwd },
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: (event) => events.push(event),
      onUpdate: (update) => statuses.push(update.status),
      onError: (error) => errors.push(error),
      onClose: () => {},
    });
    try {
      await session.openThread(config);
      await session.startTurn(
        "Use Bash to run exactly: sleep 3; printf PORACODE_BASH_FINISHED. Wait for it to finish, then reply FIRST_DONE. Do nothing else.",
        config,
      );
      await vi.waitFor(
        () => {
          expect(errors).toEqual([]);
          expect(
            events.some(
              (event) => event.type === "item.started" && event.itemType === "command_execution",
            ),
          ).toBe(true);
        },
        { timeout: 120_000, interval: 100 },
      );
      await session.steerTurn("Reply SECOND_DONE, with no tool calls.", config);
      await vi.waitFor(
        () => {
          expect(errors).toEqual([]);
          expect(events.filter((event) => event.type === "turn.completed")).toHaveLength(2);
          expect(statuses.at(-1)).toBe("idle");
        },
        { timeout: 120_000, interval: 100 },
      );
      expect(
        events
          .filter((event) => event.type === "turn.completed")
          .every((event) => event.state === "completed"),
      ).toBe(true);
      expect(
        events.some(
          (event) =>
            event.type === "content.delta" &&
            event.stream === "command_output" &&
            event.delta.includes("PORACODE_BASH_FINISHED"),
        ),
      ).toBe(true);
      const reply = events
        .flatMap((event) => (event.type === "content.delta" ? [event.delta] : []))
        .join("");
      expect(reply).toContain("FIRST_DONE");
      expect(reply).toContain("SECOND_DONE");
      expect(statuses.filter((status) => status === "idle")).toHaveLength(1);
    } finally {
      await session.dispose();
      await rm(cwd, { recursive: true, force: true });
    }
  },
);
