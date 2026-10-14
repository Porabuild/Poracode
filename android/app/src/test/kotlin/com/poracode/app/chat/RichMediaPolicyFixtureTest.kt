package com.poracode.app.chat

import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RichMediaPolicyFixtureTest {
    @Test
    fun imageMarkersDecodeOnlyHostMintedSafeShapes() {
        val fixture = readRichFixture("rich-image-markers.json")
        val valid = fixture.getValue("valid").jsonObject
        val reference = RichImagePolicy.decodeRemoteRef(valid.getValue("nestedRef"))!!

        assertEquals("thread-rich", reference.threadId)
        assertEquals("image/webp", reference.mimeType)
        assertEquals(
            listOf(
                RichImagePathPart.Key("result"),
                RichImagePathPart.Key("content"),
                RichImagePathPart.Index(1),
                RichImagePathPart.Key("data"),
            ),
            reference.path,
        )
        assertEquals(8_388_608L, RichImagePolicy.decodeOmitted(valid.getValue("omitted"))!!.bytes)
        fixture.getValue("invalidRefs").jsonArray.forEach { invalid ->
            assertNull(RichImagePolicy.decodeRemoteRef(invalid.jsonObject.getValue("value")))
        }
    }

    @Test
    fun sharedDisplayPolicyRejectsRemoteLocalScriptAndNonImageSources() {
        val fixture = readRichFixture("rich-image-markers.json")
        fixture.getValue("sharedDisplayPolicyCases").jsonArray.forEach { case ->
            val source = case.jsonObject.getValue("source").stringOrNull()!!
            assertNull(case.jsonObject.getValue("id").stringOrNull(), RichImagePolicy.classify(source))
        }

        val content = readRichFixture("rich-content-blocks.json")
            .getValue("accepted")
            .jsonArray
            .mapNotNull { RichContentDecoder.decodeBlock(it.jsonObject.getValue("block")) }
            .filterIsInstance<RichContentBlock.Image>()
            .single()
        assertTrue(RichImagePolicy.contentBlockIsSafe(content))
        assertNotNull(RichImagePolicy.classify("<svg viewBox='0 0 1 1'>"))
        assertNotNull(RichImagePolicy.classify("iVBORw0KGgo"))
    }

    @Test
    fun attachmentFixtureLocksNameAndTwentyMiBBoundaries() {
        val fixture = readRichFixture("attachment-boundaries.json")
        assertEquals(
            fixture.getValue("limits").jsonObject.getValue("maxBytes").longOrStrictNull(),
            RichAttachmentPolicy.MAX_BODY_BYTES,
        )
        for (caseValue in fixture.getValue("cases").jsonArray) {
            val case = caseValue.jsonObject
            val bytes = case.getValue("bytes").longOrStrictNull()!!
            val nameLength = case.getValue("nameLength").longOrStrictNull()!!.toInt()
            val expected = case.getValue("expected").jsonObject
            val decision = RichAttachmentPolicy.evaluate("n".repeat(nameLength), bytes)

            assertEquals(expected.getValue("queryValid").booleanOrStrictNull(), decision.queryValid)
            assertEquals(
                expected.getValue("bodyWithinLimit").booleanOrStrictNull(),
                decision.bodyWithinLimit,
            )
            assertEquals(expected.getValue("accepted").booleanOrStrictNull(), decision.accepted)
            val expectedError = expected["error"]?.stringOrNull()
            assertEquals(expectedError, decision.error?.wireCode)
        }
    }
}
