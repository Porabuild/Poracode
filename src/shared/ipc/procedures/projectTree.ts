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
  browseHostDirectoryResultSchema,
  detectSetupScriptResultSchema,
  listProjectTreeResultSchema,
  readAbsoluteFileResultSchema,
  readExternalFileResultSchema,
  readProjectFileResultSchema,
  searchProjectFilesResultSchema,
  searchProjectTreeResultSchema,
  writeExternalFileResultSchema,
  writeProjectFileResultSchema,
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
import { definePayloadProcedure, omittedResultSchema } from "../core";

export const projectTreeProcedures = {
  searchProjectFiles: definePayloadProcedure<
    SearchProjectFilesPayload,
    SearchProjectFilesResult,
    "supervisor"
  >(
    "searchProjectFiles",
    "supervisor",
    searchProjectFilesPayloadSchema,
    searchProjectFilesResultSchema,
  ),
  listProjectTree: definePayloadProcedure<
    ListProjectTreePayload,
    ListProjectTreeResult,
    "supervisor"
  >("listProjectTree", "supervisor", listProjectTreePayloadSchema, listProjectTreeResultSchema),
  browseHostDirectory: definePayloadProcedure<
    BrowseHostDirectoryPayload,
    BrowseHostDirectoryResult,
    "supervisor"
  >(
    "browseHostDirectory",
    "supervisor",
    browseHostDirectoryPayloadSchema,
    browseHostDirectoryResultSchema,
  ),
  searchProjectTree: definePayloadProcedure<
    SearchProjectTreePayload,
    SearchProjectTreeResult,
    "supervisor"
  >(
    "searchProjectTree",
    "supervisor",
    searchProjectTreePayloadSchema,
    searchProjectTreeResultSchema,
  ),
  readProjectFile: definePayloadProcedure<
    ReadProjectFilePayload,
    ReadProjectFileResult,
    "supervisor"
  >("readProjectFile", "supervisor", readProjectFilePayloadSchema, readProjectFileResultSchema),
  readAbsoluteFile: definePayloadProcedure<
    ReadAbsoluteFilePayload,
    ReadAbsoluteFileResult,
    "supervisor"
  >("readAbsoluteFile", "supervisor", readAbsoluteFilePayloadSchema, readAbsoluteFileResultSchema),
  readExternalFile: definePayloadProcedure<
    ReadExternalFilePayload,
    ReadExternalFileResult,
    "supervisor"
  >("readExternalFile", "supervisor", readExternalFilePayloadSchema, readExternalFileResultSchema),
  writeProjectFile: definePayloadProcedure<
    WriteProjectFilePayload,
    WriteProjectFileResult,
    "supervisor"
  >("writeProjectFile", "supervisor", writeProjectFilePayloadSchema, writeProjectFileResultSchema),
  writeExternalFile: definePayloadProcedure<
    WriteExternalFilePayload,
    WriteExternalFileResult,
    "supervisor"
  >(
    "writeExternalFile",
    "supervisor",
    writeExternalFilePayloadSchema,
    writeExternalFileResultSchema,
  ),
  createProjectEntry: definePayloadProcedure<CreateProjectEntryPayload, void, "supervisor">(
    "createProjectEntry",
    "supervisor",
    createProjectEntryPayloadSchema,
    omittedResultSchema,
  ),
  renameProjectEntry: definePayloadProcedure<RenameProjectEntryPayload, void, "supervisor">(
    "renameProjectEntry",
    "supervisor",
    renameProjectEntryPayloadSchema,
    omittedResultSchema,
  ),
  moveProjectEntry: definePayloadProcedure<MoveProjectEntryPayload, void, "supervisor">(
    "moveProjectEntry",
    "supervisor",
    moveProjectEntryPayloadSchema,
    omittedResultSchema,
  ),
  deleteProjectEntry: definePayloadProcedure<DeleteProjectEntryPayload, void, "supervisor">(
    "deleteProjectEntry",
    "supervisor",
    deleteProjectEntryPayloadSchema,
    omittedResultSchema,
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
  >(
    "detectSetupScript",
    "supervisor",
    detectSetupScriptPayloadSchema,
    detectSetupScriptResultSchema,
  ),
} as const;
