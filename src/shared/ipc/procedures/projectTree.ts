import {
  browseHostDirectoryPayloadSchema,
  createProjectEntryPayloadSchema,
  deleteProjectEntryPayloadSchema,
  detectSetupScriptPayloadSchema,
  listProjectTreePayloadSchema,
  moveProjectEntryPayloadSchema,
  readAbsoluteFilePayloadSchema,
  readExternalFilePayloadSchema,
  readProjectFilePayloadSchema,
  renameProjectEntryPayloadSchema,
  revealProjectEntryPayloadSchema,
  searchProjectFilesPayloadSchema,
  searchProjectTreePayloadSchema,
  writeExternalFilePayloadSchema,
  writeProjectFilePayloadSchema,
} from "../../contracts";
import type {
  BrowseHostDirectoryPayload,
  BrowseHostDirectoryResult,
  CreateProjectEntryPayload,
  DeleteProjectEntryPayload,
  DetectSetupScriptPayload,
  DetectSetupScriptResult,
  ListProjectTreePayload,
  ListProjectTreeResult,
  MoveProjectEntryPayload,
  ReadAbsoluteFilePayload,
  ReadAbsoluteFileResult,
  ReadExternalFilePayload,
  ReadExternalFileResult,
  ReadProjectFilePayload,
  ReadProjectFileResult,
  RenameProjectEntryPayload,
  RevealProjectEntryPayload,
  SearchProjectFilesPayload,
  SearchProjectFilesResult,
  SearchProjectTreePayload,
  SearchProjectTreeResult,
  WriteExternalFilePayload,
  WriteExternalFileResult,
  WriteProjectFilePayload,
  WriteProjectFileResult,
} from "../../contracts";
import { definePayloadProcedure } from "../core";

export const projectTreeProcedures = {
  searchProjectFiles: definePayloadProcedure<
    SearchProjectFilesPayload,
    SearchProjectFilesResult,
    "supervisor"
  >("searchProjectFiles", "supervisor", searchProjectFilesPayloadSchema),
  listProjectTree: definePayloadProcedure<
    ListProjectTreePayload,
    ListProjectTreeResult,
    "supervisor"
  >("listProjectTree", "supervisor", listProjectTreePayloadSchema),
  browseHostDirectory: definePayloadProcedure<
    BrowseHostDirectoryPayload,
    BrowseHostDirectoryResult,
    "supervisor"
  >("browseHostDirectory", "supervisor", browseHostDirectoryPayloadSchema),
  searchProjectTree: definePayloadProcedure<
    SearchProjectTreePayload,
    SearchProjectTreeResult,
    "supervisor"
  >("searchProjectTree", "supervisor", searchProjectTreePayloadSchema),
  readProjectFile: definePayloadProcedure<
    ReadProjectFilePayload,
    ReadProjectFileResult,
    "supervisor"
  >("readProjectFile", "supervisor", readProjectFilePayloadSchema),
  readAbsoluteFile: definePayloadProcedure<
    ReadAbsoluteFilePayload,
    ReadAbsoluteFileResult,
    "supervisor"
  >("readAbsoluteFile", "supervisor", readAbsoluteFilePayloadSchema),
  readExternalFile: definePayloadProcedure<
    ReadExternalFilePayload,
    ReadExternalFileResult,
    "supervisor"
  >("readExternalFile", "supervisor", readExternalFilePayloadSchema),
  writeProjectFile: definePayloadProcedure<
    WriteProjectFilePayload,
    WriteProjectFileResult,
    "supervisor"
  >("writeProjectFile", "supervisor", writeProjectFilePayloadSchema),
  writeExternalFile: definePayloadProcedure<
    WriteExternalFilePayload,
    WriteExternalFileResult,
    "supervisor"
  >("writeExternalFile", "supervisor", writeExternalFilePayloadSchema),
  createProjectEntry: definePayloadProcedure<CreateProjectEntryPayload, void, "supervisor">(
    "createProjectEntry",
    "supervisor",
    createProjectEntryPayloadSchema,
  ),
  renameProjectEntry: definePayloadProcedure<RenameProjectEntryPayload, void, "supervisor">(
    "renameProjectEntry",
    "supervisor",
    renameProjectEntryPayloadSchema,
  ),
  moveProjectEntry: definePayloadProcedure<MoveProjectEntryPayload, void, "supervisor">(
    "moveProjectEntry",
    "supervisor",
    moveProjectEntryPayloadSchema,
  ),
  deleteProjectEntry: definePayloadProcedure<DeleteProjectEntryPayload, void, "supervisor">(
    "deleteProjectEntry",
    "supervisor",
    deleteProjectEntryPayloadSchema,
  ),
  revealProjectEntry: definePayloadProcedure<RevealProjectEntryPayload, void, "main-local">(
    "revealProjectEntry",
    "main-local",
    revealProjectEntryPayloadSchema,
  ),
  detectSetupScript: definePayloadProcedure<
    DetectSetupScriptPayload,
    DetectSetupScriptResult,
    "supervisor"
  >("detectSetupScript", "supervisor", detectSetupScriptPayloadSchema),
} as const;
