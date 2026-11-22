package com.poracode.app.session.history

import com.poracode.app.storage.ProductionAtomicFileWriter
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.yield
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive

/**
 * Bounded, versioned private recent-history tail cache matching iOS
 * `NativeRecentHistoryCache` (`PoracodeRecentHistory-v1`, 2 MiB max per tail,
 * 16 MiB total, 20 entries LRU).
 *
 * Unknown future format versions on disk are retained untouched and never
 * overwritten. Publishing an accepted tail never blocks on disk I/O: writes
 * coalesce per `(namespace, threadId)` onto a single background IO writer.
 */
class NativeRecentHistoryCache(
    initialDirectory: File? = null,
    ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) {
    @Serializable
    private data class Record(
        val formatVersion: Int,
        val namespace: String,
        val threadId: String,
        val bytes: Int,
        val tail: NativeRecentHistoryTail,
        val touchedEpochMs: Long,
    )

    @Serializable
    private data class Header(val formatVersion: Int)

    data class Candidate(
        val generation: Long,
        val tail: NativeRecentHistoryTail?,
    )

    private val lock = Any()
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val writerScope = CoroutineScope(SupervisorJob() + ioDispatcher.limitedParallelism(1))
    @Volatile
    private var directory: File? = initialDirectory
    private val memory = LinkedHashMap<String, Record>(16, 0.75f, true)
    private val pendingWrites = LinkedHashMap<String, Record>()
    private var writerJob: Job? = null
    private var generation: Long = 0L

    /** Accounting for regression and performance evidence, not cache authority. */
    @Volatile var diskWriteCount: Int = 0
        private set
    @Volatile var diskBytesWritten: Int = 0
        private set

    fun configureDirectory(dir: File) {
        synchronized(lock) {
            directory = dir
        }
    }

    fun candidate(namespace: String, threadId: String): Candidate = synchronized(lock) {
        Candidate(generation = generation, tail = readLocked(namespace, threadId))
    }

    fun read(namespace: String, threadId: String): NativeRecentHistoryTail? = synchronized(lock) {
        readLocked(namespace, threadId)
    }

    fun store(
        tail: NativeRecentHistoryTail,
        namespace: String,
        threadId: String,
        expectedGeneration: Long? = null,
    ) {
        val record = synchronized(lock) {
            admitLocked(tail, namespace, threadId, expectedGeneration)
        } ?: return
        writeRecord(record)
    }

    /**
     * Admits [tail] into memory immediately and coalesces the disk write in
     * the background so rendering never waits on storage I/O.
     */
    fun enqueue(
        tail: NativeRecentHistoryTail,
        namespace: String,
        threadId: String,
        expectedGeneration: Long?,
    ) {
        synchronized(lock) {
            val record = admitLocked(tail, namespace, threadId, expectedGeneration) ?: return
            val key = digest(listOf(namespace, threadId))
            pendingWrites[key] = record
            pendingWrites.keys.retainAll(memory.keys)
            if (writerJob?.isActive == true) return
            val ownerGen = generation
            writerJob = writerScope.launch {
                drainWrites(ownerGen)
            }
        }
    }

    suspend fun flushPendingWrites() {
        val current = synchronized(lock) { writerJob }
        current?.join()
    }

    /** Releases in-memory copies under system memory pressure while preserving disk tails. */
    fun trimMemory() {
        synchronized(lock) {
            memory.clear()
        }
    }

    fun purgeAll() {
        val targetDir: File?
        val activeWriter: Job?
        synchronized(lock) {
            generation += 1L
            memory.clear()
            pendingWrites.clear()
            activeWriter = writerJob
            writerJob = null
            targetDir = directory
        }
        activeWriter?.cancel()
        targetDir?.deleteRecursively()
    }

    private fun readLocked(namespace: String, threadId: String): NativeRecentHistoryTail? {
        val key = digest(listOf(namespace, threadId))
        val cached = memory[key]
        if (cached != null) {
            val updated = cached.copy(touchedEpochMs = System.currentTimeMillis())
            memory[key] = updated
            fileFor(key)?.setLastModified(updated.touchedEpochMs)
            return updated.tail
        }
        val file = fileFor(key) ?: return null
        val raw = readFileBytes(file) ?: return null
        val record = runCatching {
            json.decodeFromString(Record.serializer(), raw.toString(Charsets.UTF_8))
        }.getOrNull() ?: return null
        if (
            record.formatVersion != FORMAT_VERSION ||
            record.namespace != namespace ||
            record.threadId != threadId ||
            record.bytes <= 0 ||
            record.bytes > MAXIMUM_TAIL_BYTES ||
            !record.tail.isValid()
        ) {
            return null
        }
        val reencodedBytes = encodeTailBytes(record.tail)?.size ?: return null
        if (reencodedBytes != record.bytes) return null
        val touched = record.copy(touchedEpochMs = System.currentTimeMillis())
        memory[key] = touched
        trimMemoryLocked()
        file.setLastModified(touched.touchedEpochMs)
        return touched.tail
    }

    private fun admitLocked(
        tail: NativeRecentHistoryTail,
        namespace: String,
        threadId: String,
        expectedGeneration: Long?,
    ): Record? {
        if (expectedGeneration != null && expectedGeneration != generation) return null
        val key = digest(listOf(namespace, threadId))
        val encoded = if (tail.isValid() && !tail.exceedsStringByteBudget(MAXIMUM_TAIL_BYTES)) {
            encodeTailBytes(tail)
        } else {
            null
        }
        if (encoded == null || encoded.size > MAXIMUM_TAIL_BYTES) {
            memory.remove(key)
            pendingWrites.remove(key)
            fileFor(key)?.let(::removeKnownFile)
            return null
        }
        val record = Record(
            formatVersion = FORMAT_VERSION,
            namespace = namespace,
            threadId = threadId,
            bytes = encoded.size,
            tail = tail,
            touchedEpochMs = System.currentTimeMillis(),
        )
        memory[key] = record
        trimMemoryLocked()
        return record
    }

    private suspend fun drainWrites(ownerGeneration: Long) {
        while (true) {
            val next = synchronized(lock) {
                if (ownerGeneration != generation) return
                val entry = pendingWrites.entries.minByOrNull { it.value.touchedEpochMs }
                    ?: run {
                        writerJob = null
                        return
                    }
                pendingWrites.remove(entry.key)
                entry.value
            }
            writeRecord(next)
            yield()
        }
    }

    private fun writeRecord(record: Record) {
        val dir = directory ?: return
        val key = digest(listOf(record.namespace, record.threadId))
        val target = File(dir, "$key.json")
        if (target.exists()) {
            val existing = readFileBytes(target) ?: return
            val header = runCatching {
                json.decodeFromString(Header.serializer(), existing.toString(Charsets.UTF_8))
            }.getOrNull() ?: return
            if (header.formatVersion != FORMAT_VERSION) return
        }
        val encoded = runCatching {
            json.encodeToString(Record.serializer(), record).toByteArray(Charsets.UTF_8)
        }.getOrNull() ?: return
        runCatching {
            if (!dir.exists()) {
                dir.mkdirs()
                dir.setReadable(false, false)
                dir.setWritable(false, false)
                dir.setExecutable(false, false)
                dir.setReadable(true, true)
                dir.setWritable(true, true)
                dir.setExecutable(true, true)
            }
            ProductionAtomicFileWriter.writeAtomically(target, encoded)
            target.setReadable(false, false)
            target.setWritable(false, false)
            target.setReadable(true, true)
            target.setWritable(true, true)
            diskWriteCount += 1
            diskBytesWritten += encoded.size
            pruneDisk(dir, excluding = target)
        }
    }

    private fun trimMemoryLocked() {
        var totalBytes = memory.values.sumOf { it.bytes }
        val iterator = memory.entries.iterator()
        while (iterator.hasNext() && (memory.size > MAXIMUM_ENTRIES || totalBytes > MAXIMUM_TOTAL_BYTES)) {
            totalBytes -= iterator.next().value.bytes
            iterator.remove()
        }
        pendingWrites.keys.retainAll(memory.keys)
    }

    private fun fileFor(key: String): File? = directory?.let { File(it, "$key.json") }

    private fun readFileBytes(file: File): ByteArray? {
        if (!file.isFile) return null
        val len = file.length()
        if (len <= 0L || len > MAXIMUM_TAIL_BYTES + 4_096L) return null
        return runCatching { file.readBytes() }.getOrNull()
    }

    private fun removeKnownFile(file: File) {
        val data = readFileBytes(file) ?: return
        val header = runCatching {
            json.decodeFromString(Header.serializer(), data.toString(Charsets.UTF_8))
        }.getOrNull() ?: return
        if (header.formatVersion == FORMAT_VERSION) {
            runCatching { file.delete() }
        }
    }

    private fun pruneDisk(dir: File, excluding: File) {
        val files = dir.listFiles { file -> file.isFile && file.extension == "json" } ?: return
        val sorted = files.sortedByDescending { it.lastModified() }
        var retainedBytes = excluding.length().coerceAtLeast(0L)
        var retainedCount = 1
        for (file in sorted) {
            if (file == excluding) continue
            val size = file.length().coerceAtLeast(0L)
            if (retainedCount < MAXIMUM_ENTRIES && retainedBytes + size <= MAXIMUM_TOTAL_BYTES) {
                retainedCount += 1
                retainedBytes += size
            } else {
                removeKnownFile(file)
            }
        }
    }

    private fun encodeTailBytes(tail: NativeRecentHistoryTail): ByteArray? = runCatching {
        json.encodeToString(NativeRecentHistoryTail.serializer(), tail).toByteArray(Charsets.UTF_8)
    }.getOrNull()

    companion object {
        const val FORMAT_VERSION: Int = 1
        const val MAXIMUM_TAIL_BYTES: Int = 2 * 1_024 * 1_024
        const val MAXIMUM_TOTAL_BYTES: Int = 8 * MAXIMUM_TAIL_BYTES
        const val MAXIMUM_ENTRIES: Int = 20
        const val DIRECTORY_NAME: String = "PoracodeRecentHistory-v1"

        val shared: NativeRecentHistoryCache = NativeRecentHistoryCache()

        fun digest(components: List<String>): String {
            val encoded = JsonArray(components.map { JsonPrimitive(it) }).toString()
            val hash = MessageDigest.getInstance("SHA-256")
                .digest(encoded.toByteArray(Charsets.UTF_8))
            return buildString(hash.size * 2) {
                for (b in hash) append("%02x".format(b.toInt() and 0xff))
            }
        }
    }
}
