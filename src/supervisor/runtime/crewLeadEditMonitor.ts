import type { ProjectLocation, RuntimeEvent } from "@/shared/contracts";
import { crewLeadMidTurnNudgeText } from "@/supervisor/crossagentMcp/crewBrief";
import type { DirtySetSnapshot } from "../git/dirtySetSnapshot";
import {
  fileChangePath,
  isProjectFilePath,
  projectLocationsOverlap,
  watchesCrewLeadEdits,
} from "./crewLeadEditNudge";
import type { SessionRuntime } from "./sessionTypes";
import { ShellEditTracker, type MemberRunActivity } from "./shellEditTracker";
import { reachableCrewBinding } from "./turnClientContext";

export interface CrewLeadEditMonitorContext {
  isCurrentSession(session: SessionRuntime): boolean;
  /** A user's submit, steer or follow-up promotion is staged or being admitted. */
  hasPendingUserInput(threadId: string): boolean;
  /**
   * Other live sessions working where this one works: their edits land in the
   * same worktree, so they count as active members. Absent: none are counted.
   */
  otherWorkingSessions?: (session: SessionRuntime) => number;
  /** Absent: shell edits are not tracked, since member edits could not be told apart. */
  memberRunActivity?: (threadId: string) => MemberRunActivity;
  /** Absent: shell edits are not tracked. */
  readDirtySetSnapshot?: (location: ProjectLocation) => Promise<DirtySetSnapshot | undefined>;
}

/** The lead's turn in flight; a fresh record per turn, so an older turn's late work cannot touch it. */
interface LeadTurn {
  readonly turnId: string;
  ended: boolean;
  /** At most one mid-turn reminder per turn. */
  reminder: "unsent" | "sending" | "settled";
  /** The lead's own commands started this turn and not completed yet. */
  readonly openCommands: Set<string>;
  /** The lead's own file changes whose path is not known yet. */
  readonly pathlessEdits: Set<string>;
  /** Sub-agent items (those with a `parentItemId`) started this turn and still open. */
  readonly openChildItems: Set<string>;
  /** Sub-agent items started this turn; only grows. */
  childItemStarts: number;
  shell: ShellEditTracker | undefined;
}

/**
 * Reminds a crew lead that edits project files itself to hand the work to its
 * crew. Watches the lead's own top-level items on sessions whose crew is
 * reachable and has a role that may edit, outside plan mode. A `file_change`
 * item counts once its path is known and lies inside the project (an empty
 * path is a tool misread as an edit); so does a worktree change after one of
 * the lead's commands (see `ShellEditTracker`). Items of sub-agents, whether
 * provider-native or Crossagents members, never count as the lead's, and
 * while they run they rule worktree changes out.
 *
 * The first edit of a turn is answered inside that turn when the handle has
 * `steerContext`: hidden guidance, sent only while the same turn is still
 * working and no user input is being staged or admitted. It bypasses the steer
 * coordinator, so it paints no user row or steer strip and leaves the
 * follow-up queue alone. Every other edit, and any reminder that could not be
 * sent or was refused, sets `SessionRuntime.crewLeadEditedFiles` for the next
 * prompt instead. An accepted mid-turn reminder covers the edits before it and
 * those made while it was being delivered.
 */
export class CrewLeadEditMonitor {
  private readonly turns = new WeakMap<SessionRuntime, LeadTurn>();

  constructor(private readonly ctx: CrewLeadEditMonitorContext) {}

  onRuntimeEvent(session: SessionRuntime, event: RuntimeEvent): void {
    switch (event.type) {
      case "turn.started":
        this.beginTurn(session, event.turnId);
        return;
      case "turn.completed": {
        const turn = this.turns.get(session);
        if (turn?.turnId === event.turnId) endTurn(turn);
        return;
      }
      case "item.started":
        this.onItemStarted(session, event);
        return;
      case "item.updated":
      case "item.completed":
        this.onItemProgress(session, event);
        return;
      default:
        return;
    }
  }

  private onItemStarted(
    session: SessionRuntime,
    event: Extract<RuntimeEvent, { type: "item.started" }>,
  ): void {
    const turn = this.currentTurn(session);
    if (event.parentItemId !== undefined) {
      // A sub-agent's item: never the lead's edit, but its work can change
      // the worktree, so it rules out the shell interval it overlaps.
      if (turn) {
        turn.openChildItems.add(event.itemId);
        turn.childItemStarts += 1;
      }
      return;
    }
    if (event.itemType === "file_change") {
      const path = fileChangePath(event.payload);
      if (path !== undefined) this.noteFileEdit(session, path);
      else turn?.pathlessEdits.add(event.itemId);
    } else if (event.itemType === "command_execution" && turn?.shell) {
      turn.openCommands.add(event.itemId);
    }
  }

  private onItemProgress(
    session: SessionRuntime,
    event: Extract<RuntimeEvent, { type: "item.updated" | "item.completed" }>,
  ): void {
    const turn = this.currentTurn(session);
    if (!turn) return;
    if (turn.pathlessEdits.has(event.itemId)) {
      const path = fileChangePath(event.payload);
      if (path !== undefined || event.type === "item.completed") {
        turn.pathlessEdits.delete(event.itemId);
      }
      if (path !== undefined) this.noteFileEdit(session, path);
    }
    if (event.type !== "item.completed") return;
    turn.openChildItems.delete(event.itemId);
    if (turn.openCommands.delete(event.itemId)) turn.shell?.commandCompleted();
  }

