import { z } from "zod";
import { memorySearch } from "@/host/memory/runtime";
import { dbGetMemoryThreadState } from "@/host/db/memoryStore";
import type { ToolDomain } from "./types";

const searchArgsSchema = z.object({
  query: z.string().trim().min(1),
  projectId: z.string().min(1).optional(),
});

export const memoryTools: ToolDomain = {
  specs: [
    {
      name: "search_memory",
      description:
        "Search global memory and the calling thread's project notes across providers. Pass a short query. Read-only.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: { type: "string", minLength: 1 },
          projectId: { type: "string" },
        },
      },
    },
  ],
  handlers: {
    search_memory: async (args, ctx) => {
      const { query, projectId } = searchArgsSchema.parse(args);
      const threadId = ctx.identity.threadId;
      const thread = threadId ? ctx.getThread(threadId) : null;
      if (projectId && projectId !== thread?.projectId) {
        throw new Error("Memory search is limited to the calling thread's project.");
      }
      if (thread) {
        if (!ctx.deviceWorkspace)
          throw new Error("Memory search could not verify the calling thread.");
        ctx.deviceWorkspace.authorizeAgent(thread.id, ctx.identity.deviceProof);
        if (dbGetMemoryThreadState(thread.id).mode === "incognito") return { entries: [] };
      }
      const entries = memorySearch(query, thread?.projectId);
      return {
        entries: entries.map((entry) => ({
          id: entry.id,
          scope: entry.scope,
          category: entry.category,
          summary: entry.summary,
          confidence: entry.confidence,
        })),
      };
    },
  },
};
