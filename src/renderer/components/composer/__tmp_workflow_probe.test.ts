import { describe, expect, it } from "vitest";
import { createTriggerWordChipElement } from "./SlashCommandChip";

const WORKFLOW_WORD = "workflow";
const WORKFLOW_WORD_LEN = WORKFLOW_WORD.length;

// Copy of replaceAllWorkflowTriggerWords from MentionInput.tsx
function replaceAllWorkflowTriggerWords(editor: HTMLDivElement): void {
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (node.parentElement?.closest("[data-trigger-word]")) continue;
    if (/\bworkflow\b/i.test(node.textContent ?? "")) textNodes.push(node);
  }
  for (let i = textNodes.length - 1; i >= 0; i--) {
    const tn = textNodes[i]!;
    const text = tn.textContent ?? "";
    const matches = [...text.matchAll(/\bworkflow\b/gi)].reverse();
    for (const m of matches) {
      if (m.index == null) continue;
      const range = document.createRange();
      range.setStart(tn, m.index);
      range.setEnd(tn, m.index + WORKFLOW_WORD_LEN);
      range.deleteContents();
      const chip = createTriggerWordChipElement(WORKFLOW_WORD);
      range.insertNode(chip);
    }
  }
}

function serializeChips(editor: HTMLDivElement): string {
  return Array.from(editor.querySelectorAll("[data-trigger-word]"))
    .map((el) => (el as HTMLElement).dataset.triggerWord)
    .join(",");
}

describe("probe replaceAllWorkflowTriggerWords", () => {
  it("handles two workflow words in a single text node", () => {
    const editor = document.createElement("div");
    editor.appendChild(document.createTextNode("workflow then workflow"));
    replaceAllWorkflowTriggerWords(editor);
    const chips = editor.querySelectorAll("[data-trigger-word]");
    console.log(
      "TWO-IN-ONE chip count:",
      chips.length,
      "| chips:",
      serializeChips(editor),
      "| text:",
      JSON.stringify(editor.textContent),
    );
    expect(chips.length).toBe(2);
  });

  it("replaces inside a URL", () => {
    const editor = document.createElement("div");
    editor.appendChild(document.createTextNode("see https://example.com/workflow/run now"));
    replaceAllWorkflowTriggerWords(editor);
    const chips = editor.querySelectorAll("[data-trigger-word]");
    expect(chips.length).toBe(1);
  });

  it("replaces inside inline code-like backticks", () => {
    const editor = document.createElement("div");
    editor.appendChild(document.createTextNode("run `npm run workflow` please"));
    replaceAllWorkflowTriggerWords(editor);
    const chips = editor.querySelectorAll("[data-trigger-word]");
    expect(chips.length).toBe(1);
  });

  it("three workflows in one node", () => {
    const editor = document.createElement("div");
    editor.appendChild(document.createTextNode("workflow workflow workflow"));
    replaceAllWorkflowTriggerWords(editor);
    const chips = editor.querySelectorAll("[data-trigger-word]");
    console.log(
      "THREE-IN-ONE chip count:",
      chips.length,
      "| text:",
      JSON.stringify(editor.textContent),
    );
    expect(chips.length).toBe(3);
  });
});
