import {
  createSkillPayloadSchema,
  deleteSkillPayloadSchema,
  installMarketplaceSkillPayloadSchema,
  installSkillFromGitPayloadSchema,
  optimizeSkillsPayloadSchema,
  readSkillPayloadSchema,
  renameSkillPayloadSchema,
  revealSkillPayloadSchema,
  scanSkillsPayloadSchema,
  transferSkillPayloadSchema,
  writeSkillPayloadSchema,
} from "../../contracts";
import type {
  CreateSkillPayload,
  DeleteSkillPayload,
  InstallMarketplaceSkillPayload,
  InstallMarketplaceSkillResult,
  InstallSkillFromGitPayload,
  OptimizeSkillsPayload,
  OptimizeSkillsResult,
  ReadSkillPayload,
  RenameSkillPayload,
  RevealSkillPayload,
  ScanSkillsPayload,
  SkillDetail,
  SkillScan,
  TransferSkillPayload,
  TransferSkillResult,
  WriteSkillPayload,
} from "../../contracts";
import { definePayloadProcedure } from "../core";

export const skillsProcedures = {
  scanSkills: definePayloadProcedure<ScanSkillsPayload, SkillScan, "supervisor">(
    "scanSkills",
    "supervisor",
    scanSkillsPayloadSchema,
  ),
  readSkill: definePayloadProcedure<ReadSkillPayload, SkillDetail, "supervisor">(
    "readSkill",
    "supervisor",
    readSkillPayloadSchema,
  ),
  writeSkill: definePayloadProcedure<WriteSkillPayload, void, "supervisor">(
    "writeSkill",
    "supervisor",
    writeSkillPayloadSchema,
  ),
  createSkill: definePayloadProcedure<CreateSkillPayload, TransferSkillResult, "supervisor">(
    "createSkill",
    "supervisor",
    createSkillPayloadSchema,
  ),
  deleteSkill: definePayloadProcedure<DeleteSkillPayload, void, "supervisor">(
    "deleteSkill",
    "supervisor",
    deleteSkillPayloadSchema,
  ),
  renameSkill: definePayloadProcedure<RenameSkillPayload, TransferSkillResult, "supervisor">(
    "renameSkill",
    "supervisor",
    renameSkillPayloadSchema,
  ),
  transferSkill: definePayloadProcedure<TransferSkillPayload, TransferSkillResult, "supervisor">(
    "transferSkill",
    "supervisor",
    transferSkillPayloadSchema,
  ),
  optimizeSkills: definePayloadProcedure<OptimizeSkillsPayload, OptimizeSkillsResult, "supervisor">(
    "optimizeSkills",
    "supervisor",
    optimizeSkillsPayloadSchema,
  ),
  installMarketplaceSkill: definePayloadProcedure<
    InstallMarketplaceSkillPayload,
    InstallMarketplaceSkillResult,
    "supervisor"
  >("installMarketplaceSkill", "supervisor", installMarketplaceSkillPayloadSchema),
  installSkillFromGit: definePayloadProcedure<
    InstallSkillFromGitPayload,
    InstallMarketplaceSkillResult,
    "supervisor"
  >("installSkillFromGit", "supervisor", installSkillFromGitPayloadSchema),
  revealSkill: definePayloadProcedure<RevealSkillPayload, void, "main-local">(
    "revealSkill",
    "main-local",
    revealSkillPayloadSchema,
  ),
} as const;
