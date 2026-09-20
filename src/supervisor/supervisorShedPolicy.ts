import { isSupervisorOutputShedSignal, type SupervisorOutputShedSignal } from "@/shared/ipc";
import type { SupervisorIpcShedPolicy } from "./supervisorIpcSender";

/**
 * Shed policy for the supervisor→backend-host IPC sender.
 *
 * Without containment, a multi-second backend-host stall (synchronous SQLite
 * work, a large snapshot build, a multi-megabyte serialization) fills this
 * queue in a few hundred milliseconds of aggregate agent output, and the
 * sender's fail-closed overflow then exits the supervisor — killing every
 * agent process because one consumer hiccuped.
 *
 * Only terminal-output batches are sheddable, and only because the
 * supervisor remains the authoritative source for PTY bytes: a shed batch is
 * announced with a `supervisor-output-shed` recovery signal delivered ahead
 * of the surviving traffic, and the backend host answers it by asking
 * connected clients to resynchronize those threads' terminal output from
 * the supervisor. Runtime events, replies, and every other traffic class
 * keep the fail-closed semantics — they have no supervisor-side replay path,
 * so shedding them would be silent data loss, and a queue saturated by them
 * alone still fails fatally.
 */
export function createSupervisorOutputShedPolicy(): SupervisorIpcShedPolicy<SupervisorOutputShedSignal> {
  return {
    isSheddable: (message) => "type" in message && message.type === "thread-output",
    isRecoverySignal: (message) => isSupervisorOutputShedSignal(message),
    createRecoverySignal: (shed, previous) => {
      const threadIds = new Set<string>(
        previous !== null && isSupervisorOutputShedSignal(previous) ? previous.threadIds : [],
      );
      for (const message of shed) {
        if ("type" in message && message.type === "thread-output") {
          threadIds.add(message.threadId);
        }
      }
      return { kind: "supervisor-output-shed", threadIds: [...threadIds] };
    },
  };
}
