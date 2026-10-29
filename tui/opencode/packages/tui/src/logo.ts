// poracode: brand block art shared by the home wordmark, the session epilogue
// and the mini exit mark. Marker legend, shared by every renderer:
//   "_" space on the shadow colour        "^" "▀" in the stroke on the shadow
//   "~" "▀" in the shadow colour          "," "▄" in the shadow colour
//   "." "▀" in the brand colour (the Pora dot, on the baseline)
//   " " plain space                       anything else: that char in the stroke
export const pora = ["                   ", "█▀▀█ █▀▀█ █▀▀▄ ▀▀▀█", "█__█ █__█ █    █^^█", "█▀▀▀ ▀▀▀▀ ▀    ▀▀▀▀"]
export const code = ["             ▄     ", "█▀▀▀ █▀▀█ █▀▀█ █▀▀█", "█___ █__█ █__█ █^^^", "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀"]
export const mark = ["█^^█", "█▀▀▀", "▀  ."]

export const WORDMARK_FULL_WIDTH = 41
export const WORDMARK_STACKED_WIDTH = 21

export function wordmarkRows(available: number): string[] {
  if (available >= WORDMARK_FULL_WIDTH) {
    return pora.map((row, index) => row + (index === 3 ? " . " : "   ") + code[index])
  }
  if (available >= WORDMARK_STACKED_WIDTH) {
    return [pora[1] + "  ", pora[2] + "  ", pora[3] + " .", ...code.map((row) => row + "  ")]
  }
  return mark
}
