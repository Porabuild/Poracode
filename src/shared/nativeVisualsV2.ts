import type {
  NativeVisualChart,
  NativeVisualInput,
  NativeVisualOutputs,
  NativeVisualTable,
} from "./nativeVisuals";

export type NativeVisualTone = "neutral" | "accent" | "success" | "warning" | "danger";

export interface NativeVisualText {
  type: "text";
  title?: string;
  text: string;
}

export interface NativeVisualChecklist {
  type: "checklist";
  title?: string;
  items: { id: string; label: string; checked?: boolean }[];
}

export interface NativeVisualDiagram {
  type: "diagram";
  title?: string;
  direction?: "horizontal" | "vertical";
  nodes: { id: string; label: string; detail?: string; tone?: NativeVisualTone }[];
  edges: { from: string; to: string; label?: string }[];
}

export type NativeVisualLeafBlock =
  | NativeVisualChart
  | NativeVisualTable
  | NativeVisualOutputs
  | NativeVisualText
  | NativeVisualChecklist
  | NativeVisualDiagram;

export interface NativeVisualTabs {
  type: "tabs";
  title?: string;
  tabs: { id: string; label: string; blocks: NativeVisualLeafBlock[] }[];
}

export interface NativeVisualV2Spec {
  description?: string;
  layout?: "stack" | "dashboard";
  accent?: "app" | "success" | "warning" | "danger";
  inputs: NativeVisualInput[];
  blocks: (NativeVisualLeafBlock | NativeVisualTabs)[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function id(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(value);
}

/** Called once per document; inactive tabs share every work and content budget. */
export function validateNativeVisualV2(
  root: Record<string, unknown>,
  legacyBlockValid: (block: unknown) => boolean,
): boolean {
  if (
    (root.layout !== undefined && root.layout !== "stack" && root.layout !== "dashboard") ||
    (root.accent !== undefined &&
      (typeof root.accent !== "string" ||
        !["app", "success", "warning", "danger"].includes(root.accent))) ||
    !Array.isArray(root.blocks) ||
    !root.blocks.length ||
    root.blocks.length > 8
  )
    return false;
  let blocks = 0;
  let checklistItems = 0;
  let diagramNodes = 0;
  let diagramEdges = 0;
  function blockValid(block: unknown, allowTabs: boolean): boolean {
    if (++blocks > 12 || !record(block) || (block.title !== undefined && !text(block.title, 200)))
      return false;
    if (block.type === "chart" || block.type === "table" || block.type === "outputs")
      return legacyBlockValid(block);
    if (block.type === "text")
      return keys(block, ["type", "title", "text"]) && text(block.text, 4_096);
    if (block.type === "checklist") {
      if (
        !keys(block, ["type", "title", "items"]) ||
        !Array.isArray(block.items) ||
        !block.items.length ||
        block.items.length > 32 ||
        (checklistItems += block.items.length) > 64
      )
        return false;
      const ids = new Set<string>();
      return block.items.every((item) => {
        if (
          !record(item) ||
          !keys(item, ["id", "label", "checked"]) ||
          !id(item.id) ||
          ids.has(item.id) ||
          !text(item.label, 240) ||
          (item.checked !== undefined && typeof item.checked !== "boolean")
        )
          return false;
        ids.add(item.id);
        return true;
      });
    }
    if (block.type === "diagram") {
      if (
        !keys(block, ["type", "title", "direction", "nodes", "edges"]) ||
        (block.direction !== undefined &&
          block.direction !== "horizontal" &&
          block.direction !== "vertical") ||
        !Array.isArray(block.nodes) ||
        !block.nodes.length ||
        !Array.isArray(block.edges) ||
        (diagramNodes += block.nodes.length) > 16 ||
        (diagramEdges += block.edges.length) > 24
      )
        return false;
      const ids = new Set<string>();
      for (const node of block.nodes) {
        if (
          !record(node) ||
          !keys(node, ["id", "label", "detail", "tone"]) ||
          !id(node.id) ||
          ids.has(node.id) ||
          !text(node.label, 120) ||
          (node.detail !== undefined && !text(node.detail, 240)) ||
          (node.tone !== undefined &&
            (typeof node.tone !== "string" ||
              !["neutral", "accent", "success", "warning", "danger"].includes(node.tone)))
        )
          return false;
        ids.add(node.id);
      }
      const edges = new Set<string>();
      const outgoing = new Map<string, string[]>();
      for (const edge of block.edges) {
        if (
          !record(edge) ||
          !keys(edge, ["from", "to", "label"]) ||
          typeof edge.from !== "string" ||
          typeof edge.to !== "string" ||
          !ids.has(edge.from) ||
          !ids.has(edge.to) ||
          edge.from === edge.to ||
          (edge.label !== undefined && !text(edge.label, 120))
        )
          return false;
        const key = `${edge.from}:${edge.to}`;
        if (edges.has(key)) return false;
        edges.add(key);
        const targets = outgoing.get(edge.from) ?? [];
        targets.push(edge.to);
        outgoing.set(edge.from, targets);
      }
      const visiting = new Set<string>();
      const visited = new Set<string>();
      function acyclic(node: string): boolean {
        if (visiting.has(node)) return false;
        if (visited.has(node)) return true;
        visiting.add(node);
        if (!(outgoing.get(node) ?? []).every(acyclic)) return false;
        visiting.delete(node);
        visited.add(node);
        return true;
      }
      return [...ids].every(acyclic);
    }
    if (block.type === "tabs" && allowTabs) {
      if (
        !keys(block, ["type", "title", "tabs"]) ||
        !Array.isArray(block.tabs) ||
        !block.tabs.length ||
        block.tabs.length > 4
      )
        return false;
      const ids = new Set<string>();
      return block.tabs.every((tab) => {
        if (
          !record(tab) ||
          !keys(tab, ["id", "label", "blocks"]) ||
          !id(tab.id) ||
          ids.has(tab.id) ||
          !text(tab.label, 120) ||
          !Array.isArray(tab.blocks) ||
          !tab.blocks.length ||
          tab.blocks.length > 4
        )
          return false;
        ids.add(tab.id);
        return tab.blocks.every((child) => blockValid(child, false));
      });
    }
    return false;
  }
  return root.blocks.every((block) => blockValid(block, true));
}
