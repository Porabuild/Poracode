package com.poracode.app.ui.projects

import com.poracode.app.model.McpServer
import com.poracode.app.model.ProjectIdentity
import com.poracode.app.model.RemoteProject
import com.poracode.app.session.projects.HostProjectCatalog
import com.poracode.app.session.projects.ProjectCapability
import com.poracode.app.session.projects.ProjectCatalogState
import com.poracode.app.session.projects.ProjectHostLease
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

data class ProjectUiAccess(
    val online: Boolean,
    val ready: Boolean,
    val canRead: Boolean,
    val canManage: Boolean,
    val canOperate: Boolean,
) {
    companion object {
        fun from(lease: ProjectHostLease?): ProjectUiAccess = ProjectUiAccess(
            online = lease?.online == true,
            ready = lease?.ready == true,
            canRead = lease.allows(ProjectCapability.Read),
            canManage = lease.allows(ProjectCapability.Manage),
            canOperate = lease.allows(ProjectCapability.Operate),
        )
    }
}

private fun ProjectHostLease?.allows(capability: ProjectCapability): Boolean =
    this != null && online && ready && capability.scope in scopes

fun ProjectCatalogState.currentCatalog(lease: ProjectHostLease?): HostProjectCatalog? {
    if (lease == null) return null
    return catalogs[lease.connectionId]?.takeIf { it.session == lease.key }
}

fun HostProjectCatalog?.project(projectId: String?): RemoteProject? {
    if (projectId == null) return null
    return this?.orderedProjects?.firstOrNull { it.identity.projectId == projectId }?.project
}

fun ProjectHostLease?.identity(projectId: String?): ProjectIdentity? {
    if (this == null || projectId == null) return null
    return ProjectIdentity(connectionId, projectId)
}

fun List<McpServer>.withServerEnabled(serverId: String, enabled: Boolean): List<McpServer> =
    map { server -> if (server.id == serverId) server.copy(enabled = enabled) else server }

/** Small plain-text bridge for the native editor; unknown rich nodes are retained until edited. */
object ProjectNoteDocument {
    fun text(document: JsonElement?): String = collectText(document).trimEnd('\n')

    private fun collectText(document: JsonElement?): String = when (document) {
        null -> ""
        is JsonPrimitive -> document.contentOrNull.orEmpty()
        is JsonArray -> document.joinToString("") { collectText(it) }
        is JsonObject -> {
            val direct = (document["text"] as? JsonPrimitive)?.contentOrNull
            if (direct != null) direct else {
                val type = (document["type"] as? JsonPrimitive)?.contentOrNull
                val content = document["content"]
                val nested = collectText(content)
                if (type == "paragraph" || type == "heading") "$nested\n" else nested
            }
        }
    }

    fun fromText(text: String): JsonElement? {
        if (text.isEmpty()) return null
        return buildJsonObject {
            put("type", "doc")
            put("content", buildJsonArray {
                text.split('\n').forEach { line ->
                    add(buildJsonObject {
                        put("type", "paragraph")
                        if (line.isNotEmpty()) {
                            put("content", buildJsonArray {
                                add(buildJsonObject {
                                    put("type", "text")
                                    put("text", line)
                                })
                            })
                        }
                    })
                }
            })
        }
    }
}
