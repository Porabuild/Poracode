import { z } from "zod";
import { memorySearch } from "@/host/memory/runtime";
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
        "Search Poracode memory shared across providers. Pass a short query. Optional projectId includes that project's notes plus global notes. Read-only.",
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
    search_memory: async (args) => {
      const { query, projectId } = searchArgsSchema.parse(args);
      const entries = memorySearch(query, projectId);
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
