export type PaneLayoutAxis = "horizontal" | "vertical";

export type PaneLayout =
  | { kind: "leaf"; paneId: string; slotId?: string }
  | { kind: "split"; axis: PaneLayoutAxis; children: [PaneLayout, PaneLayout, ...PaneLayout[]] };

export interface PaneLayoutInsertTarget {
  path: number[];
  axis: PaneLayoutAxis;
  index: number;
}

export function buildPaneLayoutFromLegacy(panes: string[], rowLayout?: number[]): PaneLayout {
  if (panes.length === 0) {
    throw new Error("Pane layout requires at least one pane");
  }

  if (!rowLayout || rowLayout.length <= 1) {
    return makeSplit(
      "vertical",
      panes.map((paneId) => ({ kind: "leaf", paneId })),
    );
  }

  const rows: PaneLayout[] = [];
  let offset = 0;
  for (const cols of rowLayout) {
    rows.push(
      makeSplit(
        "vertical",
        panes.slice(offset, offset + cols).map((paneId) => ({ kind: "leaf", paneId })),
      ),
    );
    offset += cols;
  }
  return makeSplit("horizontal", rows);
}

export function collectPaneIds(layout: PaneLayout): [string, ...string[]] {
  const ids: string[] = [];
  walk(layout, (paneId) => ids.push(paneId));
  return ids as [string, ...string[]];
}

export function leadPaneId(layout: PaneLayout): string {
  let node = layout;
  while (node.kind === "split") node = node.children[0];
  return node.paneId;
}

export function replacePaneIdInLayout(
  layout: PaneLayout,
  oldPaneId: string,
  newPaneId: string,
): PaneLayout {
  if (layout.kind === "leaf") {
    return layout.paneId === oldPaneId
      ? { kind: "leaf", paneId: newPaneId, slotId: layout.slotId ?? oldPaneId }
      : layout;
  }

  return normalizeLayout({
    ...layout,
    children: layout.children.map((child) =>
      replacePaneIdInLayout(child, oldPaneId, newPaneId),
    ) as [PaneLayout, PaneLayout, ...PaneLayout[]],
  });
}

export function swapPaneIdsInLayout(
  layout: PaneLayout,
  firstPaneId: string,
  secondPaneId: string,
): PaneLayout {
  const firstPane = findPaneLeaf(layout, firstPaneId);
  const secondPane = findPaneLeaf(layout, secondPaneId);
  if (!firstPane || !secondPane) return layout;

  return mapPaneLayout(layout, (pane) => {
    if (pane.paneId === firstPaneId) return secondPane;
    if (pane.paneId === secondPaneId) return firstPane;
    return pane;
  });
}

export function splitPaneInLayout(
  layout: PaneLayout,
  targetPaneId: string,
  newPaneId: string,
  edge: "left" | "right" | "top" | "bottom",
  slotId?: string,
): PaneLayout {
  if (layout.kind === "leaf") {
    if (layout.paneId !== targetPaneId) return layout;
    const axis = edge === "left" || edge === "right" ? "vertical" : "horizontal";
    const children: PaneLayout[] =
      edge === "left" || edge === "top"
        ? [makePaneLeaf(newPaneId, slotId), layout]
        : [layout, makePaneLeaf(newPaneId, slotId)];
    return makeSplit(axis, children);
  }

  return normalizeLayout({
    ...layout,
    children: layout.children.map((child) =>
      splitPaneInLayout(child, targetPaneId, newPaneId, edge, slotId),
    ) as [PaneLayout, PaneLayout, ...PaneLayout[]],
  });
}

export function removePaneFromLayout(layout: PaneLayout, paneId: string): PaneLayout | null {
  if (layout.kind === "leaf") {
    return layout.paneId === paneId ? null : layout;
  }

  const children = layout.children
    .map((child) => removePaneFromLayout(child, paneId))
    .filter((child): child is PaneLayout => child !== null);

  if (children.length === 0) return null;
  if (children.length === 1) return children[0]!;

  return normalizeLayout({
    ...layout,
    children: children as [PaneLayout, PaneLayout, ...PaneLayout[]],
  });
}

export function insertPaneInLayout(
  layout: PaneLayout,
  target: PaneLayoutInsertTarget,
  paneId: string,
  slotId?: string,
): PaneLayout {
  return insertIntoPath(
    layout,
    target.path,
    target.axis,
    target.index,
    makePaneLeaf(paneId, slotId),
  );
}

export function findPaneSlotId(layout: PaneLayout, paneId: string): string | null {
  const pane = findPaneLeaf(layout, paneId);
  return pane ? (pane.slotId ?? pane.paneId) : null;
}

export function adjustInsertTargetForRemoval(
  layout: PaneLayout,
  paneId: string,
  target: PaneLayoutInsertTarget,
): PaneLayoutInsertTarget {
  const path = findPanePath(layout, paneId);
  if (!path || path.length === 0) return target;
  const parentPath = path.slice(0, -1);
  const childIndex = path[path.length - 1]!;
  if (!samePath(parentPath, target.path) || childIndex >= target.index) return target;
  return { ...target, index: target.index - 1 };
}

