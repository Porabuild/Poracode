let repoKeyReader: ((projectId: string) => string | null) | undefined;

export function setMemoryRepoKeyReader(
  reader: ((projectId: string) => string | null) | undefined,
): void {
  repoKeyReader = reader;
}

export function readMemoryRepoKey(projectId: string | null | undefined): string | null {
  if (!projectId) return null;
  return repoKeyReader ? repoKeyReader(projectId) : null;
}
