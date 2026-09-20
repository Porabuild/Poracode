package com.poracode.app.storage

import android.content.Context
import com.poracode.app.model.RemoteJson
import java.util.Locale
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString

enum class DeviceAppearanceMode { System, Light, Dark }
enum class HomeShortcut { PullRequests, GithubActions, Schedules }
enum class ContentLanguage(val languageTag: String?) {
    MatchApp(null),
    English("en"),
    Spanish("es"),
    Russian("ru"),
    Ukrainian("uk"),
    SimplifiedChinese("zh-CN"),
    Japanese("ja"),
    BrazilianPortuguese("pt-BR"),
    German("de"),
    French("fr"),
    Korean("ko"),
    Polish("pl"),
    Vietnamese("vi"),
    Turkish("tr"),
    ;

    fun displayName(locale: Locale): String = languageTag?.let {
        Locale.forLanguageTag(it).getDisplayName(locale)
    }.orEmpty()

    fun modelLanguageName(deviceLocale: Locale = Locale.getDefault()): String? {
        val resolved = if (this == MatchApp) fromLocale(deviceLocale) else this
        return resolved.takeUnless { it == English }?.englishName
    }

    private val englishName: String get() = when (this) {
        MatchApp, English -> "English"
        Spanish -> "Spanish"
        Russian -> "Russian"
        Ukrainian -> "Ukrainian"
        SimplifiedChinese -> "Simplified Chinese"
        Japanese -> "Japanese"
        BrazilianPortuguese -> "Brazilian Portuguese"
        German -> "German"
        French -> "French"
        Korean -> "Korean"
        Polish -> "Polish"
        Vietnamese -> "Vietnamese"
        Turkish -> "Turkish"
    }

    companion object {
        fun fromLocale(locale: Locale): ContentLanguage {
            val exact = entries.firstOrNull {
                it.languageTag?.equals(locale.toLanguageTag(), ignoreCase = true) == true
            }
            if (exact != null) return exact
            val matches = entries.filter { it.languageTag?.substringBefore('-') == locale.language }
            return matches.singleOrNull() ?: English
        }
    }
}

data class DeviceSettingsState(
    val appearanceMode: DeviceAppearanceMode = DeviceAppearanceMode.System,
    val dynamicColor: Boolean = true,
    val chatTextSizeSp: Int = DEFAULT_CHAT_TEXT_SIZE_SP,
    val agentTerminalTextSizeSp: Int = DEFAULT_TERMINAL_TEXT_SIZE_SP,
    val projectTerminalTextSizeSp: Int = DEFAULT_TERMINAL_TEXT_SIZE_SP,
    val homeShortcutOrder: List<HomeShortcut> = HomeShortcut.entries,
    val hiddenHomeShortcuts: Set<HomeShortcut> = setOf(HomeShortcut.GithubActions),
    val contentLanguage: ContentLanguage = ContentLanguage.MatchApp,
    val notificationsEnabled: Boolean = true,
    val notificationSoundEnabled: Boolean = true,
    val foregroundNotificationsEnabled: Boolean = true,
    val notifyDone: Boolean = true,
    val notifyNeedsAttention: Boolean = true,
    val notifyError: Boolean = true,
) {
    companion object {
        const val DEFAULT_TERMINAL_TEXT_SIZE_SP = 13
        const val DEFAULT_CHAT_TEXT_SIZE_SP = 14
        const val MIN_TERMINAL_TEXT_SIZE_SP = 8
        const val MAX_TERMINAL_TEXT_SIZE_SP = 20
    }
}

