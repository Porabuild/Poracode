/**
 * Inline, non-editable badge representing an `@`-mentioned MCP server (Browser,
 * Crossagents, Computer Use, …) inside the composer's contentEditable. The chip
 * carries the server `id`/`name` on its dataset so {@link serializeToSegments}
 * can round-trip it to an `mcp` prompt segment, which flattens back to the
 * `@Name` directive the agent reads for the turn. The glyph mirrors the `Plug`
 * icon the app uses for MCP plugins elsewhere.
 */
export interface McpMentionChipInput {
  id: string;
  name: string;
}

// lucide `plug`, inlined for the DOM chip (mirrors how the skill chip inlines
// its glyph SVG); the React user-message badge renders the `Plug` component.
const PLUG_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/></svg>';

export function createMcpMentionChipElement(input: McpMentionChipInput): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.mcpId = input.id;
  chip.dataset.mcpName = input.name;
  chip.className = "poracode-slash-chip";

  const glyph = document.createElement("span");
  glyph.className = "poracode-slash-chip__slash";
  glyph.innerHTML = PLUG_ICON_SVG;
  chip.appendChild(glyph);

  const name = document.createElement("span");
  name.className = "poracode-slash-chip__name";
  name.textContent = input.name;
  chip.appendChild(name);

  return chip;
}
