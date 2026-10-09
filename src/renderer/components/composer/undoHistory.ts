/** A pause this long between edits of the same group starts a new undo step. */
const MERGE_WINDOW_MS = 1000;
/** The oldest step is dropped once the history holds this many. */
const MAX_UNDO_STEPS = 100;

export interface UndoHistory<T> {
  /** The state the history considers current. */
  current(): T;
  /**
   * Record the state after an edit. Consecutive edits that share a `group`
   * (e.g. typing) merge into one undo step until the group changes, the user
   * pauses, or something else breaks the run. Edits without a group are
   * always their own step.
   */
  record(state: T, group?: string): void;
  /**
   * Swap the current state for one that differs in something other than an
   * edit, such as the caret position. Adds no step, keeps redo, and ends the
   * current group so the next edit becomes its own step.
   */
  replaceCurrent(state: T): void;
  /** Forget every step and start over from `state`. */
  reset(state: T): void;
  /** Step back one edit. Returns the state to restore, or null when there is nothing to undo. */
  undo(): T | null;
  /** Step forward one edit. Returns the state to restore, or null when there is nothing to redo. */
  redo(): T | null;
}

export function createUndoHistory<T>(options: { initial: T; now?: () => number }): UndoHistory<T> {
  const now = options.now ?? Date.now;
  let states: T[] = [options.initial];
  let index = 0;
  let lastGroup: string | null = null;
  let lastRecordAt = 0;

  return {
    current() {
      return states[index]!;
    },
    record(state, group) {
      const time = now();
      const merge =
        group !== undefined &&
        group === lastGroup &&
        index > 0 &&
        time - lastRecordAt < MERGE_WINDOW_MS;
      if (!merge) index += 1;
      states.splice(index, states.length, state);
      if (states.length > MAX_UNDO_STEPS + 1) {
        states.shift();
        index -= 1;
      }
      lastGroup = group ?? null;
      lastRecordAt = time;
    },
    replaceCurrent(state) {
      states[index] = state;
      lastGroup = null;
    },
    reset(state) {
      states = [state];
      index = 0;
      lastGroup = null;
    },
    undo() {
      if (index === 0) return null;
      index -= 1;
      lastGroup = null;
      return states[index]!;
    },
    redo() {
      if (index === states.length - 1) return null;
      index += 1;
      lastGroup = null;
      return states[index]!;
    },
  };
}