@Serializable
private data class DeviceSettingsDocument(
    val version: Int,
    val appearanceMode: String = DeviceAppearanceMode.System.name,
    val dynamicColor: Boolean = true,
    val chatTextSizeSp: Int = DeviceSettingsState.DEFAULT_CHAT_TEXT_SIZE_SP,
    val agentTerminalTextSizeSp: Int = DeviceSettingsState.DEFAULT_TERMINAL_TEXT_SIZE_SP,
    val projectTerminalTextSizeSp: Int = DeviceSettingsState.DEFAULT_TERMINAL_TEXT_SIZE_SP,
    val homeShortcutOrder: List<String> = HomeShortcut.entries.map(HomeShortcut::name),
    val hiddenHomeShortcuts: List<String> = listOf(HomeShortcut.GithubActions.name),
    val contentLanguage: String = ContentLanguage.MatchApp.name,
    val notificationsEnabled: Boolean = true,
    val notificationSoundEnabled: Boolean = true,
    val foregroundNotificationsEnabled: Boolean = true,
    val notifyDone: Boolean = true,
    val notifyNeedsAttention: Boolean = true,
    val notifyError: Boolean = true,
)

interface DeviceSettingsDocumentStore {
    fun read(): String?
    fun write(document: String)
}

class SharedPreferencesDeviceSettingsDocumentStore(context: Context) : DeviceSettingsDocumentStore {
    private val preferences = context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    override fun read(): String? = preferences.getString(DOCUMENT_KEY, null)

    override fun write(document: String) {
        preferences.edit().putString(DOCUMENT_KEY, document).apply()
    }

    companion object {
        const val FILE_NAME = "poracode_device_settings"
        private const val DOCUMENT_KEY = "document"
    }
}

