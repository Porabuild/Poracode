package com.poracode.app.storage

import android.content.Context
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.HOME_PROJECT_ID
import com.poracode.app.model.RemoteHostWorkspace
import com.poracode.app.model.RemoteJson
import com.poracode.app.model.RemoteProject
import com.poracode.app.session.HostPresentation
import java.util.Locale
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

@Serializable
data class HomeWorkspace(
    val id: String,
    val name: String,
    val icon: String = "briefcase",
)

data class HomeWorkspaceHostInput(
    val connectionId: ClientConnectionId,
    val workspaces: List<RemoteHostWorkspace>?,
    val projects: List<RemoteProject>,
    val homeThreadIds: List<String>,
)

data class HomeWorkspaceState(
    val workspaces: List<HomeWorkspace> = DEFAULT_WORKSPACES,
    val activeWorkspaceId: String? = DEFAULT_WORKSPACES.first().id,
    val projectWorkspaceIds: Map<String, String> = emptyMap(),
    val explicitProjectIds: Set<String> = emptySet(),
    val threadWorkspaceIds: Map<String, String> = emptyMap(),
    val importedWorkspaceIds: Map<String, String> = emptyMap(),
    val canEdit: Boolean = true,
) {
    val activeWorkspace: HomeWorkspace?
        get() = workspaces.firstOrNull { it.id == activeWorkspaceId } ?: workspaces.firstOrNull()

    fun resolvedActiveId(): String? = activeWorkspace?.id

    fun workspaceForProject(projectKey: String): String? =
        projectWorkspaceIds[projectKey]?.takeIf { id -> workspaces.any { it.id == id } }

    fun workspaceForThread(threadKey: String): String? =
        threadWorkspaceIds[threadKey]?.takeIf { id -> workspaces.any { it.id == id } }

    fun includesProject(projectId: String, connectionId: ClientConnectionId?): Boolean {
        val active = resolvedActiveId() ?: return true
        if (projectId == HOME_PROJECT_ID || connectionId == null) return true
        val assigned = workspaceForProject(projectKey(connectionId, projectId)) ?: return true
        return assigned == active
    }

    fun includes(item: HostPresentation.UnifiedThreadItem): Boolean {
        val active = resolvedActiveId() ?: return true
        if (item.project.id == HOME_PROJECT_ID) {
            val assigned = workspaceForThread(item.id) ?: return true
            return assigned == active
        }
        return includesProject(item.project.id, item.connectionId)
    }

    companion object {
        val DEFAULT_WORKSPACES = listOf(
            HomeWorkspace(id = "work", name = "Work", icon = "briefcase"),
            HomeWorkspace(id = "side-hustle", name = "Side Hustle", icon = "rocket"),
        )

        fun projectKey(connectionId: ClientConnectionId, projectId: String): String =
            "${connectionId.value}:$projectId"

        fun threadKey(connectionId: ClientConnectionId, threadId: String): String =
            "${connectionId.value}:$threadId"
    }
}

@Serializable
private data class HomeWorkspaceDocument(
    val version: Int = DOCUMENT_VERSION,
    val workspaces: List<HomeWorkspace> = HomeWorkspaceState.DEFAULT_WORKSPACES,
    val activeWorkspaceId: String? = null,
    val projectWorkspaceIds: Map<String, String> = emptyMap(),
    val explicitProjectIds: List<String> = emptyList(),
    val threadWorkspaceIds: Map<String, String> = emptyMap(),
    val importedWorkspaceIds: Map<String, String> = emptyMap(),
) {
    companion object {
        const val DOCUMENT_VERSION = 1
    }
}

interface HomeWorkspaceDocumentStore {
    fun read(): String?
    fun write(document: String)
}

class SharedPreferencesHomeWorkspaceDocumentStore(context: Context) : HomeWorkspaceDocumentStore {
    private val preferences = context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    override fun read(): String? = preferences.getString(DOCUMENT_KEY, null)

    override fun write(document: String) {
        preferences.edit().putString(DOCUMENT_KEY, document).apply()
    }

    companion object {
        const val FILE_NAME = "poracode_workspaces_v1"
        private const val DOCUMENT_KEY = "document"
    }
}

/**
 * Client-owned workspace groupings matching the PWA and iOS workspace model.
 * Host workspace ids are mapped by name to local workspaces while explicit local
 * filings take precedence. Future document versions are preserved untouched.
 */
