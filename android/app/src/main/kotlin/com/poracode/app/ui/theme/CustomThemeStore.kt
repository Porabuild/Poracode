package com.poracode.app.ui.theme

import android.content.Context
import com.poracode.app.model.RemoteJson
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

data class CustomThemeStoreState(
    val themes: List<NativeCustomTheme> = emptyList(),
    val canEdit: Boolean = true,
    val storageFailure: CustomThemeFailure? = null,
) {
    fun presetById(id: String?): PoracodeThemePreset? =
        themes.firstOrNull { it.id == id }?.toThemePreset()
}

@Serializable
private data class CustomThemeStoreEnvelope(
    val version: Int = VERSION,
    val themes: List<NativeCustomTheme> = emptyList(),
) {
    companion object {
        const val VERSION = 1
    }
}

interface CustomThemeDocumentStore {
    fun read(): String?
    fun write(document: String)
}

class SharedPreferencesCustomThemeDocumentStore(context: Context) : CustomThemeDocumentStore {
    private val preferences = context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    override fun read(): String? = preferences.getString(DOCUMENT_KEY, null)

    override fun write(document: String) {
        preferences.edit().putString(DOCUMENT_KEY, document).apply()
    }

    companion object {
        const val FILE_NAME = "poracode_custom_themes_v1"
        private const val DOCUMENT_KEY = "document"
    }
}

/**
 * Device-local custom theme repository matching iOS `CustomThemeStore`.
 * Preserves unknown future versions untouched and enforces the shared v1 schema
 * and maximum theme count.
 */
class CustomThemeStore(
    private val store: CustomThemeDocumentStore,
) {
    private val mutableState = MutableStateFlow(CustomThemeStoreState())
    val state: StateFlow<CustomThemeStoreState> = mutableState.asStateFlow()
    private var futureDocument: String? = null

    init {
        load()
    }

    fun save(theme: NativeCustomTheme): Result<NativeCustomTheme> {
        if (futureDocument != null) {
            return Result.failure(CustomThemeException(CustomThemeFailure.UnsupportedVersion))
        }
        return runCatching {
            if (!NativeCustomTheme.isValidId(theme.id)) {
                throw CustomThemeException(CustomThemeFailure.InvalidDocument)
            }
            theme.document.validate()
            val normalized = theme.copy(
                document = theme.document.copy(
                    version = CustomThemeDocument.VERSION,
                    label = theme.document.label.trim(),
                ),
            )
            val current = mutableState.value.themes
            val existingIndex = current.indexOfFirst { it.id == normalized.id }
            if (existingIndex < 0 && current.size >= MAX_CUSTOM_THEMES) {
                throw CustomThemeException(CustomThemeFailure.LimitReached)
            }
            val nextThemes = if (existingIndex >= 0) {
                current.toMutableList().apply { set(existingIndex, normalized) }
            } else {
                current + normalized
            }
            persist(nextThemes)
            mutableState.value = CustomThemeStoreState(themes = nextThemes, canEdit = true)
            normalized
        }
    }

    fun importJson(raw: String): Result<NativeCustomTheme> = runCatching {
        val document = CustomThemeDocument.parse(raw)
        save(NativeCustomTheme(document = document)).getOrThrow()
    }

    fun delete(id: String): Boolean {
        if (futureDocument != null) return false
        val current = mutableState.value.themes
        val next = current.filterNot { it.id == id }
        if (next.size == current.size) return false
        persist(next)
        mutableState.value = CustomThemeStoreState(themes = next, canEdit = true)
        return true
    }

    private fun load() {
        val raw = store.read()?.takeIf(String::isNotBlank) ?: return
        val version = runCatching {
            RemoteJson.parseToJsonElement(raw).jsonObject["version"]?.jsonPrimitive?.intOrNull
        }.getOrNull()
        if (version != null && version > CustomThemeStoreEnvelope.VERSION) {
            futureDocument = raw
            mutableState.value = CustomThemeStoreState(
                themes = emptyList(),
                canEdit = false,
                storageFailure = CustomThemeFailure.UnsupportedVersion,
            )
            return
        }
        val envelope = runCatching {
            RemoteJson.decodeFromString(CustomThemeStoreEnvelope.serializer(), raw)
        }.getOrNull()
        if (envelope == null || envelope.version != CustomThemeStoreEnvelope.VERSION) {
            mutableState.value = CustomThemeStoreState(
                themes = emptyList(),
                canEdit = true,
                storageFailure = CustomThemeFailure.UnavailableStorage,
            )
            return
        }
        val seen = mutableSetOf<String>()
        val valid = envelope.themes.filter { theme ->
            NativeCustomTheme.isValidId(theme.id) &&
                seen.add(theme.id) &&
                theme.document.isValid()
        }.take(MAX_CUSTOM_THEMES)
        mutableState.value = CustomThemeStoreState(themes = valid, canEdit = true)
    }

    private fun persist(themes: List<NativeCustomTheme>) {
        val envelope = CustomThemeStoreEnvelope(
            version = CustomThemeStoreEnvelope.VERSION,
            themes = themes,
        )
        store.write(RemoteJson.encodeToString(envelope))
    }

    companion object {
        const val MAX_CUSTOM_THEMES = 24
    }
}
