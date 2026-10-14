package com.poracode.app.protocol

import com.poracode.remote.v3.generated.RemoteRootCodec
import com.poracode.remote.v3.generated.RemoteRootCodecs
import com.poracode.remote.v3.generated.procedureU2EGetGitDiffBatchU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGetGitDiffBatchU2EResult
import com.poracode.remote.v3.generated.procedureU2EGetGitDiffU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGetGitDiffU2EResult
import com.poracode.remote.v3.generated.procedureU2EGetGitFileContentU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGetGitFileContentU2EResult
import com.poracode.remote.v3.generated.procedureU2EGetGitStatusU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGetGitStatusU2EResult
import com.poracode.remote.v3.generated.procedureU2EGitProjectSnapshotU2ERequest
import com.poracode.remote.v3.generated.procedureU2EGitProjectSnapshotU2EResult
import com.poracode.remote.v3.generated.procedureU2EListProjectTreeU2ERequest
import com.poracode.remote.v3.generated.procedureU2EListProjectTreeU2EResult
import com.poracode.remote.v3.generated.procedureU2EReadProjectFileU2ERequest
import com.poracode.remote.v3.generated.procedureU2EReadProjectFileU2EResult
import com.poracode.remote.v3.generated.procedureU2ESearchProjectFilesU2ERequest
import com.poracode.remote.v3.generated.procedureU2ESearchProjectFilesU2EResult
import com.poracode.remote.v3.generated.procedureU2ESearchProjectTreeU2ERequest
import com.poracode.remote.v3.generated.procedureU2ESearchProjectTreeU2EResult
import com.poracode.remote.v3.generated.procedureU2EWriteProjectFileU2ERequest
import com.poracode.remote.v3.generated.procedureU2EWriteProjectFileU2EResult
import kotlinx.serialization.json.JsonObject

enum class ProjectWorkspaceProcedure(val wireName: String) {
    SearchProjectFiles("searchProjectFiles"),
    ListProjectTree("listProjectTree"),
    SearchProjectTree("searchProjectTree"),
    ReadProjectFile("readProjectFile"),
    WriteProjectFile("writeProjectFile"),
    GetGitStatus("getGitStatus"),
    GetGitDiff("getGitDiff"),
    GetGitDiffBatch("getGitDiffBatch"),
    GetGitFileContent("getGitFileContent"),
    GitProjectSnapshot("gitProjectSnapshot"),
}

/** Stable names around generated root codecs for project files and Git views. */
object GeneratedRemoteV3ProjectWorkspaceContract {
    fun request(procedure: ProjectWorkspaceProcedure, payload: JsonObject): String =
        GeneratedRemoteV3ProjectContract.procedureRequest(
            procedure = procedure.wireName,
            payload = payload,
            payloadCodec = procedure.requestCodec(),
        )

    fun result(procedure: ProjectWorkspaceProcedure, envelope: String): String =
        GeneratedRemoteV3ProjectContract.procedureResult(
            envelope,
            procedure.resultCodec(),
        )
}

private fun ProjectWorkspaceProcedure.requestCodec(): RemoteRootCodec<*> = when (this) {
    ProjectWorkspaceProcedure.SearchProjectFiles ->
        RemoteRootCodecs.procedureU2ESearchProjectFilesU2ERequest
    ProjectWorkspaceProcedure.ListProjectTree ->
        RemoteRootCodecs.procedureU2EListProjectTreeU2ERequest
    ProjectWorkspaceProcedure.SearchProjectTree ->
        RemoteRootCodecs.procedureU2ESearchProjectTreeU2ERequest
    ProjectWorkspaceProcedure.ReadProjectFile ->
        RemoteRootCodecs.procedureU2EReadProjectFileU2ERequest
    ProjectWorkspaceProcedure.WriteProjectFile ->
        RemoteRootCodecs.procedureU2EWriteProjectFileU2ERequest
    ProjectWorkspaceProcedure.GetGitStatus ->
        RemoteRootCodecs.procedureU2EGetGitStatusU2ERequest
    ProjectWorkspaceProcedure.GetGitDiff ->
        RemoteRootCodecs.procedureU2EGetGitDiffU2ERequest
    ProjectWorkspaceProcedure.GetGitDiffBatch ->
        RemoteRootCodecs.procedureU2EGetGitDiffBatchU2ERequest
    ProjectWorkspaceProcedure.GetGitFileContent ->
        RemoteRootCodecs.procedureU2EGetGitFileContentU2ERequest
    ProjectWorkspaceProcedure.GitProjectSnapshot ->
        RemoteRootCodecs.procedureU2EGitProjectSnapshotU2ERequest
}

private fun ProjectWorkspaceProcedure.resultCodec(): RemoteRootCodec<*> = when (this) {
    ProjectWorkspaceProcedure.SearchProjectFiles ->
        RemoteRootCodecs.procedureU2ESearchProjectFilesU2EResult
    ProjectWorkspaceProcedure.ListProjectTree ->
        RemoteRootCodecs.procedureU2EListProjectTreeU2EResult
    ProjectWorkspaceProcedure.SearchProjectTree ->
        RemoteRootCodecs.procedureU2ESearchProjectTreeU2EResult
    ProjectWorkspaceProcedure.ReadProjectFile ->
        RemoteRootCodecs.procedureU2EReadProjectFileU2EResult
    ProjectWorkspaceProcedure.WriteProjectFile ->
        RemoteRootCodecs.procedureU2EWriteProjectFileU2EResult
    ProjectWorkspaceProcedure.GetGitStatus ->
        RemoteRootCodecs.procedureU2EGetGitStatusU2EResult
    ProjectWorkspaceProcedure.GetGitDiff ->
        RemoteRootCodecs.procedureU2EGetGitDiffU2EResult
    ProjectWorkspaceProcedure.GetGitDiffBatch ->
        RemoteRootCodecs.procedureU2EGetGitDiffBatchU2EResult
    ProjectWorkspaceProcedure.GetGitFileContent ->
        RemoteRootCodecs.procedureU2EGetGitFileContentU2EResult
    ProjectWorkspaceProcedure.GitProjectSnapshot ->
        RemoteRootCodecs.procedureU2EGitProjectSnapshotU2EResult
}
