package com.poracode.app.storage

import android.content.Context
import com.poracode.app.model.ClientConnectionId
import com.poracode.app.model.RemoteJson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString

@Serializable
private data class ProjectSyncPreferencesDocument(
    val version: Int,
    val excludedProjectIds: Map<String, List<String>> = emptyMap(),
)

interface ProjectSyncDocumentStore {
    fun read(): String?
    fun write(document: String)
}

class SharedPreferencesProjectSyncDocumentStore(context: Context) : ProjectSyncDocumentStore {
    private val preferences = context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    override fun read(): String? = preferences.getString(DOCUMENT_KEY, null)

    override fun write(document: String) {
        preferences.edit().putString(DOCUMENT_KEY, document).apply()
    }

    companion object {
        const val FILE_NAME = "poracode_project_sync"
        private const val DOCUMENT_KEY = "document"
    }
}

/**
 * Device-local project mirroring choices. Exclusions are scoped to the stable
 * client connection id and never mutate the paired desktop's project catalog.
 *
 * The versioned document mirrors the iOS/PWA compatibility boundary. A document
 * written by a newer app is left untouched so this client cannot resurrect an
 * intentionally excluded project by overwriting state it does not understand.
 */
class ProjectSyncPreferences(
    private val store: ProjectSyncDocumentStore,
) {
    private val mutableExcluded = MutableStateFlow<Map<String, Set<String>>>(emptyMap())
    val excludedProjectIds: StateFlow<Map<String, Set<String>>> = mutableExcluded.asStateFlow()
    private var preservesFutureDocument = false

    init {
        load()
    }

    fun isSynced(connectionId: ClientConnectionId, projectId: String): Boolean =
        projectId !in mutableExcluded.value[connectionId.value].orEmpty()

    fun setSynced(connectionId: ClientConnectionId, projectId: String, synced: Boolean) {
        if (preservesFutureDocument) return
        val current = mutableExcluded.value
        val excluded = current[connectionId.value].orEmpty()
        val nextExcluded = if (synced) excluded - projectId else excluded + projectId
        if (nextExcluded == excluded) return
        mutableExcluded.value = if (nextExcluded.isEmpty()) {
            current - connectionId.value
        } else {
            current + (connectionId.value to nextExcluded)
        }
        persist()
    }

    private fun load() {
        val raw = store.read()?.takeIf(String::isNotBlank) ?: return
        val document = runCatching {
            RemoteJson.decodeFromString(ProjectSyncPreferencesDocument.serializer(), raw)
        }.getOrNull() ?: return
        when {
            document.version == DOCUMENT_VERSION -> {
                mutableExcluded.value = document.excludedProjectIds.mapValues { it.value.toSet() }
            }
            document.version > DOCUMENT_VERSION -> preservesFutureDocument = true
            // Version 1 is the first released shape. Unknown older drafts are disposable.
            else -> Unit
        }
    }

    private fun persist() {
        val document = ProjectSyncPreferencesDocument(
            version = DOCUMENT_VERSION,
            excludedProjectIds = mutableExcluded.value.toSortedMap()
                .mapValues { it.value.sorted() },
        )
        store.write(RemoteJson.encodeToString(document))
    }

    companion object {
        const val DOCUMENT_VERSION = 1
    }
}