class HomeWorkspacePreferences(
    private val store: HomeWorkspaceDocumentStore,
) {
    private val mutableState = MutableStateFlow(HomeWorkspaceState())
    val state: StateFlow<HomeWorkspaceState> = mutableState.asStateFlow()
    private var futureDocument: String? = null

    init {
        load()
    }

    fun selectWorkspace(workspaceId: String?) {
        val current = mutableState.value
        val valid = current.workspaces.firstOrNull { it.id == workspaceId }?.id
            ?: current.workspaces.firstOrNull()?.id
        if (valid == current.activeWorkspaceId) return
        val next = current.copy(activeWorkspaceId = valid)
        mutableState.value = next
        if (futureDocument == null) persist(next)
    }

    fun importHosts(hosts: List<HomeWorkspaceHostInput>) {
        if (futureDocument != null) return
        val current = mutableState.value
        val workspaces = current.workspaces.toMutableList()
        val projectAssignments = current.projectWorkspaceIds.toMutableMap()
        val threadAssignments = current.threadWorkspaceIds.toMutableMap()
        val imported = current.importedWorkspaceIds.toMutableMap()
        val fallbackWorkspaceId = current.resolvedActiveId() ?: workspaces.firstOrNull()?.id

        fun validId(id: String?): String? = id?.takeIf { candidate -> workspaces.any { it.id == candidate } }

        fun findOrCreate(name: String, icon: String? = null): String? {
            val trimmed = name.trim()
            if (trimmed.isEmpty()) return null
            val key = trimmed.lowercase(Locale.ROOT)
            workspaces.firstOrNull { it.name.trim().lowercase(Locale.ROOT) == key }?.let { return it.id }
            val newId = UUID.randomUUID().toString().lowercase(Locale.ROOT)
            val resolvedIcon = icon?.takeIf { it.isNotBlank() }
                ?: if (workspaces.size % 2 == 0) "code" else "globe"
            workspaces += HomeWorkspace(id = newId, name = trimmed, icon = resolvedIcon)
            return newId
        }

        for (host in hosts) {
            val localIds = mutableMapOf<String, String>()
            for (workspace in host.workspaces.orEmpty()) {
                val key = "${host.connectionId.value}:${workspace.id}"
                val localId = validId(imported[key]) ?: findOrCreate(workspace.name, workspace.icon)
                if (localId != null) {
                    imported[key] = localId
                    localIds[workspace.id] = localId
                }
            }
            for (project in host.projects) {
                if (project.id == HOME_PROJECT_ID) continue
                val key = HomeWorkspaceState.projectKey(host.connectionId, project.id)
                if (key in current.explicitProjectIds) continue
                val hostWorkspaceId = project.workspaceId?.let(localIds::get)
                if (hostWorkspaceId != null) {
                    projectAssignments[key] = hostWorkspaceId
                } else if (key !in projectAssignments && fallbackWorkspaceId != null) {
                    projectAssignments[key] = fallbackWorkspaceId
                }
            }
            for (threadId in host.homeThreadIds) {
                val key = HomeWorkspaceState.threadKey(host.connectionId, threadId)
                if (key !in threadAssignments && fallbackWorkspaceId != null) {
                    threadAssignments[key] = fallbackWorkspaceId
                }
            }
        }

        val next = current.copy(
            workspaces = workspaces,
            activeWorkspaceId = validId(current.activeWorkspaceId) ?: workspaces.firstOrNull()?.id,
            projectWorkspaceIds = projectAssignments,
            threadWorkspaceIds = threadAssignments,
            importedWorkspaceIds = imported,
        )
        if (next != current) {
            mutableState.value = next
            persist(next)
        }
    }

    fun addWorkspace(name: String, icon: String? = null): String? {
        if (futureDocument != null) return null
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return null
        val current = mutableState.value
        val key = trimmed.lowercase(Locale.ROOT)
        current.workspaces.firstOrNull { it.name.trim().lowercase(Locale.ROOT) == key }?.let { return it.id }
        val newId = UUID.randomUUID().toString().lowercase(Locale.ROOT)
        val resolvedIcon = icon?.takeIf { it.isNotBlank() }
            ?: if (current.workspaces.size % 2 == 0) "code" else "globe"
        val next = current.copy(
            workspaces = current.workspaces + HomeWorkspace(id = newId, name = trimmed, icon = resolvedIcon),
        )
        mutableState.value = next
        persist(next)
        return newId
    }

    fun renameWorkspace(id: String, newName: String) {
        if (futureDocument != null) return
        val trimmed = newName.trim()
        if (trimmed.isEmpty()) return
        val current = mutableState.value
        val key = trimmed.lowercase(Locale.ROOT)
        if (current.workspaces.any { it.id != id && it.name.trim().lowercase(Locale.ROOT) == key }) return
        val index = current.workspaces.indexOfFirst { it.id == id }
        if (index < 0) return
        val updated = current.workspaces.toMutableList()
        updated[index] = updated[index].copy(name = trimmed)
        val next = current.copy(workspaces = updated)
        mutableState.value = next
        persist(next)
    }

    fun setWorkspaceIcon(id: String, icon: String) {
        if (futureDocument != null) return
        val current = mutableState.value
        val index = current.workspaces.indexOfFirst { it.id == id }
        if (index < 0) return
        val updated = current.workspaces.toMutableList()
        updated[index] = updated[index].copy(icon = icon)
        val next = current.copy(workspaces = updated)
        mutableState.value = next
        persist(next)
    }

    fun removeWorkspace(id: String) {
        if (futureDocument != null) return
        val current = mutableState.value
        if (current.workspaces.size <= 1 || current.workspaces.none { it.id == id }) return
        val remaining = current.workspaces.filterNot { it.id == id }
        val replacement = remaining.first().id
        val next = current.copy(
            workspaces = remaining,
            activeWorkspaceId = if (current.activeWorkspaceId == id) replacement else current.activeWorkspaceId,
            projectWorkspaceIds = current.projectWorkspaceIds.mapValues { (_, value) ->
                if (value == id) replacement else value
            },
            threadWorkspaceIds = current.threadWorkspaceIds.mapValues { (_, value) ->
                if (value == id) replacement else value
            },
            importedWorkspaceIds = current.importedWorkspaceIds.mapValues { (_, value) ->
                if (value == id) replacement else value
            },
        )
        mutableState.value = next
        persist(next)
    }

    fun assignProject(projectKey: String, workspaceId: String?) {
        if (futureDocument != null) return
        val current = mutableState.value
        if (workspaceId != null && current.workspaces.none { it.id == workspaceId }) return
        val nextAssignments = current.projectWorkspaceIds.toMutableMap()
        if (workspaceId == null) nextAssignments.remove(projectKey) else nextAssignments[projectKey] = workspaceId
        val next = current.copy(
            projectWorkspaceIds = nextAssignments,
            explicitProjectIds = current.explicitProjectIds + projectKey,
        )
        mutableState.value = next
        persist(next)
    }

    fun assignThread(threadKey: String, workspaceId: String?) {
        if (futureDocument != null) return
        val current = mutableState.value
        if (workspaceId != null && current.workspaces.none { it.id == workspaceId }) return
        val nextAssignments = current.threadWorkspaceIds.toMutableMap()
        if (workspaceId == null) nextAssignments.remove(threadKey) else nextAssignments[threadKey] = workspaceId
        val next = current.copy(threadWorkspaceIds = nextAssignments)
        mutableState.value = next
        persist(next)
    }

    private fun load() {
        val raw = store.read()?.takeIf(String::isNotBlank) ?: return
        val version = runCatching {
            RemoteJson.parseToJsonElement(raw).jsonObject["version"]?.jsonPrimitive?.intOrNull
        }.getOrNull()
        if (version != null && version > HomeWorkspaceDocument.DOCUMENT_VERSION) {
            futureDocument = raw
            mutableState.value = mutableState.value.copy(canEdit = false)
            return
        }
        val document = runCatching {
            RemoteJson.decodeFromString(HomeWorkspaceDocument.serializer(), raw)
        }.getOrNull() ?: return
        if (document.version != HomeWorkspaceDocument.DOCUMENT_VERSION) return
        val seen = mutableSetOf<String>()
        val validWorkspaces = document.workspaces.filter {
            it.id.isNotBlank() && it.name.isNotBlank() && seen.add(it.id)
        }.ifEmpty { HomeWorkspaceState.DEFAULT_WORKSPACES }
        val activeId = validWorkspaces.firstOrNull { it.id == document.activeWorkspaceId }?.id
            ?: validWorkspaces.first().id
        mutableState.value = HomeWorkspaceState(
            workspaces = validWorkspaces,
            activeWorkspaceId = activeId,
            projectWorkspaceIds = document.projectWorkspaceIds,
            explicitProjectIds = document.explicitProjectIds.toSet(),
            threadWorkspaceIds = document.threadWorkspaceIds,
            importedWorkspaceIds = document.importedWorkspaceIds,
            canEdit = true,
        )
    }

    private fun persist(state: HomeWorkspaceState) {
        val document = HomeWorkspaceDocument(
            version = HomeWorkspaceDocument.DOCUMENT_VERSION,
            workspaces = state.workspaces,
            activeWorkspaceId = state.activeWorkspaceId,
            projectWorkspaceIds = state.projectWorkspaceIds,
            explicitProjectIds = state.explicitProjectIds.sorted(),
            threadWorkspaceIds = state.threadWorkspaceIds,
            importedWorkspaceIds = state.importedWorkspaceIds,
        )
        store.write(RemoteJson.encodeToString(document))
    }

    companion object {
        val AVAILABLE_ICONS = listOf(
            "briefcase",
            "rocket",
            "code",
            "palette",
            "building",
            "graduation",
            "heart",
            "sprout",
            "globe",
            "lightbulb",
            "music",
            "gamepad",
        )
    }
}