export function findPaneAlign(layout: PaneLayout, paneId: string): "left" | "center" | "right" {
  return findPaneAlignInner(layout, paneId) ?? "center";
}

export function findPanePath(
  layout: PaneLayout,
  paneId: string,
  path: number[] = [],
): number[] | null {
  if (layout.kind === "leaf") {
    return layout.paneId === paneId ? path : null;
  }

  for (let i = 0; i < layout.children.length; i++) {
    const childPath = findPanePath(layout.children[i]!, paneId, [...path, i]);
    if (childPath) return childPath;
  }
  return null;
}

function findPaneAlignInner(
  layout: PaneLayout,
  paneId: string,
): "left" | "center" | "right" | null {
  if (layout.kind === "leaf") {
    return layout.paneId === paneId ? "center" : null;
  }

  for (let i = 0; i < layout.children.length; i++) {
    const child = layout.children[i]!;
    const childAlign = findPaneAlignInner(child, paneId);
    if (childAlign === null) continue;
    if (layout.axis === "vertical") {
      if (layout.children.length <= 1) return "center";
      if (i === 0) return "right";
      if (i === layout.children.length - 1) return "left";
    }
    return childAlign;
  }

  return null;
}

function insertIntoPath(
  layout: PaneLayout,
  path: number[],
  axis: PaneLayoutAxis,
  index: number,
  node: PaneLayout,
): PaneLayout {
  if (path.length === 0) {
    return insertIntoNode(layout, axis, index, node);
  }

  if (layout.kind !== "split") {
    return layout;
  }

  const [head, ...tail] = path;
  const child = layout.children[head!];
  if (!child) return layout;

  const children = [...layout.children];
  children[head!] = insertIntoPath(child, tail, axis, index, node);
  return normalizeLayout({
    ...layout,
    children: children as [PaneLayout, PaneLayout, ...PaneLayout[]],
  });
}

function insertIntoNode(
  layout: PaneLayout,
  axis: PaneLayoutAxis,
  index: number,
  node: PaneLayout,
): PaneLayout {
  if (layout.kind === "split" && layout.axis === axis) {
    const children = [...layout.children];
    children.splice(Math.max(0, Math.min(children.length, index)), 0, node);
    return normalizeLayout({
      ...layout,
      children: children as [PaneLayout, PaneLayout, ...PaneLayout[]],
    });
  }

  const children = index <= 0 ? [node, layout] : [layout, node];
  return makeSplit(axis, children);
}

function samePath(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function findPaneLeaf(
  layout: PaneLayout,
  paneId: string,
): Extract<PaneLayout, { kind: "leaf" }> | null {
  if (layout.kind === "leaf") return layout.paneId === paneId ? layout : null;

  for (const child of layout.children) {
    const pane = findPaneLeaf(child, paneId);
    if (pane) return pane;
  }
  return null;
}

function mapPaneLayout(
  layout: PaneLayout,
  mapPane: (pane: Extract<PaneLayout, { kind: "leaf" }>) => Extract<PaneLayout, { kind: "leaf" }>,
): PaneLayout {
  if (layout.kind === "leaf") {
    return mapPane(layout);
  }

  return normalizeLayout({
    ...layout,
    children: layout.children.map((child) => mapPaneLayout(child, mapPane)) as [
      PaneLayout,
      PaneLayout,
      ...PaneLayout[],
    ],
  });
}

function makePaneLeaf(paneId: string, slotId?: string): PaneLayout {
  return slotId ? { kind: "leaf", paneId, slotId } : { kind: "leaf", paneId };
}

function walk(layout: PaneLayout, visitor: (paneId: string) => void) {
  if (layout.kind === "leaf") {
    visitor(layout.paneId);
    return;
  }

  for (const child of layout.children) {
    walk(child, visitor);
  }
}

function normalizeLayout(layout: PaneLayout): PaneLayout {
  if (layout.kind === "leaf") return layout;

  const flattened: PaneLayout[] = [];
  for (const child of layout.children) {
    const normalizedChild = normalizeLayout(child);
    if (normalizedChild.kind === "split" && normalizedChild.axis === layout.axis) {
      flattened.push(...normalizedChild.children);
    } else {
      flattened.push(normalizedChild);
    }
  }

  return makeSplit(layout.axis, flattened);
}

function makeSplit(axis: PaneLayoutAxis, children: PaneLayout[]): PaneLayout {
  if (children.length === 0) {
    throw new Error("Split layout requires at least one child");
  }
  if (children.length === 1) {
    return children[0]!;
  }

  return {
    kind: "split",
    axis,
    children: children as [PaneLayout, PaneLayout, ...PaneLayout[]],
  };
}
