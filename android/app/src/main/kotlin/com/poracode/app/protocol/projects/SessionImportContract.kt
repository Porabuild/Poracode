package com.poracode.app.protocol.projects

import com.poracode.app.model.AgentStatusEntry
import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteProject
import com.poracode.app.model.RemoteThread
import com.poracode.app.protocol.ProtocolConstants
import com.poracode.remote.v3.generated.*
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

data class ImportableCliSession(
    val id: String,
    val agentKind: String,
    val providerSessionId: String,
    val path: String,
    val cwd: String? = null,
    val updatedAt: String = "",
    val preview: String = "",
    val title: String? = null,
    val model: String? = null,
    val cwdExists: Boolean = true,
) {
    val displayTitle: String
        get() = nonEmpty(title) ?: nonEmpty(preview) ?: providerSessionId

    private fun nonEmpty(v: String?): String? = v?.trim()?.takeIf { it.isNotEmpty() }
}

data class SessionImportFacets(
    val agentKinds: List<String> = emptyList(),
    val folders: List<String> = emptyList(),
)

data class SessionImportListing(
    val sessions: List<ImportableCliSession> = emptyList(),
    val facets: SessionImportFacets = SessionImportFacets(),
    val truncated: Boolean = false,
)

data class SessionImportFilter(
    val agentKind: String? = null,
    val cwd: String? = null,
    val query: String = "",
) {
    fun includes(session: ImportableCliSession): Boolean {
        val kind = agentKind?.trim()?.takeIf { it.isNotEmpty() }
        if (kind != null && session.agentKind != kind) return false
        val folder = cwd?.trim()?.takeIf { it.isNotEmpty() }
        if (folder != null && session.cwd != folder) return false
        val needle = query.trim().lowercase()
        if (needle.isEmpty()) return true
        return listOfNotNull(session.title, session.preview, session.cwd, session.agentKind)
            .any { it.lowercase().contains(needle) }
    }
}

/**
 * Generated-codec contract for `listImportableSessions` procedure and `import-session`
 * command payload (matching iOS `SessionImportModels.swift` & `SessionImportController.swift`).
 */
object SessionImportContract {
    const val PROCEDURE_NAME = "listImportableSessions"
    const val PROCEDURE_PATH = "/api/git/call"
    private val json = Json { ignoreUnknownKeys = true; isLenient = false }

    fun encodeListRequest(filter: SessionImportFilter = SessionImportFilter()): String {
        if (RemoteContractMetadata.protocolVersion != ProtocolConstants.REMOTE_PROTOCOL_VERSION) {
            throw invalid("Incompatible protocol version.")
        }
        val payloadObj = buildJsonObject {
            filter.agentKind?.trim()?.takeIf { it.isNotEmpty() }?.let { put("agentKind", it) }
            filter.cwd?.trim()?.takeIf { it.isNotEmpty() }?.let { put("cwd", it) }
            filter.query.trim().takeIf { it.isNotEmpty() }?.let { put("query", it) }
        }
        val canonicalPayload = canonical(
            RemoteRootCodecs.procedureU2EListImportableSessionsU2ERequest,
            payloadObj.toString(),
        )
        val envelope = buildJsonObject {
            put("procedure", PROCEDURE_NAME)
            put("payload", json.parseToJsonElement(canonicalPayload))
        }
        return canonical(RemoteRootCodecs.routeU2EProcedureU2DCallU2ERequest, envelope.toString())
    }

    fun decodeListResponse(rawJson: String): SessionImportListing {
        val root = json.parseToJsonElement(rawJson).jsonObject
        val resultElement = root["result"]
            ?: throw invalid("Missing result in listImportableSessions response.")
        val canonicalResult = canonical(
            RemoteRootCodecs.procedureU2EListImportableSessionsU2EResult,
            resultElement.toString(),
        )
        val obj = json.parseToJsonElement(canonicalResult).jsonObject
        val sessions = (obj["sessions"] as? JsonArray).orEmpty().mapNotNull { el ->
            val s = el as? JsonObject ?: return@mapNotNull null
            val id = s["id"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
            val agentKind = s["agentKind"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
            val providerSessionId = s["providerSessionId"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
            val path = s["path"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
            ImportableCliSession(
                id = id,
                agentKind = agentKind,
                providerSessionId = providerSessionId,
                path = path,
                cwd = s["cwd"]?.jsonPrimitive?.contentOrNull,
                updatedAt = s["updatedAt"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                preview = s["preview"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                title = s["title"]?.jsonPrimitive?.contentOrNull,
                model = s["model"]?.jsonPrimitive?.contentOrNull,
                cwdExists = s["cwdExists"]?.jsonPrimitive?.booleanOrNull ?: true,
            )
        }
        val facetsObj = obj["facets"] as? JsonObject
        val facets = SessionImportFacets(
            agentKinds = (facetsObj?.get("agentKinds") as? JsonArray).orEmpty()
                .mapNotNull { it.jsonPrimitive.contentOrNull },
            folders = (facetsObj?.get("folders") as? JsonArray).orEmpty()
                .mapNotNull { it.jsonPrimitive.contentOrNull },
        )
        return SessionImportListing(
            sessions = sessions,
            facets = facets,
            truncated = obj["truncated"]?.jsonPrimitive?.booleanOrNull ?: false,
        )
    }

    fun importCommandPayload(
        projectId: String,
        session: ImportableCliSession,
        model: String,
        fallbackTitle: String,
    ): JsonObject = buildJsonObject {
        put("kind", "import-session")
        put("projectId", projectId)
        put("agentKind", session.agentKind)
        put("model", model)
        put("title", normalizedTitle(session, fallbackTitle))
        put("path", session.path)
        put("providerSessionId", session.providerSessionId)
    }

    fun alreadyImportedThreadId(
        session: ImportableCliSession,
        threads: List<RemoteThread>,
    ): String? = threads.firstOrNull { thread ->
        thread.agentKind == session.agentKind &&
            thread.sessionRef?.providerSessionId == session.providerSessionId
    }?.id

    fun resolveModel(
        session: ImportableCliSession,
        project: RemoteProject?,
        agents: List<AgentStatusEntry>,
    ): String? {
        val agent = agents.firstOrNull { it.kind == session.agentKind }
        val offered = (agent?.capabilities?.get("models") as? JsonArray).orEmpty().mapNotNull { el ->
            (el as? JsonObject)?.get("id")?.jsonPrimitive?.contentOrNull
                ?: el.jsonPrimitive.contentOrNull
        }
        val sessionModel = session.model?.trim()?.takeIf { it.isNotEmpty() }
        if (sessionModel != null && sessionModel in offered) return sessionModel
        val draft = project?.lastDraftConfig
        if (draft?.agentKind == session.agentKind) {
            val draftModel = draft.model.trim().takeIf { it.isNotEmpty() }
            if (draftModel != null && (offered.isEmpty() || draftModel in offered)) return draftModel
        }
        return offered.firstOrNull() ?: sessionModel
    }

    fun normalizedTitle(session: ImportableCliSession, fallback: String): String {
        val raw = (session.title ?: session.preview).trim().ifEmpty { fallback }
        return if (raw.length > 60) raw.take(60) + "…" else raw
    }

    private fun <T> canonical(codec: RemoteRootCodec<T>, rawJson: String): String = try {
        codec.encodeSnapshot(codec.decode(rawJson))
    } catch (error: Throwable) {
        throw invalid("Generated contract validation failed: ${error.message}")
    }

    private fun invalid(message: String): RemoteClientException =
        RemoteClientException(message = message, status = 400, code = "invalid_response")
}
