export function textWidth(value: string) {
  return Bun.stringWidth(value);
}

/** End truncation like the desktop's CSS `truncate`; OpenTUI's own `truncate` elides mid-line. */
export function endTruncate(value: string, width: number) {
  if (textWidth(value) <= width) return value;
  if (width <= 1) return "";
  let head = value;
  while (head.length > 0 && textWidth(head) > width - 1) head = head.slice(0, -1);
  return `${head.trimEnd()}…`;
}

export function headTruncate(value: string, width: number) {
  if (textWidth(value) <= width) return value;
  if (width <= 1) return "";
  let tail = value;
  while (tail.length > 0 && textWidth(tail) > width - 1) tail = tail.slice(1);
  return `…${tail}`;
}
