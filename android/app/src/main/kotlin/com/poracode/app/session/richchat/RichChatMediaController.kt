package com.poracode.app.session.richchat

import com.poracode.app.chat.RichAttachmentPolicy
import com.poracode.app.chat.RichRemoteImageRef
import com.poracode.app.transport.richchat.AttachmentUploadBody
import com.poracode.app.transport.richchat.BinaryRequestPlan
import com.poracode.app.transport.richchat.MAX_IMAGE_RESPONSE_BYTES
import com.poracode.app.transport.richchat.RuntimeImagePathSegment
import com.poracode.app.transport.RemoteBinaryResponse
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.StateFlow

/** Validates attachment/image ownership before exposing any network request plan. */
class RichChatMediaController(
    private val session: StateFlow<RichChatHostLease?>,
    private val selection: StateFlow<RichChatThreadLease?>,
    private val gateway: RichChatSessionGateway,
    private val lifecycle: ForegroundOperationRegistry,
) {
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

    suspend fun loadLocalImage(path: String): RichChatOperationResult<RemoteBinaryResponse> {
        if (path.isEmpty()) return RichChatOperationResult.Failed(RichChatOperationFailure.InvalidRequest)
        val (host, failure) = session.currentLease(RichChatCapability.Read)
        if (!lifecycle.isForeground) {
            return RichChatOperationResult.Failed(RichChatOperationFailure.Backgrounded)
        }
        if (failure != null || host == null) return RichChatOperationResult.Failed(failure!!)
        return load(host) { gateway.loadLocalImage(host, path) }
    }

    suspend fun loadRuntimeImage(
        ref: RichRemoteImageRef,
    ): RichChatOperationResult<RemoteBinaryResponse> {
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
        return load(lease.host) {
            gateway.loadRuntimeImage(lease.host, lease.threadId, ref.itemId, path)
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
