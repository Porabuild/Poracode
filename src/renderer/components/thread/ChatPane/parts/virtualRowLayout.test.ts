import { beforeEach, describe, expect, it } from "vitest";
import { syncFollowingVirtualRowPositions, type VirtualRowLayoutState } from "./virtualRowLayout";

describe("syncFollowingVirtualRowPositions", () => {
  beforeEach(() => document.body.replaceChildren());

  it("moves a stale adjacent row to the virtualizer position", () => {
    const fixture = makeFixture([
      { index: 0, top: 0 },
      { index: 1, top: 100 },
    ]);

    expect(syncFollowingVirtualRowPositions(fixture.rows.get(0)!, makeLayout([160, 100]))).toBe(1);
    expect(topOf(fixture, 1)).toBe(160);
  });

  it("does not apply the growth twice when the row already reflowed", () => {
    const fixture = makeFixture([
      { index: 0, top: 0 },
      { index: 1, top: 160 },
    ]);

    expect(syncFollowingVirtualRowPositions(fixture.rows.get(0)!, makeLayout([160, 100]))).toBe(0);
    expect(topOf(fixture, 1)).toBe(160);
  });

  it("replaces a partial reflow with the exact virtualizer position", () => {
    const fixture = makeFixture([
      { index: 0, top: 0 },
      { index: 1, top: 135 },
    ]);

    expect(syncFollowingVirtualRowPositions(fixture.rows.get(0)!, makeLayout([160, 100]))).toBe(1);
    expect(topOf(fixture, 1)).toBe(160);
  });

  it("synchronizes every mounted following row", () => {
    const fixture = makeFixture([
      { index: 0, top: 0 },
      { index: 1, top: 100 },
      { index: 2, top: 200 },
      { index: 3, top: 300 },
    ]);

    expect(
      syncFollowingVirtualRowPositions(fixture.rows.get(0)!, makeLayout([160, 80, 120, 100])),
    ).toBe(3);
    expect(topsOf(fixture, [1, 2, 3])).toEqual([160, 240, 360]);
  });

  it("leaves rows before the resized row untouched", () => {
    const fixture = makeFixture([
      { index: 0, top: 0 },
      { index: 1, top: 100 },
      { index: 2, top: 200 },
    ]);

    expect(
      syncFollowingVirtualRowPositions(fixture.rows.get(1)!, makeLayout([100, 160, 100])),
    ).toBe(1);
    expect(topsOf(fixture, [0, 1, 2])).toEqual([0, 100, 260]);
  });

  it("uses timeline indices rather than DOM sibling order", () => {
    const fixture = makeFixture([
      { index: 2, top: 200 },
      { index: 0, top: 0 },
      { index: 1, top: 100 },
    ]);

    expect(syncFollowingVirtualRowPositions(fixture.rows.get(0)!, makeLayout([150, 90, 110]))).toBe(
      2,
    );
    expect(topsOf(fixture, [1, 2])).toEqual([150, 240]);
  });

  it("accounts for virtualized rows that are not mounted", () => {
    const fixture = makeFixture([
      { index: 0, top: 0 },
      { index: 3, top: 300 },
    ]);

    expect(
      syncFollowingVirtualRowPositions(fixture.rows.get(0)!, makeLayout([160, 80, 90, 100])),
    ).toBe(1);
    expect(topOf(fixture, 3)).toBe(330);
  });

  it("preserves LegendList's shared render offset during anchor compensation", () => {
    const fixture = makeFixture([
      { index: 1, top: 40 },
      { index: 2, top: 120 },
    ]);
    const layout = makeLayout([100, 160, 80], 200);
    // Logical index 1 is at 300, while its rendered wrapper is at 40. The
    // shared -260px compensation must also apply to index 2.
    expect(syncFollowingVirtualRowPositions(fixture.rows.get(1)!, layout)).toBe(1);
    expect(topOf(fixture, 2)).toBe(200);
  });

  it("ignores non-row siblings and malformed row indices", () => {
    const fixture = makeFixture([
      { index: 0, top: 0 },
      { index: 1, top: 100 },
    ]);
    const decoration = document.createElement("div");
    decoration.style.top = "40px";
    fixture.parent.appendChild(decoration);
    const malformed = document.createElement("div");
    malformed.style.top = "60px";
    malformed.appendChild(makeRowElement("invalid"));
    fixture.parent.appendChild(malformed);

    expect(syncFollowingVirtualRowPositions(fixture.rows.get(0)!, makeLayout([150, 100]))).toBe(1);
    expect(decoration.style.top).toBe("40px");
    expect(malformed.style.top).toBe("60px");
  });

  it("does nothing when the current row is detached or malformed", () => {
    const detached = makeRowElement(0);
    expect(syncFollowingVirtualRowPositions(detached, makeLayout([150]))).toBe(0);

    const fixture = makeFixture([
      { index: 0, top: 0 },
      { index: 1, top: 100 },
    ]);
    delete fixture.rows.get(0)!.dataset.index;
    expect(syncFollowingVirtualRowPositions(fixture.rows.get(0)!, makeLayout([150, 100]))).toBe(0);
    expect(topOf(fixture, 1)).toBe(100);
  });

  it("does nothing when the current wrapper has no numeric position", () => {
    const fixture = makeFixture([
      { index: 0, top: 0 },
      { index: 1, top: 100 },
    ]);
    fixture.containers.get(0)!.style.top = "";

    expect(syncFollowingVirtualRowPositions(fixture.rows.get(0)!, makeLayout([150, 100]))).toBe(0);
    expect(topOf(fixture, 1)).toBe(100);
  });

  it("aborts without partial writes when a required virtual size is invalid", () => {
    const fixture = makeFixture([
      { index: 0, top: 0 },
      { index: 1, top: 100 },
      { index: 2, top: 200 },
    ]);
    const layout = makeLayout([150, Number.NaN, 100]);

    expect(syncFollowingVirtualRowPositions(fixture.rows.get(0)!, layout)).toBe(0);
    expect(topsOf(fixture, [1, 2])).toEqual([100, 200]);
  });

  it("keeps sub-pixel-equivalent positions stable", () => {
    const fixture = makeFixture([
      { index: 0, top: 0 },
      { index: 1, top: 159.75 },
    ]);

    expect(syncFollowingVirtualRowPositions(fixture.rows.get(0)!, makeLayout([160, 100]))).toBe(0);
    expect(topOf(fixture, 1)).toBe(159.75);
  });
});