  private beginTurn(session: SessionRuntime, turnId: string): void {
    const previous = this.turns.get(session);
    if (previous) endTurn(previous);
    const turn: LeadTurn = {
      turnId,
      ended: false,
      reminder: "unsent",
      openCommands: new Set(),
      pathlessEdits: new Set(),
      openChildItems: new Set(),
      childItemStarts: 0,
      shell: undefined,
    };
    this.turns.set(session, turn);
    turn.shell = this.createShellTracker(session, turn);
    turn.shell?.start();
  }

  private currentTurn(session: SessionRuntime): LeadTurn | undefined {
    const turn = this.turns.get(session);
    return turn && !turn.ended ? turn : undefined;
  }

  private createShellTracker(
    session: SessionRuntime,
    turn: LeadTurn,
  ): ShellEditTracker | undefined {
    const { memberRunActivity, readDirtySetSnapshot, otherWorkingSessions } = this.ctx;
    if (!memberRunActivity || !readDirtySetSnapshot) return undefined;
    // Snapshot only where a reminder could follow.
    if (!isGuiSession(session) || !remindsOfLeadEdits(session)) return undefined;
    const { projectLocation, threadId } = session;
    return new ShellEditTracker({
      readSnapshot: () => readDirtySetSnapshot(projectLocation),
      memberActivity: () => {
        const members = memberRunActivity(threadId);
        return {
          active:
            members.active + turn.openChildItems.size + (otherWorkingSessions?.(session) ?? 0),
          started: members.started + turn.childItemStarts,
        };
      },
      onLeadEdit: () => {
        if (this.currentTurn(session) === turn) this.noteLeadEdit(session);
      },
    });
  }

  private noteFileEdit(session: SessionRuntime, path: string): void {
    if (isProjectFilePath(session.projectLocation, path)) this.noteLeadEdit(session);
  }

  private noteLeadEdit(session: SessionRuntime): void {
    if (!remindsOfLeadEdits(session)) return;
    const turn = this.currentTurn(session);
    // The turn's first edit settles what the snapshots were for.
    turn?.shell?.stop();
    if (turn?.reminder === "sending") return;
    if (turn?.reminder === "unsent" && this.canSteer(session, turn)) {
      turn.reminder = "sending";
      // Never re-enter the provider from inside its own event emission.
      queueMicrotask(() => void this.deliver(session, turn));
      return;
    }
    session.crewLeadEditedFiles = true;
  }

  private canSteer(session: SessionRuntime, turn: LeadTurn): boolean {
    return (
      this.currentTurn(session) === turn &&
      session.structuredSession?.steerContext !== undefined &&
      isGuiSession(session) &&
      session.status === "working" &&
      session.pendingSteer === undefined &&
      session.structuredTurnInterruptRequested !== true &&
      this.ctx.isCurrentSession(session) &&
      !this.ctx.hasPendingUserInput(session.threadId)
    );
  }

  /** Never rejects: it runs detached from the event that triggered it. */
  private async deliver(session: SessionRuntime, turn: LeadTurn): Promise<void> {
    try {
      const handle = session.structuredSession;
      const crew = reachableCrewBinding(session);
      const text = crew ? crewLeadMidTurnNudgeText(crew) : undefined;
      // Re-checked right before sending: the turn may have ended, or the user
      // may have started steering, since the edit was seen.
      if (!handle?.steerContext || !text || !this.canSteer(session, turn)) {
        session.crewLeadEditedFiles = true;
        return;
      }
      await handle.steerContext(text);
      // It covers every edit of this turn so far, including any that fell
      // back to the next prompt earlier; later edits re-arm that reminder.
      if (this.turns.get(session) === turn) session.crewLeadEditedFiles = undefined;
    } catch {
      // Refused, or the turn ended before it was taken: the next prompt carries it.
      session.crewLeadEditedFiles = true;
    } finally {
      turn.reminder = "settled";
    }
  }
}

/**
 * Edits are reminded of only while the lead can hand them over: its crew is
 * reachable and has a role that may edit, and the thread is not planning
 * (plan mode writes plans, not project work).
 */
function remindsOfLeadEdits(session: SessionRuntime): boolean {
  return (
    session.config.mode !== "plan" &&
    watchesCrewLeadEdits(session.config) &&
    reachableCrewBinding(session) !== undefined
  );
}

function endTurn(turn: LeadTurn): void {
  turn.ended = true;
  turn.openCommands.clear();
  turn.pathlessEdits.clear();
  turn.openChildItems.clear();
  turn.shell?.stop();
}

function isGuiSession(session: SessionRuntime): boolean {
  return (session.presentationMode ?? session.adapter.capabilities.presentationMode) === "gui";
}

/**
 * Live sessions other than `session` that are working in a location that
 * overlaps its own; see `CrewLeadEditMonitorContext.otherWorkingSessions`.
 */
export function countOtherWorkingSessions(
  sessions: Iterable<SessionRuntime>,
  session: SessionRuntime,
): number {
  let count = 0;
  for (const other of sessions) {
    if (
      other !== session &&
      other.status === "working" &&
      projectLocationsOverlap(other.projectLocation, session.projectLocation)
    ) {
      count += 1;
    }
  }
  return count;
}
