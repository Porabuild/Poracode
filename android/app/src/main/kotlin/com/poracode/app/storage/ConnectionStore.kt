package com.poracode.app.storage

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.poracode.app.model.ConnectionProfile
import com.poracode.app.model.ConnectionStoreDocument
import com.poracode.app.model.RemoteJson
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString

/**
 * Single DataStore filename for connection metadata. The schema version lives
 * inside the document (`ConnectionStoreDocument.version`), not the file name —
 * see versioning checklist. Bump [ConnectionProfile.STORE_VERSION] and migrate
 * or invalidate when the persisted shape becomes incompatible.
 */
private val Context.connectionDataStore: DataStore<Preferences> by preferencesDataStore(
    name = ConnectionMetadataStore.DATA_STORE_NAME,
)

/**
 * Persists non-secret connection metadata in versioned DataStore.
 * Incompatible store versions are invalidated (no silent partial read).
 */
interface ConnectionMetadataStore {
    fun profileFlow(): Flow<ConnectionProfile?>
    suspend fun load(): ConnectionProfile?
    suspend fun save(profile: ConnectionProfile)
    /**
     * Delete persisted profile material. Returns true when no material remains
     * (absence is success). A throw or leftover material is failure.
     */
    suspend fun clear(): Boolean

    /** Test/inspection: whether injected store currently holds material. */
    fun hasMaterialForTests(): Boolean = false

    companion object {
        /** Fixed filename — do not bake version into the path. */
        const val DATA_STORE_NAME = "poracode_connection"
    }
}

class DataStoreConnectionStore(
    private val context: Context,
) : ConnectionMetadataStore {
    private val key = stringPreferencesKey("document")

    override fun profileFlow(): Flow<ConnectionProfile?> =
        context.connectionDataStore.data.map { prefs ->
            decode(prefs[key])
        }

    override suspend fun load(): ConnectionProfile? =
        decode(context.connectionDataStore.data.first()[key])

    override suspend fun save(profile: ConnectionProfile) {
        val document = ConnectionStoreDocument(
            version = ConnectionProfile.STORE_VERSION,
            profile = profile,
        )
        val encoded = RemoteJson.encodeToString(document)
        context.connectionDataStore.edit { prefs ->
            prefs[key] = encoded
        }
    }

    override suspend fun clear(): Boolean {
        context.connectionDataStore.edit { it.clear() }
        return load() == null
    }

    private fun decode(raw: String?): ConnectionProfile? {
        if (raw.isNullOrBlank()) return null
        return runCatching {
            val document = RemoteJson.decodeFromString(ConnectionStoreDocument.serializer(), raw)
            when {
                document.version == ConnectionProfile.STORE_VERSION -> document.profile
                // Unreleased: no ordered migration yet. Explicitly invalidate unknown versions.
                else -> null
            }
        }.getOrNull()
    }
}
