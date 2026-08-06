import { beforeEach, describe, expect, it } from "vitest";
import { useThreadOutputStore } from "./threadOutputStore";

describe("threadOutputStore", () => {
  beforeEach(() => {
    useThreadOutputStore.setState({ buffers: {} });
  });

  it("accumulates output for a thread and reads the tail", () => {
    const store = useThreadOutputStore.getState();
    store.appendOutput("t1", "line1\n");
    store.appendOutput("t1", "line2\n");
    store.appendOutput("t2", "other");

    expect(store.readTail("t1", 100_000)).toBe("line1\nline2\n");
    expect(store.readTail("t2", 100_000)).toBe("other");
  });

  it("ignores empty appends and unknown threads", () => {
    const store = useThreadOutputStore.getState();
    store.appendOutput("t1", "");
    store.appendOutput("t2", "");

    expect(store.readTail("t1", 100_000)).toBe("");
    expect(store.readTail("missing", 100_000)).toBe("");
  });

  it("caps the buffer at MAX_BYTES, keeping the tail", () => {
    const store = useThreadOutputStore.getState();
    const bigChunk = "x".repeat(200_000);
    // 4 chunks would be 800k; only the last ~500k should survive.
    for (let i = 0; i < 4; i += 1) {
      store.appendOutput("t1", bigChunk);
    }
    const tail = store.readTail("t1", 100_000);
    expect(tail.length).toBe(100_000);
    expect(tail).toBe("x".repeat(100_000));

    // Total retained buffer must stay under the cap.
    const all = useThreadOutputStore.getState().buffers["t1"]!;
    expect(all.readTail(500_001)).toHaveLength(500_000);
  });

  it("clearOutput removes only the given thread", () => {
    const store = useThreadOutputStore.getState();
    store.appendOutput("t1", "a");
    store.appendOutput("t2", "b");

    store.clearOutput("t1");
    expect(store.readTail("t1", 100_000)).toBe("");
    expect(store.readTail("t2", 100_000)).toBe("b");
  });

  it("prunes output for removed threads", () => {
    const store = useThreadOutputStore.getState();
    store.appendOutput("t1", "a");
    store.appendOutput("t2", "b");

    store.retainOutputs(new Set(["t2"]));
    expect(store.readTail("t1", 100_000)).toBe("");
    expect(store.readTail("t2", 100_000)).toBe("b");
  });

  it("readTail honors a limit smaller than the buffer", () => {
    const store = useThreadOutputStore.getState();
    store.appendOutput("t1", "abcdef");
    expect(store.readTail("t1", 3)).toBe("def");
    expect(store.readTail("t1", 0)).toBe("");
  });
});
