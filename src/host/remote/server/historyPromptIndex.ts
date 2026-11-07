import { persistedPromptIndexSchema } from "@/shared/ipc/schemas";
import { dbGetThread } from "@/host/db/projectsThreads";
import { dbGetThreadPromptIndex } from "@/host/db/runtimeItems";
import { RemoteHttpError } from "../auth";
import { mapHistoryPersistenceRefusal } from "./historyReadFence";
import { writeNegotiatedJson } from "./httpCompression";
import { requirePathParam, type HttpRouteCall } from "./httpRouteHandlers.shared";

/**
 * Authenticated, fenced list of a thread's newest prompts (id, order, short
 * preview). Bounded by construction: the host caps the prompt count and the
 * per-prompt text, so the body never depends on transcript size.
 */
export async function handleHistoryPromptIndex(call: HttpRouteCall): Promise<void> {
  const threadId = requirePathParam(call.params, "threadId");
  if (!dbGetThread(threadId))
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  let index: Awaited<ReturnType<typeof dbGetThreadPromptIndex>>;
  try {
    index = await dbGetThreadPromptIndex(threadId);
  } catch (error) {
    throw mapHistoryPersistenceRefusal(error);
  }
  await writeNegotiatedJson(
    call.req,
    call.res,
    200,
    JSON.stringify(persistedPromptIndexSchema.parse(index)),
  );
}
