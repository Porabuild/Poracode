import { homedir } from "node:os";
import type { ProjectLocation } from "./contracts";

export function homeScopeLocation(): ProjectLocation {
  return process.platform === "win32"
    ? { kind: "windows", path: homedir() }
    : { kind: "posix", path: homedir() };
}
