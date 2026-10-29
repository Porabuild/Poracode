import { json } from "../helpers";
import type { LocationGetOutput, ServerInfoOutput } from "@opencode/client";
import type { RouteArgs } from "../context";

/** Info, health, and location routes. */
export async function handleMetaRoutes({
  ctx,
  url,
  method,
  path,
}: RouteArgs): Promise<Response | undefined> {
  const { input, resolveProject, requestLocation, projectLocation, directoryOf } = ctx;

  if (method === "GET" && path === "/api/event") return input.events.subscribe();
  if ((path === "/api/info" || path === "/api/global/health") && method === "GET") {
    const output: ServerInfoOutput = {
      version: input.bootstrap.appVersion,
      pid: process.pid,
      urls: [],
      paths: { tmp: input.bootstrap.home },
    };
    return json(output);
  }
  if (path === "/api/location" && method === "GET") {
    const current = await resolveProject();
    const projectDirectory = directoryOf(projectLocation(current));
    const directory = requestLocation(url).directory;
    const output: LocationGetOutput = {
      directory,
      project: { id: current.id, directory: projectDirectory, canonical: projectDirectory },
    };
    return json(output);
  }
  if (path === "/api/location/reload" && method === "POST") {
    // A location reload refreshes location data only; resyncing the event
    // stream here reconnects the vendored UI mid-session and drops input.
    await resolveProject();
    return new Response(null, { status: 204 });
  }
  return undefined;
}