/** Versioned device-local appearance and terminal preferences. */
class DeviceSettingsPreferences(
    private val store: DeviceSettingsDocumentStore,
) {
    private val mutableState = MutableStateFlow(DeviceSettingsState())
    val state: StateFlow<DeviceSettingsState> = mutableState.asStateFlow()
    private var preservesFutureDocument = false

    init {
        load()
    }

    fun setAppearanceMode(mode: DeviceAppearanceMode) = update {
        it.copy(appearanceMode = mode)
    }

    fun setDynamicColor(enabled: Boolean) = update { it.copy(dynamicColor = enabled) }

    fun setChatTextSizeSp(size: Int) = update { it.copy(chatTextSizeSp = size.clampTerminalSize()) }

    fun setAgentTerminalTextSizeSp(size: Int) = update {
        it.copy(agentTerminalTextSizeSp = size.clampTerminalSize())
    }

    fun setProjectTerminalTextSizeSp(size: Int) = update {
        it.copy(projectTerminalTextSizeSp = size.clampTerminalSize())
    }

    fun setHomeShortcutVisible(shortcut: HomeShortcut, visible: Boolean) = update { state ->
        state.copy(
            hiddenHomeShortcuts = if (visible) {
                state.hiddenHomeShortcuts - shortcut
            } else {
                state.hiddenHomeShortcuts + shortcut
            },
        )
    }

    fun moveHomeShortcut(shortcut: HomeShortcut, offset: Int) = update { state ->
        val currentIndex = state.homeShortcutOrder.indexOf(shortcut)
        val nextIndex = (currentIndex + offset).coerceIn(state.homeShortcutOrder.indices)
        if (currentIndex < 0 || currentIndex == nextIndex) state else {
            val next = state.homeShortcutOrder.toMutableList()
            next.removeAt(currentIndex)
            next.add(nextIndex, shortcut)
            state.copy(homeShortcutOrder = next)
        }
    }

    fun setContentLanguage(language: ContentLanguage) = update {
        it.copy(contentLanguage = language)
    }

    fun setNotificationsEnabled(enabled: Boolean) = update {
        it.copy(notificationsEnabled = enabled)
    }

    fun setNotificationSoundEnabled(enabled: Boolean) = update {
        it.copy(notificationSoundEnabled = enabled)
    }

    fun setForegroundNotificationsEnabled(enabled: Boolean) = update {
        it.copy(foregroundNotificationsEnabled = enabled)
    }

    fun setNotifyDone(enabled: Boolean) = update { it.copy(notifyDone = enabled) }
    fun setNotifyNeedsAttention(enabled: Boolean) = update {
        it.copy(notifyNeedsAttention = enabled)
    }
    fun setNotifyError(enabled: Boolean) = update { it.copy(notifyError = enabled) }

    private fun update(transform: (DeviceSettingsState) -> DeviceSettingsState) {
        if (preservesFutureDocument) return
        val next = transform(mutableState.value)
        if (next == mutableState.value) return
        mutableState.value = next
        persist(next)
    }

    private fun load() {
        val raw = store.read()?.takeIf(String::isNotBlank) ?: return
        val document = runCatching {
            RemoteJson.decodeFromString(DeviceSettingsDocument.serializer(), raw)
        }.getOrNull() ?: return
        when {
            document.version in 1..DOCUMENT_VERSION -> mutableState.value = DeviceSettingsState(
                appearanceMode = DeviceAppearanceMode.entries.firstOrNull {
                    it.name == document.appearanceMode
                } ?: DeviceAppearanceMode.System,
                dynamicColor = document.dynamicColor,
                chatTextSizeSp = document.chatTextSizeSp.clampTerminalSize(),
                agentTerminalTextSizeSp = document.agentTerminalTextSizeSp.clampTerminalSize(),
                projectTerminalTextSizeSp = document.projectTerminalTextSizeSp.clampTerminalSize(),
                homeShortcutOrder = document.homeShortcutOrder.normalizedHomeShortcutOrder(),
                hiddenHomeShortcuts = document.hiddenHomeShortcuts.mapNotNullTo(mutableSetOf()) {
                    name -> HomeShortcut.entries.firstOrNull { it.name == name }
                },
                contentLanguage = ContentLanguage.entries.firstOrNull {
                    it.name == document.contentLanguage
                } ?: ContentLanguage.MatchApp,
                notificationsEnabled = document.notificationsEnabled,
                notificationSoundEnabled = document.notificationSoundEnabled,
                foregroundNotificationsEnabled = document.foregroundNotificationsEnabled,
                notifyDone = document.notifyDone,
                notifyNeedsAttention = document.notifyNeedsAttention,
                notifyError = document.notifyError,
            )
            document.version > DOCUMENT_VERSION -> preservesFutureDocument = true
            else -> Unit
        }
    }

    private fun persist(state: DeviceSettingsState) {
        val document = DeviceSettingsDocument(
            version = DOCUMENT_VERSION,
            appearanceMode = state.appearanceMode.name,
            dynamicColor = state.dynamicColor,
            chatTextSizeSp = state.chatTextSizeSp,
            agentTerminalTextSizeSp = state.agentTerminalTextSizeSp,
            projectTerminalTextSizeSp = state.projectTerminalTextSizeSp,
            homeShortcutOrder = state.homeShortcutOrder.map(HomeShortcut::name),
            hiddenHomeShortcuts = state.hiddenHomeShortcuts.map(HomeShortcut::name).sorted(),
            contentLanguage = state.contentLanguage.name,
            notificationsEnabled = state.notificationsEnabled,
            notificationSoundEnabled = state.notificationSoundEnabled,
            foregroundNotificationsEnabled = state.foregroundNotificationsEnabled,
            notifyDone = state.notifyDone,
            notifyNeedsAttention = state.notifyNeedsAttention,
            notifyError = state.notifyError,
        )
        store.write(RemoteJson.encodeToString(document))
    }

    private fun Int.clampTerminalSize(): Int = coerceIn(
        DeviceSettingsState.MIN_TERMINAL_TEXT_SIZE_SP,
        DeviceSettingsState.MAX_TERMINAL_TEXT_SIZE_SP,
    )

    companion object {
        const val DOCUMENT_VERSION = 2
    }
}

private fun List<String>.normalizedHomeShortcutOrder(): List<HomeShortcut> {
    val configured = mapNotNull { name -> HomeShortcut.entries.firstOrNull { it.name == name } }
        .distinct()
    return configured + HomeShortcut.entries.filterNot(configured::contains)
}
