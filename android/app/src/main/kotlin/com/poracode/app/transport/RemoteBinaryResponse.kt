package com.poracode.app.transport

/** Bounded binary response. Content type is untrusted display metadata, never a file extension. */
data class RemoteBinaryResponse(
    val bytes: ByteArray,
    val contentType: String?,
) {
    override fun equals(other: Any?): Boolean =
        other is RemoteBinaryResponse &&
            bytes.contentEquals(other.bytes) &&
            contentType == other.contentType

    override fun hashCode(): Int = 31 * bytes.contentHashCode() + (contentType?.hashCode() ?: 0)
}
