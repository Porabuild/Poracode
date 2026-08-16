package com.poracode.app.transport.richchat

import com.poracode.app.model.RemoteClientException
import com.poracode.app.transport.RemoteApiClient
import com.poracode.app.transport.RemoteBinaryResponse
import kotlinx.coroutines.CancellationException
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody
import okio.BufferedSink

fun interface RichChatBinaryBodyExecutor {
    suspend fun execute(plan: BinaryRequestPlan): RemoteBinaryResponse
}

/** Executes generated raw/binary plans through the same bounded, foreground-gated API client. */
class RichChatRemoteBodyExecutor internal constructor(
    private val http: RemoteApiClient,
) : RawAttachmentUploadExecutor, RichChatBinaryBodyExecutor {
    override suspend fun execute(plan: AttachmentUploadPlan, body: AttachmentUploadBody): String {
        requireUploadPlan(plan)
        val mediaType = plan.contentType.toMediaTypeOrNull()
            ?: throw RichChatInvalidRequestException("Attachment content type is invalid.")
        return http.requestRawText(
            path = plan.path,
            method = plan.method,
            query = plan.query,
            body = StreamingAttachmentRequestBody(mediaType, body),
            expectedStatus = plan.expectedStatus,
        )
    }

    override suspend fun execute(plan: BinaryRequestPlan): RemoteBinaryResponse {
        requireBinaryPlan(plan)
        return try {
            val response = http.requestBytes(
                path = plan.path,
                query = plan.query,
                expectedStatus = plan.expectedStatus,
            )
            val mediaType = response.contentType?.substringBefore(';')?.trim()?.lowercase()
            if (mediaType == null || !mediaType.startsWith("image/") || mediaType.length > 127) {
                throw RichChatInvalidResponseException()
            }
            response.copy(contentType = mediaType)
        } catch (_: CancellationException) {
            throw RichChatRequestCancelledException("binaryImage")
        } catch (error: RemoteClientException) {
            when {
                error.status == 401 || error.status == 403 ->
                    throw RichChatAuthorizationException(error.status)
                error.code == "response_too_large" ||
                    error.code == "invalid_response" ||
                    error.code == "not_modified" -> throw RichChatInvalidResponseException()
                error.isTransportFailure -> throw RichChatTransportUnavailableException()
                else -> throw RichChatRemoteRejectedException(error.status)
            }
        } catch (error: RichChatTransportException) {
            throw error
        } catch (_: Exception) {
            throw RichChatTransportUnavailableException()
        }
    }

    private fun requireUploadPlan(plan: AttachmentUploadPlan) {
        if (
            plan.method != "POST" ||
            plan.authKind != RichChatAuthKind.BEARER ||
            plan.bodyKind != RichChatBodyKind.RAW_UPLOAD ||
            plan.responseKind != RichChatResponseKind.JSON ||
            plan.contentLength !in 1..MAX_ATTACHMENT_BYTES
        ) {
            throw RichChatInvalidRequestException("Attachment request plan is incompatible.")
        }
    }

    private fun requireBinaryPlan(plan: BinaryRequestPlan) {
        if (
            plan.method != "GET" ||
            plan.authKind !in setOf(RichChatAuthKind.BEARER, RichChatAuthKind.BEARER_OR_QUERY) ||
            plan.bodyKind != RichChatBodyKind.EMPTY ||
            plan.responseKind != RichChatResponseKind.BINARY ||
            plan.maxResponseBytes != MAX_IMAGE_RESPONSE_BYTES
        ) {
            throw RichChatInvalidRequestException("Binary request plan is incompatible.")
        }
    }
}

private class StreamingAttachmentRequestBody(
    private val mediaType: MediaType,
    private val upload: AttachmentUploadBody,
) : RequestBody() {
    override fun contentType(): MediaType = mediaType

    override fun contentLength(): Long = upload.contentLength

    override fun writeTo(sink: BufferedSink) {
        upload.writeBoundedTo(sink)
    }
}
