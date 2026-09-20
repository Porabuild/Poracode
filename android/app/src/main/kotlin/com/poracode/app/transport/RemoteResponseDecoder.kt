package com.poracode.app.transport

import com.poracode.app.model.RemoteClientException
import com.poracode.app.model.RemoteHttpErrorPayload
import com.poracode.app.model.RemoteJson
import okhttp3.Response
import okhttp3.ResponseBody
import okio.Buffer

/** Incrementally bounds HTTP bodies before decoding either JSON text or binary image data. */
internal class RemoteResponseDecoder(private val maxBytes: Long) {
    fun text(response: Response, expectedStatus: Int? = null): String = response.use { value ->
        rejectDeclaredOversize(value)
        val body = readBuffer(value.body).readUtf8()
        if (value.code == 304 || !value.isSuccessful || value.code != (expectedStatus ?: value.code)) {
            throwFailure(value, body)
        }
        body
    }

    fun binary(response: Response, expectedStatus: Int? = null): RemoteBinaryResponse =
        response.use { value ->
            rejectDeclaredOversize(value)
            if (
                value.code == 304 ||
                !value.isSuccessful ||
                value.code != (expectedStatus ?: value.code)
            ) {
                throwFailure(value, readBuffer(value.body).readUtf8())
            }
            val contentType = value.body?.contentType()?.toString()
            RemoteBinaryResponse(
                bytes = readBuffer(value.body).readByteArray(),
                contentType = contentType,
            )
        }

    private fun rejectDeclaredOversize(response: Response) {
        val declaredLength = response.body?.contentLength() ?: -1L
        if (declaredLength <= maxBytes) return
        response.body?.close()
        throw tooLarge(response.code)
    }

    private fun readBuffer(body: ResponseBody?): Buffer {
        if (body == null) return Buffer()
        body.source().use { source ->
            val buffer = Buffer()
            val limit = maxBytes + 1
            var total = 0L
            while (total < limit) {
                val read = source.read(buffer, minOf(8192L, limit - total))
                if (read == -1L) break
                total += read
            }
            if (total > maxBytes) {
                buffer.clear()
                throw tooLarge(0)
            }
            return buffer
        }
    }

    private fun throwFailure(response: Response, body: String): Nothing {
        if (response.code == 304) {
            throw RemoteClientException(
                "Remote request returned 304 without a cached body.",
                status = 304,
                code = "not_modified",
            )
        }
        val payload = runCatching {
            RemoteJson.decodeFromString(RemoteHttpErrorPayload.serializer(), body)
        }.getOrNull()
        if (payload != null) {
            throw RemoteClientException(
                payload.error.message,
                status = response.code,
                code = payload.error.code,
            )
        }
        val htmlLike = body.trimStart().startsWith("<")
        throw RemoteClientException(
            if (htmlLike) {
                "That endpoint returned HTML instead of the desktop API. " +
                    "Use the desktop API endpoint from Remote Access settings."
            } else {
                "Remote request failed."
            },
            status = response.code,
            code = "request_failed",
        )
    }

    private fun tooLarge(status: Int) = RemoteClientException(
        "Remote response exceeds maximum size ($maxBytes bytes).",
        status = status,
        code = "response_too_large",
    )
}
