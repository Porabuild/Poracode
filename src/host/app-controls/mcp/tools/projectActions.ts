import { projectActionInputSchema } from "../../projectActions";
import { appControlToolDomain, defineAppControlTool } from "../defineTools";

export const projectActionTools = appControlToolDomain(
  defineAppControlTool({
    name: "project_action",
    description:
      "List saved project actions and recent runs, or run a named action in the project root or an explicit registered worktree. Use projectId and the actionId returned by list. Use a fresh operationKey for each intended invocation and reuse the same key after a lost reply. An action already active in the checkout returns its existing run. Use its terminalId with status, read, or stop. Exit code zero means success. Run and stop act on the user's workspace and require authorization.",
    input: projectActionInputSchema,
    run: (input, ctx) => {
      if (!ctx.projectActions) throw new Error("This host cannot run project actions.");
      return ctx.projectActions.execute(input);
    },
  }),
);
