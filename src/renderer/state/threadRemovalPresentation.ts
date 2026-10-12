import { useAppStore } from "./appStore";
import { dispatchOptimisticCatalogEdit } from "./pendingCatalogEdits";
import { runRendererAction } from "./rendererActionStore";

/** Hide immediately, retaining history/drafts until authoritative membership removes them. */
export function presentThreadRemoval(
  threadIds: readonly string[],
  write: () => Promise<unknown>,
): Promise<void> {
  const removalKey = `thread:remove-group:${[...threadIds].sort().join(":")}`;
  return runRendererAction(removalKey, () => {
    const store = useAppStore.getState();
    const previousView = store.view;
    const rows = store.threads.filter((thread) => threadIds.includes(thread.id));
    let command: Promise<unknown> | undefined;
    for (const row of rows) useAppStore.getState().archiveThread(row.id);
    const paintedView = useAppStore.getState().view;
    return Promise.all(
      rows.map((row) => {
        const painted = useAppStore.getState().threads.find((thread) => thread.id === row.id)!;
        return dispatchOptimisticCatalogEdit({
          kind: "thread",
          row,
          patch: { archived: painted.archived, archivedAt: painted.archivedAt },
          serverGeneratedFields: ["archivedAt"],
          apply: () => {},
          write: () => (command ??= write()),
          restore: (base) =>
            useAppStore.setState((state) => ({
              threads: state.threads.map((thread) =>
                thread.id === row.id
                  ? { ...thread, archived: base.archived, archivedAt: base.archivedAt }
                  : thread,
              ),
              ...(state.view === paintedView ? { view: previousView } : {}),
            })),
        });
      }),
    ).then(() => undefined);
  });
}
