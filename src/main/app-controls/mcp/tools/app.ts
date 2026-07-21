import { z } from "zod";
import { BUILT_IN_MCP_SERVER_NAMES } from "@/shared/contracts";
import { APP_CONTROLS_MCP_SERVER_INFO } from "./serverInfo";
import type { ToolDomain } from "./types";

const notifyArgsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(2_000).optional(),
});

export const appTools: ToolDomain = {
  specs: [
    {
      name: "get_app_info",
      description:
        "Read-only overview of the running Poracode app: version, platform, UI locale setting, project/thread counts, whether a desktop renderer window is connected (vs headless server), and this MCP server's name/version.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "notify_user",
      description:
        "Show the user a native OS notification (e.g. to flag that a long task needs their attention). Clicking it focuses the app on the calling thread. Desktop-only: on a headless server the response reports that nothing was shown.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["title"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 200 },
          body: { type: "string", minLength: 1, maxLength: 2000 },
        },
      },
    },
    {
      name: "check_for_update",
      description:
        "Trigger the desktop app's read-only update check and report the current version plus the most recent known update status. Does not download or install anything. Reports not-supported on a headless server or in dev.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
  ],
  handlers: {
    get_app_info: (_args, ctx) => {
      const info = ctx.getAppInfo();
      const threads = ctx.getThreads();
      return {
        version: info.version,
        platform: info.platform,
        locale: ctx.settings.read().locale,
        projectCount: ctx.getProjects().length,
        threadCount: threads.length,
        openThreadCount: threads.filter((thread) => !thread.archived && !thread.done).length,
        renderer: info.hasRendererWindow ? "desktop" : "headless",
        mcpServer: {
          name: BUILT_IN_MCP_SERVER_NAMES["app-controls"],
          version: APP_CONTROLS_MCP_SERVER_INFO.version,
        },
      };
    },
    notify_user: (args, ctx) => {
      const { title, body } = notifyArgsSchema.parse(args);
      const result = ctx.notifyUser({
        title,
        body: body ?? "",
        threadId: ctx.identity.threadId ?? "",
      });
      return {
        delivered: result.delivered,
        ...(result.note ? { note: result.note } : {}),
      };
    },
    check_for_update: (_args, ctx) => ctx.checkForUpdate(),
  },
};
