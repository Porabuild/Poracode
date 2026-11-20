package com.poracode.app.transport

import okhttp3.Response

/** Per-client, memory-only conditional GET cache for binary image responses. */
internal class RemoteBinaryReadCache(
    private val maxBytes: Long = 16L * 1024 * 1024,
    private val maxEntries: Int = 32,
) {
    data class Entry(val etag: String, val value: RemoteBinaryResponse, val bytes: Long)
    data class Read(val generation: Long, val url: String, val entry: Entry?)

    private val entries = LinkedHashMap<String, Entry>(16, 0.75f, true)
    private var bytes = 0L
    private var generation = 0L

    @Synchronized
    fun capture(url: String): Read = Read(generation, url, entries[url])

    @Synchronized
    fun value(read: Read): RemoteBinaryResponse? =
        read.entry?.value?.takeIf { read.generation == generation }

    @Synchronized
    fun clear() {
        generation += 1
        entries.clear()
        bytes = 0L
    }

    @Synchronized
    fun store(read: Read, response: Response, value: RemoteBinaryResponse) {
        if (read.generation != generation) return
        entries.remove(read.url)?.let { bytes -= it.bytes }
        val etag = response.header("ETag")?.trim()?.takeIf { it.isNotEmpty() } ?: return
        if (etag.length > 1024 || etag.any { it < ' ' || it > '~' }) return
        if (response.code != 200 ||
            response.headers.values("Cache-Control").flatMap { it.split(',') }
                .any { it.substringBefore('=').trim().equals("no-store", ignoreCase = true) }
        ) return
        val size = value.bytes.size.toLong()
        if (size <= 0L || size > maxBytes || maxEntries <= 0) return
        while (entries.isNotEmpty() && (bytes + size > maxBytes || entries.size >= maxEntries)) {
            val oldest = entries.entries.iterator()
            bytes -= oldest.next().value.bytes
            oldest.remove()
        }
        entries[read.url] = Entry(etag, value, size)
        bytes += size
    }
}
