import {
  deleteSkillPayloadSchema,
  importSkillsPayloadSchema,
  installMarketplaceSkillPayloadSchema,
  listSkillMarketplacePayloadSchema,
  scanSkillsPayloadSchema,
  setSkillEnabledPayloadSchema,
  type DeleteSkillPayload,
  type ImportSkillsPayload,
  type ImportSkillsResult,
  type InstallMarketplaceSkillPayload,
  type InstallMarketplaceSkillResult,
  type ListSkillMarketplacePayload,
  type ScanSkillsPayload,
  type SetSkillEnabledPayload,
  type SkillScanResult,
  type SkillMarketplaceResult,
} from "../../contracts";
import { definePayloadProcedure } from "../core";

export const skillProcedures = {
  scanSkills: definePayloadProcedure<ScanSkillsPayload, SkillScanResult, "supervisor">(
    "scanSkills",
    "supervisor",
    scanSkillsPayloadSchema,
  ),
  setSkillEnabled: definePayloadProcedure<SetSkillEnabledPayload, void, "supervisor">(
    "setSkillEnabled",
    "supervisor",
    setSkillEnabledPayloadSchema,
  ),
  deleteSkill: definePayloadProcedure<DeleteSkillPayload, void, "supervisor">(
    "deleteSkill",
    "supervisor",
    deleteSkillPayloadSchema,
  ),
  importSkills: definePayloadProcedure<ImportSkillsPayload, ImportSkillsResult, "supervisor">(
    "importSkills",
    "supervisor",
    importSkillsPayloadSchema,
  ),
  listSkillMarketplace: definePayloadProcedure<
    ListSkillMarketplacePayload,
    SkillMarketplaceResult,
    "supervisor"
  >("listSkillMarketplace", "supervisor", listSkillMarketplacePayloadSchema),
  installMarketplaceSkill: definePayloadProcedure<
    InstallMarketplaceSkillPayload,
    InstallMarketplaceSkillResult,
    "supervisor"
  >("installMarketplaceSkill", "supervisor", installMarketplaceSkillPayloadSchema),
} as const;
