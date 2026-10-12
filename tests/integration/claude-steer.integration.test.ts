import { mkdir, mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

import { expect, it, vi } from "vitest";
import type { RuntimeEvent, ThreadConfig } from "@/shared/contracts";
import { ClaudeSdkSession } from "@/supervisor/agents/claude/sdkSession";

const execFileAsync = promisify(execFile);

// Opt-in: requires an authenticated Claude CLI and consumes live provider usage.
it.runIf(process.env.PORACODE_LIVE_CLAUDE_STEER === "1")(
  "steers before live foreground Bash finishes while preserving the command",
  async () => {
    await mkdir(resolve("tmp"), { recursive: true });
    const cwd = await mkdtemp(resolve("tmp/claude-steer-"));
    const config: ThreadConfig = {
      model: "sonnet",
      mode: "agent",
      approvalPolicy: "bypassPermissions",
    };
    const events: RuntimeEvent[] = [];
    const sleepSeconds = `20.${randomUUID()
      .replace(/[^0-9]/g, "")
      .slice(0, 6)}`;
    const statuses: string[] = [];
    const errors: string[] = [];
    const streamed = (stream: string) =>
      events
        .flatMap((event) =>
          event.type === "content.delta" && event.stream === stream ? [event.delta] : [],
        )
        .join("");
    let steerStartedAt = 0;
    let steerLatencyMs = 0;
    let generationSteerLatencyMs = 0;
    let backgroundSteerLatencyMs = 0;
    let stopLatencyMs = 0;
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
        `Use Bash to run exactly: sleep ${sleepSeconds}; printf PORACODE_BASH_FINISHED. After it completes, make a separate Bash call: printf SHOULD_NOT_RUN. Then reply FIRST_DONE. Do not write files or run any other commands.`,
        config,
      );
      // Prove the uniquely named sleep child is executing, not merely a
      // streamed tool proposal. pgrep prints only its PID, never environment.
      await vi.waitFor(
        async () => {
          expect(errors).toEqual([]);
          const { stdout } = await execFileAsync("pgrep", [
            "-f",
            `^(/bin/)?sleep ${sleepSeconds.replace(".", "\\.")}$`,
          ]);
          expect(stdout.trim()).toMatch(/^\d+$/);
        },
        { timeout: 120_000, interval: 100 },
      );
      steerStartedAt = Date.now();
      await session.steerTurn(
        "Change of plan: reply SECOND_DONE on the first line immediately while the current command continues in the background, then print the integers from 1 through 2000, one per line. Skip the remaining command. Do not wait for the running command and do not make any more tool calls.",
        config,
      );
      // A next-boundary steer cannot answer until the 20-second command ends.
      await vi.waitFor(
        () => {
          expect(errors).toEqual([]);
          expect(streamed("assistant_text")).toContain("SECOND_DONE");
        },
        { timeout: 15_000, interval: 100 },
      );
      steerLatencyMs = Date.now() - steerStartedAt;
      const afterSteer = await execFileAsync("pgrep", [
        "-f",
        `^(/bin/)?sleep ${sleepSeconds.replace(".", "\\.")}$`,
      ]);
      expect(afterSteer.stdout.trim()).toMatch(/^\d+$/);
      const backgroundSteerStartedAt = Date.now();
      await session.steerTurn(
        "Stop the list. Reply only THIRD_DONE immediately, no tools. Keep the background command running.",
        config,
      );
      await vi.waitFor(
        () => {
          expect(errors).toEqual([]);
          expect(streamed("assistant_text")).toContain("THIRD_DONE");
        },
        { timeout: 15_000, interval: 50 },
      );
      backgroundSteerLatencyMs = Date.now() - backgroundSteerStartedAt;
      const afterSecondSteer = await execFileAsync("pgrep", [
        "-f",
        `^(/bin/)?sleep ${sleepSeconds.replace(".", "\\.")}$`,
      ]);
      expect(afterSecondSteer.stdout.trim()).toMatch(/^\d+$/);
      expect(streamed("command_output")).not.toContain("PORACODE_BASH_FINISHED");
      expect(streamed("command_output")).not.toContain("The user doesn't want to proceed");
      const outputFile = streamed("command_output").match(/\/[^\s]+\.output/)?.[0];
      expect(outputFile).toBeDefined();
      await vi.waitFor(
        async () => {
          expect(errors).toEqual([]);
          expect(
            events.filter((event) => event.type === "turn.completed").length,
          ).toBeGreaterThanOrEqual(1);
          expect(await readFile(outputFile!, "utf8")).toContain("PORACODE_BASH_FINISHED");
          expect(statuses.at(-1)).toBe("idle");
        },
        { timeout: 120_000, interval: 100 },
      );
      expect(
        events
          .filter((event) => event.type === "turn.completed")
          .every((event) => event.state === "completed"),
      ).toBe(true);
      const reply = events
        .flatMap((event) => (event.type === "content.delta" ? [event.delta] : []))
        .join("");
      expect(reply).not.toContain("FIRST_DONE");
      expect(
        events.filter(
          (event) => event.type === "item.started" && event.itemType === "command_execution",
        ),
      ).toHaveLength(1);
      expect(reply).toContain("SECOND_DONE");
      expect(statuses).toContain("idle");

      const longPrompt =
        "Print the integers from 1 through 2000, one per line. No tools, no abbreviations, no explanations.";
      let offset = events.length;
      const currentText = () =>
        events
          .slice(offset)
          .flatMap((event) =>
            event.type === "content.delta" && event.stream === "assistant_text"
              ? [event.delta]
              : [],
          )
          .join("");
      await session.startTurn(longPrompt, config);
      await vi.waitFor(
        () => {
          expect(errors).toEqual([]);
          expect(statuses.at(-1)).toBe("working");
          expect(currentText().length).toBeGreaterThan(30);
        },
        { timeout: 60_000, interval: 50 },
      );
      const generationSteerStartedAt = Date.now();
      await session.steerTurn("Stop the list. Reply only GENERATION_STEER_A, no tools.", config);
      await session.steerTurn(
        "Latest instruction: reply only GENERATION_STEER_B, no tools.",
        config,
      );
      await vi.waitFor(
        () => {
          expect(errors).toEqual([]);
          expect(currentText()).toContain("GENERATION_STEER_B");
          expect(statuses.at(-1)).toBe("idle");
        },
        { timeout: 30_000, interval: 50 },
      );
      generationSteerLatencyMs = Date.now() - generationSteerStartedAt;

      offset = events.length;
      await session.startTurn(longPrompt, config);
      await vi.waitFor(
        () => {
          expect(errors).toEqual([]);
          expect(statuses.at(-1)).toBe("working");
          expect(currentText().length).toBeGreaterThan(30);
        },
        { timeout: 60_000, interval: 50 },
      );
      const stopStartedAt = Date.now();
      await session.interruptTurn();
      await vi.waitFor(
        () => {
          expect(errors).toEqual([]);
          expect(statuses.at(-1)).toBe("idle");
          expect(
            events
              .slice(offset)
              .some((event) => event.type === "turn.completed" && event.state === "interrupted"),
          ).toBe(true);
        },
        { timeout: 15_000, interval: 50 },
      );
      stopLatencyMs = Date.now() - stopStartedAt;
    } finally {
      await writeFile(
        resolve("tmp/claude-steer-live-evidence.json"),
        JSON.stringify(
          {
            steerLatencyMs,
            generationSteerLatencyMs,
            backgroundSteerLatencyMs,
            stopLatencyMs,
            statuses,
            errors,
            turnStates: events.flatMap((event) =>
              event.type === "turn.completed" ? [event.state] : [],
            ),
            assistantText: streamed("assistant_text"),
            commandOutput: streamed("command_output"),
          },
          null,
          2,
        ),
      );
      await session.dispose();
      await rm(cwd, { recursive: true, force: true });
    }
  },
);