type Fixture = {
  parent: HTMLDivElement;
  containers: Map<number, HTMLDivElement>;
  rows: Map<number, HTMLDivElement>;
};

function makeFixture(items: Array<{ index: number; top: number }>): Fixture {
  const parent = document.createElement("div");
  const containers = new Map<number, HTMLDivElement>();
  const rows = new Map<number, HTMLDivElement>();
  for (const item of items) {
    const container = document.createElement("div");
    container.style.top = `${item.top}px`;
    const row = makeRowElement(item.index);
    container.appendChild(row);
    parent.appendChild(container);
    containers.set(item.index, container);
    rows.set(item.index, row);
  }
  document.body.appendChild(parent);
  return { parent, containers, rows };
}

function makeRowElement(index: number | string): HTMLDivElement {
  const row = document.createElement("div");
  row.dataset.chatVirtualRow = "true";
  row.dataset.index = String(index);
  return row;
}

function makeLayout(sizes: number[], start = 0): VirtualRowLayoutState {
  return {
    positionAtIndex(index) {
      return start + sizes.slice(0, index).reduce((total, size) => total + size, 0);
    },
    sizeAtIndex(index) {
      return sizes[index] ?? Number.NaN;
    },
  };
}

function topOf(fixture: Fixture, index: number): number {
  return Number.parseFloat(fixture.containers.get(index)!.style.top);
}

function topsOf(fixture: Fixture, indices: number[]): number[] {
  return indices.map((index) => topOf(fixture, index));
}
