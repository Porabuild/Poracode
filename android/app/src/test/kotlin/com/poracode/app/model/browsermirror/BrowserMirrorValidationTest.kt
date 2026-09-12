package com.poracode.app.model.browsermirror

import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BrowserMirrorValidationTest {
    private val metadata = BrowserFrameMetadata(1280.0, 720.0, 2.0, 0.0, 0.0, 0.0)

    @Test
    fun acceptsOnlyBoundedJpegFramesAndValidDimensions() {
        val jpeg = byteArrayOf(0xff.toByte(), 0xd8.toByte(), 1, 2, 0xff.toByte(), 0xd9.toByte())
        val encoded = Base64.getEncoder().encodeToString(jpeg)
        assertEquals(jpeg.toList(), BrowserFramePolicy.decodeJpeg("tab", encoded, metadata)?.jpegBytes?.toList())
        assertNull(BrowserFramePolicy.decodeJpeg("tab", "not base64!", metadata))
        assertNull(BrowserFramePolicy.decodeJpeg("tab", Base64.getEncoder().encodeToString(byteArrayOf(1, 2, 3, 4)), metadata))
        assertNull(BrowserFramePolicy.decodeJpeg("tab", encoded, metadata.copy(deviceWidth = 0.0)))
        assertNull(BrowserFramePolicy.decodeJpeg("tab", encoded, metadata.copy(deviceHeight = 20_000.0)))
        assertNull(BrowserFramePolicy.decodeJpeg("tab", encoded, metadata.copy(pageScaleFactor = Double.NaN)))
    }

    @Test
    fun insertTextLimitCountsKotlinUtf16UnitsAndKeysAreAllowlisted() {
        val astral = "👋"
        assertEquals(2, astral.length)
        BrowserInput.InsertText(astral.repeat(512))
        assertTrue(runCatching { BrowserInput.InsertText(astral.repeat(513)) }.isFailure)
        assertEquals(8, BrowserSafeKey.entries.size)
        BrowserSafeKey.entries.forEach { assertEquals(it, BrowserSafeKey.fromWire(it.wireValue)) }
        assertNull(BrowserSafeKey.fromWire("delete"))
        assertNull(BrowserSafeKey.fromWire("meta"))
    }
}
