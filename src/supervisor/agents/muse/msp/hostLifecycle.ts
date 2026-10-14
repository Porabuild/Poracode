import type { ChildProcess } from "node:child_process";
import type { ProjectLocation } from "@/shared/contracts";
import { awaitProcessTermination } from "@/shared/awaitProcessTermination";
import { batchWslCommandsAsync, quotePosixShellArg } from "../../base";
import type { MuseMspClient } from "./client";

/** A dead Windows wrapper can leave its Linux host holding native session leases. */
async function killSurvivingWslHost(location: ProjectLocation, hostCookie: string): Promise<void> {
  if (location.kind !== "wsl") return;
  const findOwned = `grep -Fls -- ${quotePosixShellArg(hostCookie)} /proc/[0-9]*/environ 2>/dev/null | tr -dc '0-9\\n '`;
  const [result] = await batchWslCommandsAsync(location.distro, [
    `pids=$(${findOwned}); [ -z "$pids" ] || kill -9 $pids 2>/dev/null; i=0; while [ "$i" -lt 30 ]; do pids=$(${findOwned}); [ -z "$pids" ] && exit 0; sleep 0.1; i=$((i + 1)); done; exit 1`,
  ]);
  if (!result?.ok) throw new Error("Muse MSP WSL host termination could not be confirmed.");
}

/** Both the writer and transcript observer own their client, process group and WSL cookie. */
export async function stopMuseServeHost(
  location: ProjectLocation,
  child: ChildProcess,
  client: Pick<MuseMspClient, "dispose">,
  hostCookie: string,
): Promise<void> {
  client.dispose();
  const stops = await Promise.allSettled([
    awaitProcessTermination(child, { ownedProcessGroup: process.platform !== "win32" }),
    killSurvivingWslHost(location, hostCookie),
  ]);
  const failures = stops.filter((stop) => stop.status === "rejected");
  if (failures.length)
    throw new AggregateError(
      failures.map((stop) => stop.reason),
      "Muse MSP shutdown failed.",
    );
}
