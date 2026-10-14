import { dbGetProjects, dbGetThreads, dbGetThreadsPage } from "./projectsThreads";
import { dbGetThreadRuntimeSummariesCommitted } from "./runtimeItems";

function summariesFor(threads: ReturnType<typeof dbGetThreads>) {
  return dbGetThreadRuntimeSummariesCommitted(
    threads.filter((thread) => !thread.archived).map((thread) => thread.id),
  );
}

/** Worker caller supplies the enclosing SQLite read transaction. */
export function readLegacyShellCatalog(options: { threadListLimit?: number }) {
  const page =
    options.threadListLimit === undefined
      ? null
      : dbGetThreadsPage({ limit: options.threadListLimit });
  const threads = page?.threads ?? dbGetThreads();
  return {
    projects: dbGetProjects(),
    threads,
    summaries: summariesFor(threads),
    nextCursor: page?.nextCursor ?? null,
  };
}

export function readLegacyThreadCatalog(input: Parameters<typeof dbGetThreadsPage>[0]) {
  const page = dbGetThreadsPage(input);
  return { ...page, summaries: summariesFor(page.threads) };
}
