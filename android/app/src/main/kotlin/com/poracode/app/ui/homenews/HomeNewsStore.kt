package com.poracode.app.ui.homenews

import android.content.Context
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext

data class HomeNewsState(
    val activeItem: HomeNewsItem? = null,
    val dismissedIds: Set<String> = emptySet(),
    val loadedFromRemote: Boolean = false,
)

/**
 * Bounded cached public feed store for Poracode's `news.json` with persistent dismissed IDs
 * (mirroring iOS `HomeNewsFeedStore.swift` & `HomeNewsMemory.swift`).
 */
class HomeNewsStore(
    private val cacheFile: File? = null,
    private val dismissedPrefs: android.content.SharedPreferences? = null,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val fetcher: suspend () -> String = { fetchPublicFeed() },
) {
    private val mutableState = MutableStateFlow(
        HomeNewsState(
            dismissedIds = dismissedPrefs?.getStringSet(KEY_DISMISSED, emptySet()).orEmpty(),
        ),
    )
    val state: StateFlow<HomeNewsState> = mutableState.asStateFlow()

    init {
        loadCache()
    }

    fun dismiss(id: String) {
        val nextDismissed = mutableState.value.dismissedIds + id
        dismissedPrefs?.edit()?.putStringSet(KEY_DISMISSED, nextDismissed)?.apply()
        mutableState.update { current ->
            current.copy(
                dismissedIds = nextDismissed,
                activeItem = current.activeItem?.takeUnless { it.id == id },
            )
        }
    }

    suspend fun refresh(localeTag: String = Locale.getDefault().toLanguageTag()) {
        val raw = runCatching { withContext(ioDispatcher) { fetcher() } }.getOrNull() ?: return
        val doc = runCatching { HomeNewsParser.parse(raw, localeTag) }.getOrNull() ?: return
        withContext(ioDispatcher) {
            runCatching { cacheFile?.writeText(raw) }
        }
        applyDocument(doc, fromRemote = true)
    }

    private fun loadCache() {
        val raw = runCatching { cacheFile?.takeIf { it.isFile }?.readText() }.getOrNull() ?: return
        val doc = runCatching {
            HomeNewsParser.parse(raw, Locale.getDefault().toLanguageTag())
        }.getOrNull() ?: return
        applyDocument(doc, fromRemote = false)
    }

    private fun applyDocument(doc: HomeNewsFeedDocument, fromRemote: Boolean) {
        val dismissed = mutableState.value.dismissedIds
        val candidate = if (doc.paused) {
            null
        } else {
            doc.items
                .filterNot { it.id in dismissed }
                .maxByOrNull { it.weight }
        }
        mutableState.update {
            it.copy(activeItem = candidate, loadedFromRemote = fromRemote || it.loadedFromRemote)
        }
    }

    companion object {
        const val PUBLIC_FEED_URL = "https://poracode.com/news.json"
        const val CACHE_FILE_NAME = "poracode_home_news_v1.json"
        private const val PREFS_NAME = "poracode_home_news_prefs"
        private const val KEY_DISMISSED = "dismissed_ids"

        fun create(context: Context): HomeNewsStore = HomeNewsStore(
            cacheFile = File(context.cacheDir, CACHE_FILE_NAME),
            dismissedPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE),
        )

        private fun fetchPublicFeed(): String {
            val conn = (URL(PUBLIC_FEED_URL).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 8_000
                readTimeout = 8_000
                instanceFollowRedirects = false
            }
            try {
                if (conn.responseCode != 200) error("HTTP ${conn.responseCode}")
                val bytes = conn.inputStream.use { input ->
                    val out = java.io.ByteArrayOutputStream()
                    val buf = ByteArray(4096)
                    var total = 0
                    while (true) {
                        val n = input.read(buf)
                        if (n <= 0) break
                        total += n
                        if (total > HomeNewsParser.MAX_FEED_BYTES) error("Oversized news feed")
                        out.write(buf, 0, n)
                    }
                    out.toByteArray()
                }
                return bytes.toString(Charsets.UTF_8)
            } finally {
                conn.disconnect()
            }
        }
    }
}
