import { defineNoArgProcedure } from "../core";
import type { UpdateStatus } from "../events";

export const updatesProcedures = {
  getUpdateStatus: defineNoArgProcedure<UpdateStatus | null, "main-local">(
    "getUpdateStatus",
    "main-local",
  ),
  checkForUpdate: defineNoArgProcedure<void, "main-local">("checkForUpdate", "main-local"),
  startUpdateDownload: defineNoArgProcedure<void, "main-local">(
    "startUpdateDownload",
    "main-local",
  ),
  installUpdate: defineNoArgProcedure<void, "main-local">("installUpdate", "main-local"),
} as const;
