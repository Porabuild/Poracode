import {
  importSessionThreadCommandSchema,
  listImportableSessionsPayloadSchema,
} from "@/shared/contracts";
import { appControlToolDomain, defineAppControlTool } from "../defineTools";
import { requireAppRuntime } from "./types";

export const sessionImportTools = appControlToolDomain(
  defineAppControlTool({
    name: "list_importable_sessions",
    description:
      "List saved CLI conversations on the owning host using the app's Import Sessions filters. Filter by agentKind, original folder cwd, or query over titles, previews, and folders. The host returns bounded results, filter choices, and a truncated flag. Use an exact returned path and providerSessionId for import_session.",
    input: listImportableSessionsPayloadSchema.strict(),
    run: (input, ctx) => requireAppRuntime(ctx).call("listImportableSessions", input),
  }),
  defineAppControlTool({
    name: "import_session",
    description:
      "Import a selected CLI conversation as an inactive, resumable Chat thread. Confirm the conversation and destination with the user. From list_importable_sessions pass its agentKind, providerSessionId and path. Supply a title, a supported model for that provider, and the registered projectId to hold the thread. An already saved conversation returns its existing thread ID.",
    input: importSessionThreadCommandSchema.omit({ kind: true, threadId: true }).strict(),
    run: (input, ctx) => {
      if (!ctx.importSession) throw new Error("The owning host is not ready to import sessions.");
      return ctx.importSession(input);
    },
  }),
);
