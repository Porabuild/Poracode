const DRAFT_PREFIX = "draft:";

export function isDraftPaneId(id: string): boolean {
  return id.startsWith(DRAFT_PREFIX);
}

export function makeDraftPaneId(projectId: string): string {
  return DRAFT_PREFIX + projectId;
}

export function parseDraftProjectId(id: string): string | undefined {
  return id.startsWith(DRAFT_PREFIX) ? id.slice(DRAFT_PREFIX.length) : undefined;
}
