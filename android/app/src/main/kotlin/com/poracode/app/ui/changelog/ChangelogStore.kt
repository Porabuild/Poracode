package com.poracode.app.ui.changelog

import com.poracode.app.model.RemoteJson
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request

data class ChangelogUiState(
    val document: ChangelogDocument? = null,
    val loading: Boolean = false,
    val error: ChangelogFailure? = null,
)

@Serializable
private data class ChangelogCacheEnvelope(
    val version: Int = CACHE_VERSION,
    val document: ChangelogDocument,
) {
    companion object {
        const val CACHE_VERSION = 1
    }
}

class ChangelogStore(
    private val cacheFile: File,
    private val feedUrl: String = PUBLIC_CHANGELOG_URL,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val fetcher: suspend (String) -> String = ::defaultFetch,
) {
    private val mutableState = MutableStateFlow(ChangelogUiState())
    val state: StateFlow<ChangelogUiState> = mutableState.asStateFlow()
    private var futureCacheDetected = false

    init {
        loadCache()
    }

    suspend fun refresh() {
        mutableState.value = mutableState.value.copy(loading = true, error = null)
        val result = withContext(ioDispatcher) {
            runCatching {
                val raw = fetcher(feedUrl)
                ChangelogDocument.parse(raw)
            }
        }
        result.fold(
            onSuccess = { doc ->
                mutableState.value = ChangelogUiState(document = doc, loading = false, error = null)
                if (!futureCacheDetected) {
                    withContext(ioDispatcher) { writeCache(doc) }
                }
            },
            onFailure = { err ->
                val failure = (err as? ChangelogException)?.failure ?: ChangelogFailure.NetworkError
                mutableState.value = mutableState.value.copy(loading = false, error = failure)
            },
        )
    }

    private fun loadCache() {
        if (!cacheFile.isFile) return
        val raw = runCatching { cacheFile.readText(Charsets.UTF_8) }.getOrNull() ?: return
        val version = runCatching {
            RemoteJson.parseToJsonElement(raw).jsonObject["version"]?.jsonPrimitive?.intOrNull
        }.getOrNull()
        if (version != null && version > ChangelogCacheEnvelope.CACHE_VERSION) {
            futureCacheDetected = true
            return
        }
        val envelope = runCatching {
            RemoteJson.decodeFromString(ChangelogCacheEnvelope.serializer(), raw)
        }.getOrNull() ?: return
        if (envelope.version == ChangelogCacheEnvelope.CACHE_VERSION) {
            mutableState.value = ChangelogUiState(document = envelope.document)
        }
    }

    private fun writeCache(document: ChangelogDocument) {
        runCatching {
            cacheFile.parentFile?.mkdirs()
            val envelope = ChangelogCacheEnvelope(document = document)
            val tmp = File(cacheFile.parentFile, "${cacheFile.name}.tmp")
            tmp.writeText(RemoteJson.encodeToString(envelope), Charsets.UTF_8)
            tmp.renameTo(cacheFile)
        }
    }

    companion object {
        const val PUBLIC_CHANGELOG_URL = "https://poracode.com/changelog.json"
        const val CACHE_FILE_NAME = "changelog-v1.json"

        private val publicHttpClient: OkHttpClient by lazy {
            OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(15, TimeUnit.SECONDS)
                .callTimeout(20, TimeUnit.SECONDS)
                .build()
        }

        private fun defaultFetch(url: String): String {
            val request = Request.Builder()
                .url(url)
                .header("Accept", "application/json")
                .build()
            publicHttpClient.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    throw ChangelogException(ChangelogFailure.NetworkError)
                }
                val stream = response.body.byteStream()
                val out = ByteArrayOutputStream()
                val buf = ByteArray(8192)
                var total = 0
                while (true) {
                    val read = stream.read(buf)
                    if (read <= 0) break
                    total += read
                    if (total > ChangelogDocument.MAXIMUM_BYTES) {
                        throw ChangelogException(ChangelogFailure.InvalidDocument)
                    }
                    out.write(buf, 0, read)
                }
                return out.toString(Charsets.UTF_8.name())
            }
        }
    }
}
