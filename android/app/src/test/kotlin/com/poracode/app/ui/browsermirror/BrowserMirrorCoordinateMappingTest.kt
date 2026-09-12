package com.poracode.app.ui.browsermirror

import com.poracode.app.model.RemoteJson
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Verifies the exact letterbox/coordinate mapping against every case in the shared
 * browser-mirror fixture (`coordinateMapping`), consumed directly — no duplicated JSON.
 */
class BrowserMirrorCoordinateMappingTest {
    @Test
    fun mapsEveryFixtureCoordinateCaseWithExactLetterboxSemantics() {
        val rawArray = fixture().getValue("coordinateMapping") as JsonArray
        assertTrue("fixture must provide coordinate cases", rawArray.isNotEmpty())

        rawArray.forEach { element ->
            val case = element.jsonObject
            val id = case.getValue("id").jsonPrimitive.content
            val image = case.getValue("image").jsonObject
            val device = case.getValue("device").jsonObject
            val point = case.getValue("point").jsonObject
            val expected = case.getValue("expectedPagePoint")

            val mapped = mapBrowserMirrorImage(
                image = BrowserMirrorRect(
                    left = image.getValue("left").jsonPrimitive.content.toDouble(),
                    top = image.getValue("top").jsonPrimitive.content.toDouble(),
                    width = image.getValue("width").jsonPrimitive.content.toDouble(),
                    height = image.getValue("height").jsonPrimitive.content.toDouble(),
                ),
                deviceWidth = device.getValue("width").jsonPrimitive.content.toDouble(),
                deviceHeight = device.getValue("height").jsonPrimitive.content.toDouble(),
            )
            assertNotNull("mapping should be defined for $id", mapped)
            val result = mapped!!.point(
                point.getValue("x").jsonPrimitive.content.toDouble(),
                point.getValue("y").jsonPrimitive.content.toDouble(),
            )
            if (expected.toString() == "null") {
                assertNull("$id should fall outside the letterboxed image", result)
            } else {
                assertNotNull("$id should land inside the letterboxed image", result)
                val expectedObj = expected.jsonObject
                assertEquals(
                    "$id page x",
                    expectedObj.getValue("x").jsonPrimitive.content.toDouble(),
                    result!!.x,
                    0.001,
                )
                assertEquals(
                    "$id page y",
                    expectedObj.getValue("y").jsonPrimitive.content.toDouble(),
                    result.y,
                    0.001,
                )
            }
        }
    }

    @Test
    fun rejectsDegenerateImageOrDeviceDimensions() {
        assertNull(mapBrowserMirrorImage(BrowserMirrorRect(0.0, 0.0, 0.0, 100.0), 100.0, 100.0))
        assertNull(mapBrowserMirrorImage(BrowserMirrorRect(0.0, 0.0, 100.0, 100.0), 0.0, 100.0))
    }

    private fun fixture(): kotlinx.serialization.json.JsonObject {
        val stream = javaClass.classLoader!!.getResourceAsStream("fixtures/browser-mirror.json")
            ?: error("Missing browser mirror fixture")
        return RemoteJson.parseToJsonElement(stream.bufferedReader().use { it.readText() }).jsonObject
    }
}
