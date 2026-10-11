package com.poracode.app.model.browsermirror

import java.util.Base64

object BrowserFramePolicy {
    const val MAX_MESSAGE_UTF16_UNITS = 12 * 1024 * 1024
    const val MAX_JPEG_BYTES = 8 * 1024 * 1024
    const val MAX_DEVICE_DIMENSION = 16_384.0

    fun decodeJpeg(
        tabId: String,
        base64: String,
        metadata: BrowserFrameMetadata,
    ): BrowserFrame? {
        if (tabId.isEmpty() || base64.length > MAX_MESSAGE_UTF16_UNITS) return null
        if (!metadata.isValid()) return null
        val estimatedBytes = (base64.length.toLong() * 3L) / 4L
        if (estimatedBytes > MAX_JPEG_BYTES) return null
        val bytes = try {
            Base64.getDecoder().decode(base64)
        } catch (_: IllegalArgumentException) {
            return null
        }
        if (bytes.size !in 4..MAX_JPEG_BYTES || !bytes.hasJpegMarkers()) return null
        return BrowserFrame(tabId, bytes, metadata)
    }

    private fun BrowserFrameMetadata.isValid(): Boolean =
        deviceWidth.isFinite() && deviceWidth in 1.0..MAX_DEVICE_DIMENSION &&
            deviceHeight.isFinite() && deviceHeight in 1.0..MAX_DEVICE_DIMENSION &&
            pageScaleFactor.isFinite() && pageScaleFactor > 0.0 &&
            offsetTop.isFinite() && scrollOffsetX.isFinite() && scrollOffsetY.isFinite()

    private fun ByteArray.hasJpegMarkers(): Boolean =
        this[0] == 0xff.toByte() && this[1] == 0xd8.toByte() &&
            this[lastIndex - 1] == 0xff.toByte() && this[lastIndex] == 0xd9.toByte()
}
