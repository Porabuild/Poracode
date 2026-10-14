import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
import type { RuntimeEvent, ThreadConfig } from "@/shared/contracts";
import { ClaudeSdkSession } from "@/supervisor/agents/claude/sdkSession";

// Opt-in: authenticates with the installed Claude CLI and consumes provider usage.
it.runIf(process.env.PORACODE_LIVE_CLAUDE_CONTEXT_WINDOW === "1")(
  "resumes one real Claude conversation at 1M, 400k, a custom 512k and 1M with its history intact",
  async () => {
    await mkdir(resolve("tmp"), { recursive: true });
    const cwd = await mkdtemp(resolve("tmp/claude-context-window-"));
    const marker = `CONTEXT_${randomUUID().replaceAll("-", "")}`;
    const config: ThreadConfig = {
      model: "claude-fable-5-1",
      contextSize: "1m",
      mode: "agent",
      approvalPolicy: "default",
    };
    const events: RuntimeEvent[] = [];
    const errors: string[] = [];
    const statuses: string[] = [];
    const sessionRefs: string[] = [];
    const evidence: Array<{ contextSize: string; maxTokens: number; remembered: boolean }> = [];
    const session = await ClaudeSdkSession.create({
      threadId: "live-claude-context-window",
      projectLocation: { kind: "posix", path: cwd },
      config,
      presentationMode: "gui",
    });
    session.setListener({
      onRuntimeEvent: (event) => events.push(event),
      onUpdate: (update) => {
        statuses.push(update.status);
        if (update.sessionRef) sessionRefs.push(update.sessionRef.providerSessionId);
      },
      onError: (error) => errors.push(error),
      onClose: () => {},
    });
    try {
      const sessionId = await session.openThread(config);
      for (const [index, contextSize] of ["1m", "400k", "512k", "1m"].entries()) {
        const offset = events.length;
        const maxTokens =
          contextSize === "1m" ? 1_000_000 : contextSize === "512k" ? 512_000 : 400_000;
        await session.startTurn(
          index === 0
            ? `Remember the token ${marker}. Reply only with this token, without using tools.`
            : "What token did I ask you to remember earlier? Reply only with that token, without using tools.",
          { ...config, contextSize },
        );
        await vi.waitFor(
          () => {
            expect(errors).toEqual([]);
            expect(events.filter((event) => event.type === "turn.completed")).toHaveLength(
              index + 1,
            );
            expect(statuses.at(-1)).toBe("idle");
            const usage = events.filter((event) => event.type === "context.updated").at(-1);
            expect(usage?.usage.maxTokens).toBe(maxTokens);
          },
          { timeout: 120_000, interval: 100 },
        );
        const reply = events
          .slice(offset)
          .flatMap((event) =>
            event.type === "content.delta" && event.stream === "assistant_text"
              ? [event.delta]
              : [],
          )
          .join("");
        expect(reply).toContain(marker);
        expect(sessionRefs.length).toBeGreaterThan(0);
        expect(new Set(sessionRefs)).toEqual(new Set([sessionId]));
        evidence.push({ contextSize, maxTokens, remembered: reply.includes(marker) });
      }
      expect(events.filter((event) => event.type === "turn.started")).toHaveLength(4);
      expect(
        events
          .filter((event) => event.type === "turn.completed")
          .every((event) => event.state === "completed"),
      ).toBe(true);
      await writeFile(
        resolve(cwd, "evidence.json"),
        JSON.stringify({ model: config.model, evidence, errors }, null, 2),
      );
      console.log(`Claude context-window evidence: ${resolve(cwd, "evidence.json")}`);
    } finally {
      await session.dispose();
    }
  },
);
