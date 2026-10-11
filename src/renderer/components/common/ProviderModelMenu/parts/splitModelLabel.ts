export function splitModelLabel(label: string): { name: string; hint?: string } {
  const separatorIdx = label.indexOf(" · ");
  if (separatorIdx < 0) return { name: label };
  return {
    name: label.slice(0, separatorIdx),
    hint: label.slice(separatorIdx + 3),
  };
}
