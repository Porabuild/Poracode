export interface LinkMetadata {
  title: string | null;
  description: string | null;
}

export function jiraIssueKey(value: string): string | null {
  try {
    const url = new URL(value);
    if (!url.hostname.toLowerCase().endsWith(".atlassian.net")) return null;
    return /^\/browse\/([A-Z][A-Z0-9]+-\d+)$/iu.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}
