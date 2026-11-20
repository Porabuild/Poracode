import {
  appLocalPortsCloseSchema,
  appLocalPortsListSchema,
  appLocalPortsOpenSchema,
} from "@/shared/contracts/appLocalPorts";
import { appControlToolDomain, defineAppControlTool } from "../defineTools";
import { catalogPageFields, pageCatalog } from "./catalogPage";
import type { AppControlsToolContext } from "./types";

function requireLocalPorts(ctx: AppControlsToolContext) {
  if (!ctx.localPorts) throw new Error("Local port controls require the owning desktop.");
  return ctx.localPorts;
}

const listLocalPortsTool = defineAppControlTool({
  name: "list_local_ports",
  description:
    "List listening TCP sockets on this Poracode desktop, including the address, PID, process identity, URL and canClose. Filter by port for a specific dev server. Pass nextOffset as offset for the next page.",
  input: appLocalPortsListSchema.omit({ action: true }).extend({
    port: appLocalPortsCloseSchema.shape.port.optional(),
    ...catalogPageFields,
    limit: catalogPageFields.limit.unwrap().default(30),
  }),
  run: async ({ port, offset, limit }, ctx) => {
    const result = await requireLocalPorts(ctx)({ action: "list" });
    if (result.action !== "list") throw new Error("The desktop did not return a port snapshot.");
    const matches =
      port === undefined ? result.ports : result.ports.filter((row) => row.port === port);
    const { rows, ...page } = pageCatalog(matches, offset, limit);
    return { ...page, ports: rows };
  },
});

const closeLocalPortTool = defineAppControlTool({
  name: "close_local_port",
  description:
    "Stop the process that owns an exact listener on this Poracode desktop. Only call at the user's request. Pass port, address, pid and processStartedAt from a current list_local_ports row with canClose:true. The desktop rechecks ownership and reports closed only after that listener disappears. Closing can stop the process's other listeners.",
  input: appLocalPortsCloseSchema.omit({ action: true }),
  run: async (args, ctx) => {
    const result = await requireLocalPorts(ctx)({ ...args, action: "close" });
    if (result.action !== "close") throw new Error("The desktop did not confirm a close result.");
    return { closed: result.closed };
  },
});

const openLocalPortTool = defineAppControlTool({
  name: "open_local_port",
  description:
    "Open the address and port of a current listener from list_local_ports. target defaults to the Poracode browser. Use system for the default OS browser.",
  input: appLocalPortsOpenSchema.omit({ action: true }),
  run: (args, ctx) => requireLocalPorts(ctx)({ ...args, action: "open" }),
});

export const localPortTools = appControlToolDomain(
  listLocalPortsTool,
  openLocalPortTool,
  closeLocalPortTool,
);
