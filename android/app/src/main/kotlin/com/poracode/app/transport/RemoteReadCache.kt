package com.poracode.app.transport

import okhttp3.Response
import okio.utf8Size

/** Per-client, memory-only bodies for conditional GETs. Every reuse requires a
 * server 304; neither errors nor an offline connection serve stale content. */
internal class RemoteReadCache(
    private val maxBytes: Long = 8L * 1024 * 1024,
    private val maxEntries: Int = 32,
) {
    data class Entry(val etag: String, val body: String, val bytes: Long)
    data class Read(val generation: Long, val url: String, val entry: Entry?)

    private val entries = LinkedHashMap<String, Entry>(16, 0.75f, true)
    private var bytes = 0L
    private var generation = 0L

    @Synchronized
    fun capture(url: String): Read = Read(generation, url, entries[url])

    @Synchronized
    fun body(read: Read): String? = read.entry?.body?.takeIf { read.generation == generation }

    @Synchronized
    fun clear() {
        generation += 1
        entries.clear()
        bytes = 0
    }

    @Synchronized
    fun store(read: Read, response: Response, body: String) {
        if (read.generation != generation) return
        entries.remove(read.url)?.let { bytes -= it.bytes }
        val etag = response.header("ETag")?.trim()?.takeIf { it.isNotEmpty() } ?: return
        // OkHttp request headers require printable ASCII. Ignore oversized or
        // unsupported validators instead of making the next GET fail locally.
        if (etag.length > 1024 || etag.any { it < ' ' || it > '~' }) return
        if (response.code != 200 ||
            response.header("Content-Type")?.substringBefore(';')?.trim()?.lowercase() != "application/json" ||
            response.headers.values("Cache-Control").flatMap { it.split(',') }
                .any { it.substringBefore('=').trim().equals("no-store", ignoreCase = true) } ||
            // Cached API GETs never send Origin or caller-supplied headers.
            response.headers.values("Vary").flatMap { it.split(',') }
                .any { it.trim().lowercase() !in setOf("accept-encoding", "authorization", "origin") }
        ) return
        if (body.length > maxBytes) return
        val size = body.utf8Size()
        if (size > maxBytes || maxEntries <= 0) return
        while (entries.isNotEmpty() && (bytes + size > maxBytes || entries.size >= maxEntries)) {
            val oldest = entries.entries.iterator()
            bytes -= oldest.next().value.bytes
            oldest.remove()
        }
        entries[read.url] = Entry(etag, body, size)
        bytes += size
    }
}
