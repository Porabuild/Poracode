import { describe, expect, it } from "vitest";
import { createUndoHistory } from "./undoHistory";

describe("createUndoHistory", () => {
  it("undoes and redoes recorded steps in order", () => {
    const history = createUndoHistory<string>({ initial: "" });
    history.record("a");
    history.record("ab");

    expect(history.undo()).toBe("a");
    expect(history.undo()).toBe("");
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBe("a");
    expect(history.redo()).toBe("ab");
    expect(history.redo()).toBeNull();
  });

  it("drops the redo steps when a new edit follows an undo", () => {
    const history = createUndoHistory<string>({ initial: "" });
    history.record("a");
    history.record("ab");
    history.undo();
    history.record("ac");

    expect(history.redo()).toBeNull();
    expect(history.undo()).toBe("a");
  });

  it("merges consecutive edits of the same group into one step", () => {
    let time = 0;
    const history = createUndoHistory<string>({ initial: "", now: () => time });
    history.record("h", "insert");
    time += 100;
    history.record("hi", "insert");
    time += 100;
    history.record("h", "delete");

    expect(history.undo()).toBe("hi");
    expect(history.undo()).toBe("");
  });

  it("starts a new step after a pause of one second", () => {
    let time = 0;
    const history = createUndoHistory<string>({ initial: "", now: () => time });
    history.record("h", "insert");
    time += 999;
    history.record("hi", "insert");
    time += 1000;
    history.record("hi!", "insert");

    expect(history.undo()).toBe("hi");
    expect(history.undo()).toBe("");
  });

  it("never merges edits recorded without a group", () => {
    const history = createUndoHistory<string>({ initial: "", now: () => 0 });
    history.record("a");
    history.record("ab");

    expect(history.undo()).toBe("a");
  });

  it("does not merge an edit into the step before an undo", () => {
    const history = createUndoHistory<string>({ initial: "", now: () => 0 });
    history.record("a", "insert");
    history.record("ab", "insert");
    history.undo();
    history.record("x", "insert");

    expect(history.undo()).toBe("");
    expect(history.redo()).toBe("x");
  });

  it("keeps at most 100 undo steps and drops the oldest", () => {
    const history = createUndoHistory<number>({ initial: 0 });
    for (let step = 1; step <= 101; step++) history.record(step);

    let oldest: number | null = null;
    for (let value = history.undo(); value !== null; value = history.undo()) oldest = value;
    expect(oldest).toBe(1);
  });

  it("replaces the current state without adding a step or dropping redo", () => {
    const history = createUndoHistory<string>({ initial: "" });
    history.record("a");
    history.record("ab");
    history.undo();
    history.replaceCurrent("a|");

    expect(history.current()).toBe("a|");
    expect(history.redo()).toBe("ab");
    expect(history.undo()).toBe("a|");
  });

  it("starts a new step after the current state is replaced", () => {
    const history = createUndoHistory<string>({ initial: "", now: () => 0 });
    history.record("a", "insert");
    history.replaceCurrent("a|");
    history.record("ab", "insert");

    expect(history.undo()).toBe("a|");
  });

  it("forgets every step on reset", () => {
    const history = createUndoHistory<string>({ initial: "" });
    history.record("a");
    history.reset("draft");

    expect(history.current()).toBe("draft");
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBeNull();
  });
});
