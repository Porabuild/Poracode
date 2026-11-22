package com.poracode.app.session.richchat

import com.poracode.app.chat.RichAttachmentPolicy
import com.poracode.app.chat.RichRemoteImageRef
import com.poracode.app.model.ProjectLocation
import com.poracode.app.transport.richchat.AttachmentUploadBody
import com.poracode.app.transport.richchat.BinaryRequestPlan
import com.poracode.app.transport.richchat.MAX_IMAGE_RESPONSE_BYTES
import com.poracode.app.transport.richchat.RuntimeImagePathSegment
import com.poracode.app.transport.RemoteBinaryResponse
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap

sealed interface RichImagePrefetchTarget {
    data class Local(val path: String) : RichImagePrefetchTarget
    data class Runtime(val ref: RichRemoteImageRef) : RichImagePrefetchTarget
}

/** Validates attachment/image ownership before exposing any network request plan. */
class RichChatMediaController(
    private val session: StateFlow<RichChatHostLease?>,
    private val selection: StateFlow<RichChatThreadLease?>,
    private val gateway: RichChatSessionGateway,
    private val lifecycle: ForegroundOperationRegistry,
    private val fetchScope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
) {
    val isReadyForUpload: Boolean
        get() = lifecycle.isForeground &&
            session.currentLease(RichChatCapability.Operate).second == null

    suspend fun uploadAttachment(
        name: String,
        contentType: String,
        body: AttachmentUploadBody,
    ): RichChatOperationResult<String> {
        val decision = RichAttachmentPolicy.evaluate(name, body.contentLength)
        if (!decision.accepted || contentType.isBlank() || '\r' in contentType || '\n' in contentType) {
            return RichChatOperationResult.Failed(RichChatOperationFailure.InvalidRequest)
        }
        val lease = prepare(RichChatCapability.Operate) ?: return currentRejection()
        return try {
            lifecycle.run { token ->
                val path = gateway.uploadAttachment(
                    lease.host,
                    lease.threadId,
                    name,
                    contentType,
                    body,
                )
                if (canPublish(lease) && lifecycle.isCurrent(token)) {
                    RichChatOperationResult.Success(path)
                } else {
                    RichChatOperationResult.Stale
                }
            }
        } catch (error: CancellationException) {
            throw error
        } catch (_: RichChatBackgroundException) {
            RichChatOperationResult.Failed(RichChatOperationFailure.Backgrounded)
        } catch (error: Exception) {
            if (!canPublish(lease)) return RichChatOperationResult.Stale
            RichChatOperationResult.Failed(
                error.asRichChatFailure(RichChatCapability.Operate, true),
            )
        }
    }

    /** Uploads media for a preallocated thread before it becomes the selected chat. */
    suspend fun uploadAttachmentForThread(
        threadId: String,
        name: String,
        contentType: String,
        body: AttachmentUploadBody,
    ): RichChatOperationResult<String> {
        val decision = RichAttachmentPolicy.evaluate(name, body.contentLength)
        if (threadId.isBlank() || !decision.accepted || contentType.isBlank() ||
            '\r' in contentType || '\n' in contentType
        ) {
            return RichChatOperationResult.Failed(RichChatOperationFailure.InvalidRequest)
        }
        if (!lifecycle.isForeground) {
            return RichChatOperationResult.Failed(RichChatOperationFailure.Backgrounded)
        }
        val (host, failure) = session.currentLease(RichChatCapability.Operate)
        if (failure != null || host == null) {
            return RichChatOperationResult.Failed(checkNotNull(failure))
        }
        return try {
            lifecycle.run { token ->
                val path = gateway.uploadAttachment(host, threadId, name, contentType, body)
                if (session.isCurrent(host) && lifecycle.isCurrent(token)) {
                    RichChatOperationResult.Success(path)
                } else {
                    RichChatOperationResult.Stale
                }
            }
        } catch (error: CancellationException) {
            throw error
        } catch (_: RichChatBackgroundException) {
            RichChatOperationResult.Failed(RichChatOperationFailure.Backgrounded)
        } catch (error: Exception) {
            if (!session.isCurrent(host)) return RichChatOperationResult.Stale
            RichChatOperationResult.Failed(
                error.asRichChatFailure(RichChatCapability.Operate, true),
            )
        }
    }

    suspend fun localImagePlan(path: String): RichChatOperationResult<BinaryRequestPlan> {
        if (path.isEmpty()) return RichChatOperationResult.Failed(RichChatOperationFailure.InvalidRequest)
        val (host, failure) = session.currentLease(RichChatCapability.Read)
        if (!lifecycle.isForeground) {
            return RichChatOperationResult.Failed(RichChatOperationFailure.Backgrounded)
        }
        if (failure != null || host == null) return RichChatOperationResult.Failed(failure!!)
        return plan { gateway.localImagePlan(host, path) }
    }

    suspend fun runtimeImagePlan(ref: RichRemoteImageRef): RichChatOperationResult<BinaryRequestPlan> {
        val lease = prepare(RichChatCapability.Read) ?: return currentRejection()
        if (ref.threadId != lease.threadId || ref.bytes !in 0L..MAX_IMAGE_RESPONSE_BYTES) {
            return RichChatOperationResult.Failed(RichChatOperationFailure.InvalidRequest)
        }
        val path = ref.path.map {
            when (it) {
                is com.poracode.app.chat.RichImagePathPart.Key -> RuntimeImagePathSegment.Key(it.value)
                is com.poracode.app.chat.RichImagePathPart.Index -> RuntimeImagePathSegment.Index(it.value)
            }
        }
        return plan {
            gateway.runtimeImagePlan(lease.host, lease.threadId, ref.itemId, path)
        }
    }

    private data class ImageCacheKey(
        val hostKey: RichChatHostKey,
        val generation: Long,
        val kind: String,
        val id: String,
        val variant: String?,
    )

    private val imageCacheLock = Any()
    private val imageCache = LinkedHashMap<ImageCacheKey, RemoteBinaryResponse>(16, 0.75f, true)
    private var imageCacheBytes = 0L
    private var cachedHostKey: RichChatHostKey? = null
    private val inFlightImages =
        ConcurrentHashMap<ImageCacheKey, Deferred<RichChatOperationResult<RemoteBinaryResponse>>>()

    fun enterBackground() {
        cancelInFlightImages()
        clearImageCache()
    }

    fun clearImageCache() {
        synchronized(imageCacheLock) {
            imageCache.clear()
            imageCacheBytes = 0L
            cachedHostKey = null
        }
    }

    private fun cancelInFlightImages() {
        val active = inFlightImages.values.toList()
        inFlightImages.clear()
        active.forEach { it.cancel() }
    }

    private fun ensureCacheHost(hostKey: RichChatHostKey) {
        synchronized(imageCacheLock) {
            if (cachedHostKey != null && cachedHostKey != hostKey) {
                imageCache.clear()
                imageCacheBytes = 0L
            }
            cachedHostKey = hostKey
        }
    }

    private fun readCachedImage(key: ImageCacheKey): RemoteBinaryResponse? = synchronized(imageCacheLock) {
        imageCache[key]
    }

    /**
     * Coalesces concurrent requests for the same image on a decoupled
     * supervisor scope so cancelling one caller (for example scrolling a tile
     * off screen) never aborts the download for another active waiter. Shared
     * fetches cancel on [enterBackground] or host/lease invalidation.
     */
    private suspend fun loadCoalescedImage(
        cacheKey: ImageCacheKey,
        host: RichChatHostLease,
        fetch: suspend () -> RemoteBinaryResponse,
    ): RichChatOperationResult<RemoteBinaryResponse> {
        ensureCacheHost(host.key)
        readCachedImage(cacheKey)?.let { return RichChatOperationResult.Success(it) }
        if (cacheKey.variant != null) {
            readCachedImage(cacheKey.copy(variant = null))?.let {
                return RichChatOperationResult.Success(it)
            }
        }
        val deferred = inFlightImages.computeIfAbsent(cacheKey) { key ->
            fetchScope.async {
                try {
                    val result = load(host, fetch)
                    if (result is RichChatOperationResult.Success) {
                        storeCachedImage(key, result.value)
                    }
                    result
                } finally {
                    inFlightImages.remove(key)
                }
            }
        }
        return deferred.await()
    }

    private fun storeCachedImage(key: ImageCacheKey, value: RemoteBinaryResponse) {
        val size = value.bytes.size.toLong()
        if (size <= 0L || size > MAX_CACHED_IMAGE_BYTES) return
        synchronized(imageCacheLock) {
            imageCache.remove(key)?.let { imageCacheBytes -= it.bytes.size.toLong() }
            while (imageCache.isNotEmpty() &&
                (imageCacheBytes + size > MAX_CACHED_IMAGE_BYTES || imageCache.size >= MAX_CACHED_IMAGES)
            ) {
                val oldest = imageCache.entries.iterator()
                imageCacheBytes -= oldest.next().value.bytes.size.toLong()
                oldest.remove()
            }
            imageCache[key] = value
            imageCacheBytes += size
        }
    }

    suspend fun loadLocalImage(
        path: String,
        variant: String? = null,
    ): RichChatOperationResult<RemoteBinaryResponse> {
        if (path.isEmpty()) return RichChatOperationResult.Failed(RichChatOperationFailure.InvalidRequest)
        val (host, failure) = session.currentLease(RichChatCapability.Read)
        if (!lifecycle.isForeground) {
            clearImageCache()
            return RichChatOperationResult.Failed(RichChatOperationFailure.Backgrounded)
        }
        if (failure != null || host == null) return RichChatOperationResult.Failed(failure!!)
        val cacheKey = ImageCacheKey(host.key, host.generation, "local", path, variant)
        return loadCoalescedImage(cacheKey, host) { gateway.loadLocalImage(host, path, variant) }
    }

    suspend fun loadRuntimeImage(
        ref: RichRemoteImageRef,
        variant: String? = null,
    ): RichChatOperationResult<RemoteBinaryResponse> {
        if (!lifecycle.isForeground) clearImageCache()
        val lease = prepare(RichChatCapability.Read) ?: return currentRejection()
        if (ref.threadId != lease.threadId || ref.bytes !in 0L..MAX_IMAGE_RESPONSE_BYTES) {
            return RichChatOperationResult.Failed(RichChatOperationFailure.InvalidRequest)
        }
        val path = ref.path.map {
            when (it) {
                is com.poracode.app.chat.RichImagePathPart.Key -> RuntimeImagePathSegment.Key(it.value)
                is com.poracode.app.chat.RichImagePathPart.Index -> RuntimeImagePathSegment.Index(it.value)
            }
        }
        val refId = "${lease.threadId}:${ref.itemId}:${path.joinToString("/")}"
        val cacheKey = ImageCacheKey(lease.host.key, lease.host.generation, "runtime", refId, variant)
        return loadCoalescedImage(cacheKey, lease.host) {
            gateway.loadRuntimeImage(lease.host, lease.threadId, ref.itemId, path, variant)
        }
    }

    /**
     * Warms up to [limit] (default 4, matching PWA `#1361`) newest uncached
     * card images for the active thread in the background without blocking UI.
     */
    fun prefetchNewestImages(
        targets: List<RichImagePrefetchTarget>,
        limit: Int = DEFAULT_IMAGE_PREFETCH_LIMIT,
    ) {
        if (!lifecycle.isForeground || limit <= 0 || targets.isEmpty()) return
        val recent = targets.takeLast(limit).asReversed()
        for (target in recent) {
            fetchScope.launch {
                runCatching {
                    when (target) {
                        is RichImagePrefetchTarget.Local -> loadLocalImage(target.path, variant = "card")
                        is RichImagePrefetchTarget.Runtime -> loadRuntimeImage(target.ref, variant = "card")
                    }
                }
            }
        }
    }

    private companion object {
        const val MAX_CACHED_IMAGES = 64
        const val MAX_CACHED_IMAGE_BYTES = 24L * 1024L * 1024L
        const val DEFAULT_IMAGE_PREFETCH_LIMIT = 4
    }

    /**
     * One chat file-card download into a caller-owned private directory. Cards
     * download independently of the single upload slot; stale results on host
     * or thread replacement are discarded and the created directory removed.
     */
    suspend fun downloadFile(
        request: com.poracode.app.chat.RichChatFileAccess,
        projectLocation: ProjectLocation,
        suggestedName: String,
        destinationDirectory: java.io.File,
    ): RichChatOperationResult<com.poracode.app.transport.richchat.RichChatDownloadedFile> {
        val lease = prepare(RichChatCapability.Read) ?: return currentRejection()
        return try {
            lifecycle.run { token ->
                val result = gateway.downloadRichFile(
                    lease.host, request, projectLocation, suggestedName, destinationDirectory,
                )
                // Host AND selected thread must still match before the file is
                // published; a stale completion cleans its own directory.
                if (canPublish(lease) && lifecycle.isCurrent(token)) {
                    RichChatOperationResult.Success(result)
                } else {
                    result.directory.deleteRecursively()
                    RichChatOperationResult.Stale
                }
            }
        } catch (error: CancellationException) {
            throw error
        } catch (_: RichChatBackgroundException) {
            RichChatOperationResult.Failed(RichChatOperationFailure.Backgrounded)
        } catch (error: Exception) {
            if (!canPublish(lease)) {
                RichChatOperationResult.Stale
            } else {
                RichChatOperationResult.Failed(
                    error.asRichChatFailure(RichChatCapability.Read, false),
                )
            }
        }
    }

    private suspend inline fun plan(
        crossinline operation: suspend () -> BinaryRequestPlan,
    ): RichChatOperationResult<BinaryRequestPlan> =
        try {
            RichChatOperationResult.Success(operation())
        } catch (error: Exception) {
            RichChatOperationResult.Failed(
                error.asRichChatFailure(RichChatCapability.Read, false),
            )
        }

    private suspend inline fun load(
        host: RichChatHostLease,
        crossinline operation: suspend () -> RemoteBinaryResponse,
    ): RichChatOperationResult<RemoteBinaryResponse> = try {
        lifecycle.run { token ->
            val response = operation()
            if (session.isCurrent(host) && lifecycle.isCurrent(token)) {
                RichChatOperationResult.Success(response)
            } else {
                RichChatOperationResult.Stale
            }
        }
    } catch (error: CancellationException) {
        throw error
    } catch (_: RichChatBackgroundException) {
        RichChatOperationResult.Failed(RichChatOperationFailure.Backgrounded)
    } catch (error: Exception) {
        if (!session.isCurrent(host)) {
            RichChatOperationResult.Stale
        } else {
            RichChatOperationResult.Failed(
                error.asRichChatFailure(RichChatCapability.Read, false),
            )
        }
    }

    private fun prepare(capability: RichChatCapability): RichChatThreadLease? {
        if (!lifecycle.isForeground) return null
        val (host, failure) = session.currentLease(capability)
        if (failure != null || host == null) return null
        val current = selection.value ?: return null
        return current.copy(host = host).takeIf { current.host.key == host.key }
    }

    private fun currentRejection(): RichChatOperationResult.Failed {
        if (!lifecycle.isForeground) {
            return RichChatOperationResult.Failed(RichChatOperationFailure.Backgrounded)
        }
        val (_, failure) = session.currentLease(RichChatCapability.Read)
        return RichChatOperationResult.Failed(failure ?: RichChatOperationFailure.NoThread)
    }

    private fun canPublish(lease: RichChatThreadLease): Boolean {
        val current = selection.value ?: return false
        return lifecycle.isForeground && session.isCurrent(lease.host) && current == lease
    }
}
