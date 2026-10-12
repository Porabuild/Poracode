import { RuntimePersistenceController } from "./runtimePersistenceController";

// Run in its own Node loop: test-runner timers and IPC must not wake continuations.
const mode = process.argv[2];
if (mode !== "poll" && mode !== "exit") throw new Error("Unknown scheduling fixture mode");
const written = new Set<string>();
const controller = new RuntimePersistenceController({
  flushIntervalMs: 5,
  write: (threadId) => {
    written.add(threadId);
  },
});
for (let slot = 0; slot < 33; slot++) {
  const threadId = `thread-${slot}`;
  controller.admit(threadId, [
    {
      type: "content.delta",
      threadId,
      itemId: "item",
      stream: "assistant_text",
      delta: "accepted",
    },
  ]);
}
// One unrelated timer permits the initial background flush. No periodic wake-up.
setTimeout(() => undefined, mode === "poll" ? 500 : 20);
process.once("beforeExit", () => {
  const sample = controller.sample();
  process.stdout.write(
    JSON.stringify({ writtenThreads: written.size, pendingEvents: sample.pendingEvents }) + "\n",
  );
  controller.shutdown();
});
