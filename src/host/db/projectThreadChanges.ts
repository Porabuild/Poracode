type ProjectThreadChangeListener = () => void;

const listeners = new Set<ProjectThreadChangeListener>();

export function onProjectThreadDataChanged(listener: ProjectThreadChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyProjectThreadDataChanged(): void {
  for (const listener of listeners) listener();
}
