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
  skillScanResultSchema,
  skillMarketplaceResultSchema,
  importSkillsResultSchema,
  installMarketplaceSkillResultSchema,
} from "../../contracts";
import { definePayloadProcedure, omittedResultSchema } from "../core";

export const skillProcedures = {
  scanSkills: definePayloadProcedure<ScanSkillsPayload, SkillScanResult, "supervisor">(
    "scanSkills",
    "supervisor",
    scanSkillsPayloadSchema,
    skillScanResultSchema,
  ),
  setSkillEnabled: definePayloadProcedure<SetSkillEnabledPayload, void, "supervisor">(
    "setSkillEnabled",
    "supervisor",
    setSkillEnabledPayloadSchema,
    omittedResultSchema,
  ),
  deleteSkill: definePayloadProcedure<DeleteSkillPayload, void, "supervisor">(
    "deleteSkill",
    "supervisor",
    deleteSkillPayloadSchema,
    omittedResultSchema,
  ),
  importSkills: definePayloadProcedure<ImportSkillsPayload, ImportSkillsResult, "supervisor">(
    "importSkills",
    "supervisor",
    importSkillsPayloadSchema,
    importSkillsResultSchema,
  ),
  listSkillMarketplace: definePayloadProcedure<
    ListSkillMarketplacePayload,
    SkillMarketplaceResult,
    "supervisor"
  >(
    "listSkillMarketplace",
    "supervisor",
    listSkillMarketplacePayloadSchema,
    skillMarketplaceResultSchema,
  ),
  installMarketplaceSkill: definePayloadProcedure<
    InstallMarketplaceSkillPayload,
    InstallMarketplaceSkillResult,
    "supervisor"
  >(
    "installMarketplaceSkill",
    "supervisor",
    installMarketplaceSkillPayloadSchema,
    installMarketplaceSkillResultSchema,
  ),
} as const;
