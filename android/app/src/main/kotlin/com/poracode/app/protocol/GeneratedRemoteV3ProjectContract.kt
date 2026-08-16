package com.poracode.app.protocol

import com.poracode.app.model.RemoteClientException
import com.poracode.remote.v3.generated.RemoteRootCodec
import com.poracode.remote.v3.generated.RemoteRootCodecs
import com.poracode.remote.v3.generated.procedureU2EBrowseHostDirectoryU2ERequest
import com.poracode.remote.v3.generated.procedureU2EBrowseHostDirectoryU2EResult
import com.poracode.remote.v3.generated.procedureU2EDetectSetupScriptU2ERequest
import com.poracode.remote.v3.generated.procedureU2EDetectSetupScriptU2EResult
import com.poracode.remote.v3.generated.routeU2EProcedureU2DCallU2ERequest
import com.poracode.remote.v3.generated.routeU2EProjectU2DCommandU2ERequest
import com.poracode.remote.v3.generated.routeU2EProjectU2DCommandU2EResponse
import com.poracode.remote.v3.generated.routeU2EProjectU2DNotesU2DReadU2EPath
import com.poracode.remote.v3.generated.routeU2EProjectU2DNotesU2DReadU2EResponse
import com.poracode.remote.v3.generated.routeU2EProjectU2DNotesU2DWriteU2EPath
import com.poracode.remote.v3.generated.routeU2EProjectU2DNotesU2DWriteU2ERequest
import com.poracode.remote.v3.generated.routeU2EProjectU2DNotesU2DWriteU2EResponse
import com.poracode.remote.v3.generated.routeU2EProjectU2DSettingsU2EPath
import com.poracode.remote.v3.generated.routeU2EProjectU2DSettingsU2EResponse
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Hash-free generated root-codec facade for the complete projects transport slice. */
object GeneratedRemoteV3ProjectContract {
    fun projectCommandRequest(raw: String): String = canonical(
        RemoteRootCodecs.routeU2EProjectU2DCommandU2ERequest,
        raw,
    )

    fun projectCommandResponse(raw: String): String = canonical(
        RemoteRootCodecs.routeU2EProjectU2DCommandU2EResponse,
        raw,
    )

    fun projectSettingsPath(projectId: String): String = projectPath(
        RemoteRootCodecs.routeU2EProjectU2DSettingsU2EPath,
        projectId,
    )

    fun projectSettingsResponse(raw: String): String = canonical(
        RemoteRootCodecs.routeU2EProjectU2DSettingsU2EResponse,
        raw,
    )

    fun projectNotesReadPath(projectId: String): String = projectPath(
        RemoteRootCodecs.routeU2EProjectU2DNotesU2DReadU2EPath,
        projectId,
    )

    fun projectNotesReadResponse(raw: String): String = canonical(
        RemoteRootCodecs.routeU2EProjectU2DNotesU2DReadU2EResponse,
        raw,
    )

    fun projectNotesWritePath(projectId: String): String = projectPath(
        RemoteRootCodecs.routeU2EProjectU2DNotesU2DWriteU2EPath,
        projectId,
    )

    fun projectNotesWriteRequest(raw: String): String = canonical(
        RemoteRootCodecs.routeU2EProjectU2DNotesU2DWriteU2ERequest,
        raw,
    )

    fun projectNotesWriteResponse(raw: String): String = canonical(
        RemoteRootCodecs.routeU2EProjectU2DNotesU2DWriteU2EResponse,
        raw,
    )

    fun browseHostDirectoryRequest(path: String): String = procedureRequest(
        procedure = "browseHostDirectory",
        payload = buildJsonObject { put("path", path) },
        payloadCodec = RemoteRootCodecs.procedureU2EBrowseHostDirectoryU2ERequest,
    )

    fun browseHostDirectoryResponse(raw: String): String = procedureResult(
        raw,
        RemoteRootCodecs.procedureU2EBrowseHostDirectoryU2EResult,
    )

    fun detectSetupScriptRequest(projectLocation: JsonElement): String = procedureRequest(
        procedure = "detectSetupScript",
        payload = buildJsonObject { put("projectLocation", projectLocation) },
        payloadCodec = RemoteRootCodecs.procedureU2EDetectSetupScriptU2ERequest,
    )

    fun detectSetupScriptResponse(raw: String): String = procedureResult(
        raw,
        RemoteRootCodecs.procedureU2EDetectSetupScriptU2EResult,
    )

    internal fun procedureRequest(
        procedure: String,
        payload: JsonObject,
        payloadCodec: RemoteRootCodec<*>,
    ): String {
        val canonicalPayload = parseObject(canonical(payloadCodec, payload.toString()))
        return canonical(
            RemoteRootCodecs.routeU2EProcedureU2DCallU2ERequest,
            buildJsonObject {
                put("procedure", procedure)
                put("payload", canonicalPayload)
            }.toString(),
        )
    }

    /** Dynamic procedure responses share `{result: ...}` but validate the result per procedure. */
    internal fun procedureResult(raw: String, resultCodec: RemoteRootCodec<*>): String = try {
        val envelope = Json.parseToJsonElement(raw) as? JsonObject
            ?: throw IllegalArgumentException("not an object")
        val result = envelope["result"]
            ?: throw IllegalArgumentException("missing result")
        canonical(resultCodec, result.toString())
    } catch (error: RemoteClientException) {
        throw error
    } catch (_: Exception) {
        throw invalid("procedure result envelope")
    }

    private fun projectPath(codec: RemoteRootCodec<*>, projectId: String): String =
        parseObject(
            canonical(codec, buildJsonObject { put("projectId", projectId) }.toString()),
        ).requiredString("projectId")

    private fun parseObject(raw: String): JsonObject = try {
        Json.parseToJsonElement(raw) as JsonObject
    } catch (_: Exception) {
        throw invalid("canonical object")
    }

    private fun canonical(codec: RemoteRootCodec<*>, raw: String): String = try {
        codec.decode(raw).validatedSnapshot.toString()
    } catch (_: Exception) {
        throw invalid(codec.id)
    }

    private fun JsonObject.requiredString(name: String): String =
        (get(name) as? JsonPrimitive)?.takeIf { it.isString }?.content
            ?: throw invalid("project path")

    private fun invalid(boundary: String): RemoteClientException =
        RemoteClientException.invalidResponse(
            "Remote project contract validation failed at $boundary.",
        )
}
